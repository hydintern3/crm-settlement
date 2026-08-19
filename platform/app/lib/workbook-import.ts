import * as XLSX from "xlsx";
import { buildSnapshot, mergeBusinessRows, normalizeSnapshot, toBusinessRow, type BusinessRow, type RawRow, type SheetSource, type Snapshot } from "./data-model.ts";

export type InspectedSheet = SheetSource & {
  id: string;
  columns: string[];
  rows: RawRow[];
};

export type VersionSnapshotSource = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: Snapshot;
};

type BusinessCandidate = {
  row: ReturnType<typeof toBusinessRow>;
  phase: number | null;
  sourceIndex: number;
  rowIndex: number;
};

const BUSINESS_MARKERS = ["设备编号", "业务属性", "业务名称", "计量规则", "月平均计量", "完工日期", "负责人", "I服务编号"];
const PROVIDER_MARKERS = ["服务编号", "服务状态", "服务商"];
const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_SHEETS = 100;
const MAX_ROWS_PER_SHEET = 100_000;
const MAX_TOTAL_ROWS = 250_000;

function classify(columns: string[]): InspectedSheet["kind"] {
  const compact = columns.map((column) => column.replace(/\s/g, ""));
  const businessHits = BUSINESS_MARKERS.filter((marker) => compact.some((column) => column.includes(marker))).length;
  const providerHits = PROVIDER_MARKERS.filter((marker) => compact.some((column) => column.includes(marker))).length;
  if (businessHits >= 2) return "business";
  if (providerHits >= 2) return "provider";
  return "unknown";
}

function friendlyImportError(error: unknown, fileName: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt|protected/i.test(message)) {
    return new Error(`${fileName} 是加密或受保护工作簿，浏览器无法安全解密。请先在 Excel 中另存为未加密副本，或导出为 CSV 后再导入。`);
  }
  return new Error(`无法读取 ${fileName}：${message || "文件格式不受支持或文件已损坏"}`);
}

export async function inspectWorkbookFiles(files: File[]): Promise<InspectedSheet[]> {
  const supported = files.filter((file) => /\.(csv|xls|xlsx|xlsm|xlsb|ods)$/i.test(file.name));
  if (!supported.length) throw new Error("请选择 CSV、XLS、XLSX、XLSM、XLSB 或 ODS 文件。");
  if (supported.length > MAX_FILES) throw new Error(`一次最多导入 ${MAX_FILES} 个文件，请分批处理。`);
  const oversized = supported.find((file) => file.size > MAX_FILE_BYTES);
  if (oversized) throw new Error(`${oversized.name} 超过 25 MB，请拆分工作簿后再导入。`);
  const totalBytes = supported.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("本次文件总大小超过 100 MB，请分批导入。");

  const sheets: InspectedSheet[] = [];
  let totalRows = 0;
  for (const file of supported) {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = /\.csv$/i.test(file.name)
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string", cellDates: true, dense: true, bookDeps: false, bookFiles: false, bookVBA: false, WTF: false })
        : XLSX.read(buffer, { type: "array", cellDates: true, dense: true, bookDeps: false, bookFiles: false, bookVBA: false, WTF: false });
      if (sheets.length + workbook.SheetNames.length > MAX_SHEETS) throw new Error(`工作表总数超过 ${MAX_SHEETS} 个，请分批导入。`);
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: "", raw: true, dateNF: "yyyy-mm-dd" });
        if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`${file.name} / ${sheetName} 超过 ${MAX_ROWS_PER_SHEET.toLocaleString("zh-CN")} 行，请拆分后再导入。`);
        totalRows += rows.length;
        if (totalRows > MAX_TOTAL_ROWS) throw new Error(`本次数据总行数超过 ${MAX_TOTAL_ROWS.toLocaleString("zh-CN")} 行，请分批导入。`);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        sheets.push({
          id: `${file.name}::${sheetName}`,
          fileName: file.name,
          sheetName,
          kind: classify(columns),
          rowCount: rows.length,
          columns,
          rows,
        });
      }
    } catch (error) {
      throw friendlyImportError(error, file.name);
    }
  }
  return sheets;
}

function phaseNumber(sheet: InspectedSheet) {
  const matches = [...`${sheet.fileName} ${sheet.sheetName}`.matchAll(/(\d+)期/g)];
  return matches.length ? Math.max(...matches.map((match) => Number(match[1]))) : null;
}

function shouldReplace(existing: BusinessCandidate, candidate: BusinessCandidate) {
  if (existing.phase !== null && candidate.phase !== null && existing.phase !== candidate.phase) return candidate.phase > existing.phase;
  if (existing.row.completedDate && candidate.row.completedDate && existing.row.completedDate !== candidate.row.completedDate) return candidate.row.completedDate > existing.row.completedDate;
  return candidate.sourceIndex > existing.sourceIndex || (candidate.sourceIndex === existing.sourceIndex && candidate.rowIndex > existing.rowIndex);
}

function deduplicateCandidates(candidates: BusinessCandidate[]) {
  const byDevice = new Map<string, BusinessCandidate>();
  const blankKeyRows: BusinessCandidate[] = [];
  const duplicateKeys = new Set<string>();
  let removedRows = 0;
  for (const candidate of candidates) {
    const key = candidate.row.deviceCode;
    if (!key) {
      blankKeyRows.push(candidate);
      continue;
    }
    const existing = byDevice.get(key);
    if (!existing) {
      byDevice.set(key, candidate);
      continue;
    }
    duplicateKeys.add(key);
    removedRows += 1;
    if (shouldReplace(existing, candidate)) byDevice.set(key, candidate);
  }
  return {
    rows: [...byDevice.values(), ...blankKeyRows].map((candidate) => candidate.row),
    summary: {
      keyField: "设备编号" as const,
      inputRows: candidates.length,
      outputRows: byDevice.size + blankKeyRows.length,
      removedRows,
      duplicateKeys: duplicateKeys.size,
      blankKeyRows: blankKeyRows.length,
      strategy: "同一设备优先保留较高期次；无期次时保留完工日期较新记录；设备编号为空不自动合并",
    },
  };
}

export function snapshotFromSheets(allSheets: InspectedSheet[], businessIds: string[], providerId?: string): Snapshot {
  const selectedBusinessSheets = businessIds.map((id) => allSheets.find((sheet) => sheet.id === id)).filter((sheet): sheet is InspectedSheet => Boolean(sheet));
  if (!selectedBusinessSheets.length) throw new Error("请至少选择一个业务数据工作表。");
  const providerSheet = providerId ? allSheets.find((sheet) => sheet.id === providerId) : undefined;
  const candidates = selectedBusinessSheets.flatMap((sheet, sourceIndex) => sheet.rows.map((rawRow, rowIndex) => ({ row: toBusinessRow(rawRow), phase: phaseNumber(sheet), sourceIndex, rowIndex })));
  const deduplicated = deduplicateCandidates(candidates);
  const rows = deduplicated.rows;
  if (!rows.length) throw new Error("所选业务工作表没有可用数据行。");

  const files = [...new Set([...selectedBusinessSheets.map((sheet) => sheet.fileName), providerSheet?.fileName].filter((value): value is string => Boolean(value)))];
  return buildSnapshot(rows, {
    label: "浏览器本地导入",
    files,
    currentFile: selectedBusinessSheets.map((sheet) => `${sheet.fileName} / ${sheet.sheetName}`).join("；"),
    sheets: allSheets.map(({ fileName, sheetName, kind, rowCount }) => ({ fileName, sheetName, kind, rowCount })),
    deduplication: deduplicated.summary,
  });
}

export function mergeVersionSnapshots(sources: VersionSnapshotSource[]): Snapshot {
  if (sources.length < 2) throw new Error("请至少选择两个数据版本进行整合。");
  const ordered = [...sources].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const byDevice = new Map<string, BusinessRow>();
  const blankKeyRows: BusinessRow[] = [];
  const duplicateKeys = new Set<string>();
  let inputRows = 0;
  for (const source of ordered) {
    const rows = normalizeSnapshot(source.snapshot).rows;
    inputRows += rows.length;
    for (const row of rows) {
      if (!row.deviceCode) {
        blankKeyRows.push(row);
        continue;
      }
      const existing = byDevice.get(row.deviceCode);
      if (existing) {
        duplicateKeys.add(row.deviceCode);
        byDevice.set(row.deviceCode, mergeBusinessRows(existing, row));
      } else {
        byDevice.set(row.deviceCode, row);
      }
    }
  }
  const rows = [...byDevice.values(), ...blankKeyRows];
  if (!rows.length) throw new Error("所选数据版本没有可整合的业务记录。");
  const files = [...new Set(ordered.flatMap((source) => source.snapshot.source.files))];
  const sheets = ordered.flatMap((source) => source.snapshot.source.sheets ?? []);
  return buildSnapshot(rows, {
    label: "多个 CRM 全量版本整合",
    files,
    currentFile: ordered.map((source) => source.label).join("；"),
    sheets,
    deduplication: {
      keyField: "设备编号",
      inputRows,
      outputRows: rows.length,
      removedRows: inputRows - rows.length,
      duplicateKeys: duplicateKeys.size,
      blankKeyRows: blankKeyRows.length,
      strategy: "按版本发布时间从旧到新整合；同一设备编号由较新版本的非空字段覆盖，较新空值保留已有值；设备编号为空的记录全部保留",
    },
  });
}
