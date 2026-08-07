export type NumericValue = number | null;

export type BusinessRow = {
  businessType: string;
  businessName: string;
  owner: string;
  provider: string;
  deviceCode: string;
  serviceCode: string;
  serviceName: string;
  serviceCodeII: string;
  serviceNameII: string;
  initialCompletedDate: string;
  rawCompletedDate: string;
  completedDate: string;
  completionDateSource: "初始完工日期" | "完工日期兜底" | "缺失";
  activeStatus: string;
  meteringRule: string;
  sourceMeteringRule: string;
  calculationRuleSource: "CRM静态结果" | "平台动态计算";
  lines: NumericValue;
  monthlyMetering: NumericValue;
  discountedTariff: NumericValue;
  marketingFee: NumericValue;
  paymentCycle: string;
  providerCategory: string;
  belowAuthorizedPrice: string;
  grossProfit: NumericValue;
};

export type CalculationRuleConfig = {
  enabled: boolean;
  version: string;
  baseDate: string;
  incrementalYear: number;
  newVolumeMonths: number;
  overdueMonths: number;
  removalRateDenominator: "total" | "installs";
};

export type BusinessProgressRow = {
  key: string;
  label: string;
  totalLines: number;
  installs: number;
  installMonthlyMetering: NumericValue;
  removals: number;
  removalMonthlyMetering: NumericValue;
  removalRate: NumericValue;
  netGrowth: number;
  netMonthlyMetering: NumericValue;
  netAverageTariff: NumericValue;
  monthlyMetering: NumericValue;
  newGrossProfit: NumericValue;
  stockGrossProfit: NumericValue;
};

export type PerformanceRow = {
  key: string;
  label: string;
  secondary: string;
  lines: number;
  amount: NumericValue;
  average: NumericValue;
  share: NumericValue;
  rank: number;
};

export type MonthlyBusinessRow = {
  month: string;
  installs: number;
  installAmount: NumericValue;
  removals: number;
  removalAmount: NumericValue;
  activeLines: number;
  activeAmount: NumericValue;
  installRemovalRatio: NumericValue;
};

export type NetGrowthRow = {
  owner: string;
  installs: number;
  installAmount: NumericValue;
  removals: number;
  removalAmount: NumericValue;
  netLines: number;
  netAmount: NumericValue;
  installRemovalRatio: NumericValue;
};

export type CompletionCohortRow = {
  month: string;
  lines: number;
  activeLines: number;
  removalLines: number;
  activeRate: NumericValue;
  monthlyMetering: NumericValue;
  activeMonthlyMetering: NumericValue;
};

export type DataQualityMetric = {
  key: string;
  label: string;
  value: number;
  status: "pass" | "review";
  description: string;
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
    deduplication?: {
      keyField: "设备编号";
      inputRows: number;
      outputRows: number;
      removedRows: number;
      duplicateKeys: number;
      blankKeyRows: number;
      strategy: string;
    };
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
  providersII: RankedItem[];
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
  providersII: [],
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
  if (typeof value === "number" && value >= 1 && value < 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.floor(value) * 86400000);
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }
  const source = textValue(value);
  const match = source.match(/(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const shortYear = source.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/);
  return shortYear ? `20${shortYear[3]}-${shortYear[1].padStart(2, "0")}-${shortYear[2].padStart(2, "0")}` : source.slice(0, 10);
}

function first(row: RawRow, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return "";
}

export function toBusinessRow(row: RawRow): BusinessRow {
  const initialCompletedDate = dateValue(first(row, ["初始完工日期"]));
  const rawCompletedDate = dateValue(first(row, ["完工日期"]));
  const completedDate = initialCompletedDate || rawCompletedDate;
  const sourceMeteringRule = textValue(first(row, ["计量规则"]));
  return {
    businessType: textValue(first(row, ["业务属性", "业务类型"])),
    businessName: textValue(first(row, ["业务名称", "产品名称"])),
    owner: textValue(first(row, ["负责人", "销售负责人", "客户经理"])),
    provider: textValue(first(row, ["供应商", "供应商名称"])),
    deviceCode: textValue(first(row, ["设备编号", "设备号"])),
    serviceCode: textValue(first(row, ["I服务编号", "I 服务编号", "服务编号"])),
    serviceName: textValue(first(row, ["I服务简称", "I 服务简称", "服务简称"])),
    serviceCodeII: textValue(first(row, ["II服务编号", "II 服务编号"])),
    serviceNameII: textValue(first(row, ["II服务简称", "II 服务简称"])),
    initialCompletedDate,
    rawCompletedDate,
    completedDate,
    completionDateSource: initialCompletedDate ? "初始完工日期" : rawCompletedDate ? "完工日期兜底" : "缺失",
    activeStatus: textValue(first(row, ["活跃状态", "服务状态"])),
    meteringRule: sourceMeteringRule,
    sourceMeteringRule,
    calculationRuleSource: "CRM静态结果",
    lines: numericValue(first(row, ["线数", "数量"])),
    monthlyMetering: numericValue(first(row, ["月平均计量", "月均计量", "月平均金额"])),
    discountedTariff: numericValue(first(row, ["优惠资费", "年优惠资费"])),
    marketingFee: numericValue(first(row, ["增值", "营销增值费用", "I 营销", "I营销"])),
    paymentCycle: textValue(first(row, ["付费周期", "付款周期"])),
    providerCategory: textValue(first(row, ["I 服务分类", "I服务分类", "服务分类"])),
    belowAuthorizedPrice: textValue(first(row, ["是否低于授权价"])),
    grossProfit: numericValue(first(row, ["业务毛利（完成）", "业务毛利(完成)", "业务毛利（未完成）", "业务毛利(未完成)", "业务毛利"])),
  };
}

function sumKnown(values: NumericValue[]): NumericValue {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function isRemoval(row: BusinessRow) {
  return /拆机|退订|注销/.test(row.businessType);
}

export function isInstall(row: BusinessRow) {
  return /新装|新增|开通/.test(row.businessType);
}

export function isActive(row: BusinessRow) {
  return row.activeStatus === "活跃" || row.activeStatus === "正常";
}

function needsReview(row: BusinessRow) {
  return !row.meteringRule || row.monthlyMetering === null || /年付|两年付/.test(row.businessName);
}

function buildRanking(rows: BusinessRow[], field: "owner" | "provider" | "service" | "service2"): RankedItem[] {
  const groups = new Map<string, { lines: number; amounts: NumericValue[] }>();
  for (const row of rows) {
    const key = field === "service" ? row.serviceCode : field === "service2" ? row.serviceCodeII : row[field];
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

function lineCount(row: BusinessRow) {
  return row.lines ?? 1;
}

export function buildPerformance(
  rows: BusinessRow[],
  field: "owner" | "provider" | "service" | "service2",
  options: { removalsOnly?: boolean; amount?: "monthlyMetering" | "discountedTariff" | "marketingFee" } = {},
): PerformanceRow[] {
  const amountField = options.amount ?? "monthlyMetering";
  const groups = new Map<string, { label: string; secondary: string; lines: number; amounts: NumericValue[] }>();
  for (const row of rows) {
    if (options.removalsOnly && !isRemoval(row)) continue;
    const key = field === "service" ? row.serviceCode : field === "service2" ? row.serviceCodeII : row[field];
    if (!key) continue;
    const label = field === "service" ? row.serviceCode : field === "service2" ? row.serviceCodeII : key;
    const secondary = field === "service" ? row.serviceName : field === "service2" ? row.serviceNameII : "";
    const item = groups.get(key) ?? { label, secondary, lines: 0, amounts: [] };
    item.lines += lineCount(row);
    item.amounts.push(row[amountField]);
    if (!item.secondary && secondary) item.secondary = secondary;
    groups.set(key, item);
  }
  const base = [...groups.entries()].map(([key, item]) => ({ key, ...item, amount: sumKnown(item.amounts) }));
  const total = sumKnown(base.map((item) => item.amount));
  return base
    .map((item) => ({
      ...item,
      average: item.amount === null ? null : item.amount / Math.max(item.lines, 1),
      share: total && item.amount !== null ? (item.amount / total) * 100 : null,
      rank: 0,
    }))
    .sort((left, right) => (right.amount ?? -Infinity) - (left.amount ?? -Infinity))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export const DEFAULT_CALCULATION_RULES: CalculationRuleConfig = {
  enabled: true,
  version: "V1.0",
  baseDate: new Date().toISOString().slice(0, 10),
  incrementalYear: 2026,
  newVolumeMonths: 13,
  overdueMonths: 120,
  removalRateDenominator: "total",
};

function monthDistance(later: string, earlier: string) {
  const [laterYear, laterMonth] = later.split("-").map(Number);
  const [earlierYear, earlierMonth] = earlier.split("-").map(Number);
  if (![laterYear, laterMonth, earlierYear, earlierMonth].every(Number.isFinite)) return null;
  return (laterYear - earlierYear) * 12 + laterMonth - earlierMonth;
}

export function applyDynamicCalculationRules(rows: BusinessRow[], config: CalculationRuleConfig): BusinessRow[] {
  return rows.map((row) => {
    const sourceMeteringRule = row.sourceMeteringRule || row.meteringRule;
    if (!config.enabled || !row.completedDate) return { ...row, sourceMeteringRule, meteringRule: sourceMeteringRule, calculationRuleSource: "CRM静态结果" };
    const distance = monthDistance(config.baseDate, row.completedDate);
    let meteringRule = sourceMeteringRule;
    if (row.completedDate.startsWith(`${config.incrementalYear}-`)) meteringRule = "新增量";
    else if (distance !== null && distance < config.newVolumeMonths) meteringRule = "新量";
    else if (distance !== null && distance > config.overdueMonths) meteringRule = "超期";
    else if (distance !== null) meteringRule = "存量";
    return { ...row, sourceMeteringRule, meteringRule, calculationRuleSource: "平台动态计算" };
  });
}

export function buildBusinessProgress(rows: BusinessRow[], dimension: "company" | "owner" | "service" | "service2", denominator: "total" | "installs"): BusinessProgressRow[] {
  const groups = new Map<string, BusinessRow[]>();
  for (const row of rows) {
    const key = dimension === "company" ? "公司总体" : dimension === "owner" ? row.owner : dimension === "service" ? row.serviceCode : row.serviceCodeII;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const installs = group.filter(isInstall);
    const removals = group.filter(isRemoval);
    const totalLines = group.reduce((sum, row) => sum + lineCount(row), 0);
    const installLines = installs.reduce((sum, row) => sum + lineCount(row), 0);
    const removalLines = removals.reduce((sum, row) => sum + lineCount(row), 0);
    const installMonthlyMetering = installs.length ? sumKnown(installs.map((row) => row.monthlyMetering)) : 0;
    const removalMonthlyMetering = removals.length ? sumKnown(removals.map((row) => row.monthlyMetering)) : 0;
    const netGrowth = installLines - removalLines;
    const netMonthlyMetering = installMonthlyMetering !== null && removalMonthlyMetering !== null ? installMonthlyMetering - removalMonthlyMetering : null;
    const rateBase = denominator === "installs" ? installLines : totalLines;
    return {
      key,
      label: key,
      totalLines,
      installs: installLines,
      installMonthlyMetering,
      removals: removalLines,
      removalMonthlyMetering,
      removalRate: rateBase ? (removalLines / rateBase) * 100 : null,
      netGrowth,
      netMonthlyMetering,
      netAverageTariff: netMonthlyMetering !== null && netGrowth !== 0 ? netMonthlyMetering / netGrowth : null,
      monthlyMetering: sumKnown(group.map((row) => row.monthlyMetering)),
      newGrossProfit: sumKnown(group.filter((row) => /新增量|新量/.test(row.meteringRule)).map((row) => row.grossProfit)),
      stockGrossProfit: sumKnown(group.filter((row) => /存量|超期/.test(row.meteringRule)).map((row) => row.grossProfit)),
    };
  }).sort((left, right) => right.totalLines - left.totalLines);
}

export function buildMonthlyBusiness(rows: BusinessRow[]): MonthlyBusinessRow[] {
  const groups = new Map<string, BusinessRow[]>();
  for (const row of rows) {
    const month = row.completedDate.match(/^(\d{4}-\d{2})/)?.[1];
    if (!month) continue;
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, group]) => {
    const installs = group.filter(isInstall);
    const removals = group.filter(isRemoval);
    const active = group.filter(isActive);
    const installLines = installs.reduce((sum, row) => sum + lineCount(row), 0);
    const removalLines = removals.reduce((sum, row) => sum + lineCount(row), 0);
    return {
      month,
      installs: installLines,
      installAmount: sumKnown(installs.map((row) => row.monthlyMetering)),
      removals: removalLines,
      removalAmount: sumKnown(removals.map((row) => row.monthlyMetering)),
      activeLines: active.reduce((sum, row) => sum + lineCount(row), 0),
      activeAmount: sumKnown(active.map((row) => row.monthlyMetering)),
      installRemovalRatio: installLines ? (removalLines / installLines) * 100 : null,
    };
  });
}

export function buildNetGrowth(rows: BusinessRow[]): NetGrowthRow[] {
  const owners = [...new Set(rows.map((row) => row.owner).filter(Boolean))];
  return owners.map((owner) => {
    const group = rows.filter((row) => row.owner === owner);
    const installs = group.filter(isInstall);
    const removals = group.filter(isRemoval);
    const installLines = installs.reduce((sum, row) => sum + lineCount(row), 0);
    const removalLines = removals.reduce((sum, row) => sum + lineCount(row), 0);
    const installAmount = sumKnown(installs.map((row) => row.monthlyMetering));
    const removalAmount = sumKnown(removals.map((row) => row.monthlyMetering));
    return {
      owner,
      installs: installLines,
      installAmount,
      removals: removalLines,
      removalAmount,
      netLines: installLines - removalLines,
      netAmount: installAmount === null && removalAmount === null ? null : (installAmount ?? 0) - (removalAmount ?? 0),
      installRemovalRatio: installLines ? (removalLines / installLines) * 100 : null,
    };
  }).sort((left, right) => right.netLines - left.netLines);
}

export function buildCompletionCohorts(rows: BusinessRow[]): CompletionCohortRow[] {
  const groups = new Map<string, BusinessRow[]>();
  for (const row of rows) {
    const month = row.completedDate.match(/^(\d{4}-\d{2})/)?.[1];
    if (month) groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, group]) => {
    const active = group.filter(isActive);
    const removals = group.filter(isRemoval);
    const lines = group.reduce((sum, row) => sum + lineCount(row), 0);
    const activeLines = active.reduce((sum, row) => sum + lineCount(row), 0);
    return {
      month,
      lines,
      activeLines,
      removalLines: removals.reduce((sum, row) => sum + lineCount(row), 0),
      activeRate: lines ? (activeLines / lines) * 100 : null,
      monthlyMetering: sumKnown(group.map((row) => row.monthlyMetering)),
      activeMonthlyMetering: sumKnown(active.map((row) => row.monthlyMetering)),
    };
  });
}

export function buildDataQualityMetrics(rows: BusinessRow[]): DataQualityMetric[] {
  const deviceCounts = new Map<string, number>();
  for (const row of rows) if (row.deviceCode) deviceCounts.set(row.deviceCode, (deviceCounts.get(row.deviceCode) ?? 0) + 1);
  const duplicateRows = [...deviceCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const metrics: DataQualityMetric[] = [
    { key: "device-missing", label: "设备编号缺失", value: rows.filter((row) => !row.deviceCode).length, status: "pass", description: "设备编号是跨期唯一业务键" },
    { key: "device-duplicate", label: "设备编号重复记录", value: duplicateRows, status: "pass", description: "当前筛选结果内按设备编号检查" },
    { key: "initial-date-missing", label: "初始完工日期缺失", value: rows.filter((row) => !row.initialCompletedDate).length, status: "pass", description: "缺失时允许使用完工日期兜底" },
    { key: "date-fallback", label: "完工日期兜底", value: rows.filter((row) => row.completionDateSource === "完工日期兜底").length, status: "pass", description: "已纳入年月、趋势和留存统计" },
    { key: "effective-date-missing", label: "有效完工日期缺失", value: rows.filter((row) => !row.completedDate).length, status: "pass", description: "初始完工日期和完工日期均为空" },
    { key: "date-order", label: "完工日期早于初始完工日期", value: rows.filter((row) => row.initialCompletedDate && row.rawCompletedDate && row.rawCompletedDate < row.initialCompletedDate).length, status: "pass", description: "日期顺序异常需人工复核" },
  ];
  return metrics.map((metric) => ({ ...metric, status: metric.value ? "review" : "pass" }));
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
    const month = row.completedDate.match(/^(\d{4}-\d{2})/)?.[1];
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
    providers: buildRanking(rows, "service"),
    providersII: buildRanking(rows, "service2"),
    rows,
  };
}

export function normalizeSnapshot(input: Partial<Snapshot>): Snapshot {
  const rows = Array.isArray(input.rows) ? input.rows.map((row) => {
    const initialCompletedDate = row.initialCompletedDate ?? "";
    const rawCompletedDate = row.rawCompletedDate ?? (initialCompletedDate ? "" : row.completedDate ?? "");
    const completedDate = initialCompletedDate || rawCompletedDate;
    return ({
    ...row,
    initialCompletedDate,
    rawCompletedDate,
    completedDate,
    completionDateSource: initialCompletedDate ? "初始完工日期" as const : rawCompletedDate ? "完工日期兜底" as const : "缺失" as const,
    provider: row.provider ?? "",
    serviceCodeII: row.serviceCodeII ?? "",
    serviceNameII: row.serviceNameII ?? "",
    sourceMeteringRule: row.sourceMeteringRule ?? row.meteringRule ?? "",
    calculationRuleSource: row.calculationRuleSource ?? "CRM静态结果",
    deviceCode: row.deviceCode ?? "",
    lines: row.lines === undefined ? null : row.lines,
    monthlyMetering: row.monthlyMetering === undefined ? null : row.monthlyMetering,
    discountedTariff: row.discountedTariff === undefined ? null : row.discountedTariff,
    marketingFee: row.marketingFee === undefined ? null : row.marketingFee,
    paymentCycle: row.paymentCycle ?? "",
    providerCategory: row.providerCategory ?? "",
    belowAuthorizedPrice: row.belowAuthorizedPrice ?? "",
    grossProfit: row.grossProfit === undefined ? null : row.grossProfit,
  }); }) : [];
  if (!rows.length) return EMPTY_SNAPSHOT;
  return buildSnapshot(rows, input.source ?? { label: "本地快照", files: [], currentFile: "--" }, input.mode === "imported" ? "imported" : "local");
}
