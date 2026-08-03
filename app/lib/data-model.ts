export type NumericValue = number | null;

export type BusinessRow = {
  businessType: string;
  businessName: string;
  owner: string;
  provider: string;
  serviceCode: string;
  serviceName: string;
  completedDate: string;
  activeStatus: string;
  meteringRule: string;
  lines: NumericValue;
  monthlyMetering: NumericValue;
};

export type RankedItem = {
  key: string;
  label: string;
  secondary?: string;
  lines: number;
  amount: NumericValue;
  share: NumericValue;
};

export type SheetSource = {
  fileName: string;
  sheetName: string;
  kind: "business" | "provider" | "unknown";
  rowCount: number;
};

export type Snapshot = {
  mode: "local" | "imported" | "empty";
  generatedAt: string;
  source: {
    label: string;
    files: string[];
    currentFile: string;
    sheets?: SheetSource[];
  };
  summary: {
    total: NumericValue;
    active: NumericValue;
    installs: NumericValue;
    removals: NumericValue;
    monthlyMetering: NumericValue;
    review: NumericValue;
  };
  monthly: Array<{ month: string; installs: number; removals: number; amount: NumericValue }>;
  meteringRules: Array<{ label: string; value: number; color: string }>;
  owners: RankedItem[];
  providers: RankedItem[];
  rows: BusinessRow[];
};

export type RawRow = Record<string, unknown>;

const RULE_COLORS: Record<string, string> = {
  新增量: "#2764e7",
  新量: "#11876b",
  存量: "#d08b24",
  超期: "#cb5a69",
};

export const EMPTY_SNAPSHOT: Snapshot = {
  mode: "empty",
  generatedAt: new Date(0).toISOString(),
  source: { label: "尚未导入数据", files: [], currentFile: "--", sheets: [] },
  summary: { total: null, active: null, installs: null, removals: null, monthlyMetering: null, review: null },
  monthly: [],
  meteringRules: [],
  owners: [],
  providers: [],
  rows: [],
};

export function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function numericValue(value: unknown): NumericValue {
  const source = textValue(value);
  if (!source) return null;
  const parsed = Number(source.replace(/[￥¥,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function dateValue(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const source = textValue(value);
  const match = source.match(/(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : source.slice(0, 10);
}

function first(row: RawRow, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return "";
}

export function toBusinessRow(row: RawRow): BusinessRow {
  return {
    businessType: textValue(first(row, ["业务属性", "业务类型"])),
    businessName: textValue(first(row, ["业务名称", "产品名称"])),
    owner: textValue(first(row, ["负责人", "销售负责人", "客户经理"])),
    provider: textValue(first(row, ["供应商", "服务商", "服务提供商"])),
    serviceCode: textValue(first(row, ["I服务编号", "I 服务编号", "服务编号"])),
    serviceName: textValue(first(row, ["I服务简称", "I 服务简称", "服务简称"])),
    completedDate: dateValue(first(row, ["完工日期", "业务完工日期", "开通日期"])),
    activeStatus: textValue(first(row, ["活跃状态", "服务状态"])),
    meteringRule: textValue(first(row, ["计量规则"])),
    lines: numericValue(first(row, ["线数", "数量"])),
    monthlyMetering: numericValue(first(row, ["月平均计量", "月均计量", "月平均金额"])),
  };
}

function sumKnown(values: NumericValue[]): NumericValue {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function isRemoval(row: BusinessRow) {
  return /拆机|退订|注销/.test(row.businessType);
}

function isInstall(row: BusinessRow) {
  return /新装|新增|开通/.test(row.businessType);
}

function isActive(row: BusinessRow) {
  return row.activeStatus === "活跃" || row.activeStatus === "正常";
}

function needsReview(row: BusinessRow) {
  return !row.meteringRule || row.monthlyMetering === null || /年付|两年付/.test(row.businessName);
}

function buildRanking(rows: BusinessRow[], field: "owner" | "provider"): RankedItem[] {
  const groups = new Map<string, { lines: number; amounts: NumericValue[] }>();
  for (const row of rows) {
    const key = row[field];
    if (!key) continue;
    const item = groups.get(key) ?? { lines: 0, amounts: [] };
    item.lines += row.lines ?? 1;
    item.amounts.push(row.monthlyMetering);
    groups.set(key, item);
  }
  const items = [...groups.entries()].map(([key, item]) => ({ key, label: key, lines: item.lines, amount: sumKnown(item.amounts), share: null }));
  const total = sumKnown(items.map((item) => item.amount));
  return items
    .map((item) => ({ ...item, share: total && item.amount !== null ? (item.amount / total) * 100 : null }))
    .sort((left, right) => (right.amount ?? -Infinity) - (left.amount ?? -Infinity));
}

export function summarizeRows(rows: BusinessRow[]) {
  if (!rows.length) return EMPTY_SNAPSHOT.summary;
  return {
    total: rows.length,
    active: rows.filter(isActive).length,
    installs: rows.filter(isInstall).length,
    removals: rows.filter(isRemoval).length,
    monthlyMetering: sumKnown(rows.map((row) => row.monthlyMetering)),
    review: rows.filter(needsReview).length,
  };
}

export function buildSnapshot(
  rows: BusinessRow[],
  source: Snapshot["source"],
  mode: Snapshot["mode"] = "imported",
): Snapshot {
  const monthlyMap = new Map<string, { installs: number; removals: number; amounts: NumericValue[] }>();
  const ruleMap = new Map<string, number>();
  for (const row of rows) {
    const month = row.completedDate.match(/^\d{4}-(\d{2})/)?.[1];
    if (month) {
      const item = monthlyMap.get(month) ?? { installs: 0, removals: 0, amounts: [] };
      if (isInstall(row)) item.installs += 1;
      if (isRemoval(row)) item.removals += 1;
      item.amounts.push(row.monthlyMetering);
      monthlyMap.set(month, item);
    }
    if (row.meteringRule) ruleMap.set(row.meteringRule, (ruleMap.get(row.meteringRule) ?? 0) + 1);
  }
  return {
    mode,
    generatedAt: new Date().toISOString(),
    source,
    summary: summarizeRows(rows),
    monthly: [...monthlyMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, item]) => ({ month, installs: item.installs, removals: item.removals, amount: sumKnown(item.amounts) })),
    meteringRules: [...ruleMap.entries()].map(([label, value], index) => ({ label, value, color: RULE_COLORS[label] ?? ["#7657d5", "#2a91a8", "#8b6a4f"][index % 3] })),
    owners: buildRanking(rows, "owner"),
    providers: buildRanking(rows, "provider"),
    rows,
  };
}

export function normalizeSnapshot(input: Partial<Snapshot>): Snapshot {
  const rows = Array.isArray(input.rows) ? input.rows.map((row) => ({
    ...row,
    provider: row.provider ?? "",
    lines: row.lines === undefined ? null : row.lines,
    monthlyMetering: row.monthlyMetering === undefined ? null : row.monthlyMetering,
  })) : [];
  if (!rows.length) return EMPTY_SNAPSHOT;
  return buildSnapshot(rows, input.source ?? { label: "本地快照", files: [], currentFile: "--" }, input.mode === "imported" ? "imported" : "local");
}
