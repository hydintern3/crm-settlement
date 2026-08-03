import * as XLSX from "xlsx";
import { buildSnapshot, toBusinessRow, type RawRow, type SheetSource, type Snapshot } from "./data-model";

export type InspectedSheet = SheetSource & {
  id: string;
  columns: string[];
  rows: RawRow[];
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
        const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
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

export function snapshotFromSheets(allSheets: InspectedSheet[], businessId: string, providerId?: string): Snapshot {
  const businessSheet = allSheets.find((sheet) => sheet.id === businessId);
  if (!businessSheet) throw new Error("请选择一个业务数据工作表。");
  const providerSheet = providerId ? allSheets.find((sheet) => sheet.id === providerId) : undefined;
  const rows = businessSheet.rows.map(toBusinessRow);
  if (!rows.length) throw new Error("所选业务工作表没有可用数据行。");

  const files = [...new Set([businessSheet.fileName, providerSheet?.fileName].filter((value): value is string => Boolean(value)))];
  return buildSnapshot(rows, {
    label: "浏览器本地导入",
    files,
    currentFile: `${businessSheet.fileName} / ${businessSheet.sheetName}`,
    sheets: allSheets.map(({ fileName, sheetName, kind, rowCount }) => ({ fileName, sheetName, kind, rowCount })),
  });
}
