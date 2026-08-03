import * as XLSX from "xlsx";
import { buildSnapshot, toBusinessRow, type RawRow, type SheetSource, type Snapshot } from "./data-model";

export type InspectedSheet = SheetSource & {
  id: string;
  columns: string[];
  rows: RawRow[];
};

type BusinessCandidate = {
  row: ReturnType<typeof toBusinessRow>;
  phase: number | null;
  sourceIndex: number;
  rowIndex: number;
};

const BUSINESS_MARKERS = ["业务属性", "业务名称", "计量规则", "月平均计量"];
const PROVIDER_MARKERS = ["服务编号", "服务状态", "服务商"];

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

  const sheets: InspectedSheet[] = [];
  for (const file of supported) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: "", raw: true, dateNF: "yyyy-mm-dd" });
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
