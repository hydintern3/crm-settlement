import type { BusinessRow } from "./data-model";

export const CHART_SCHEMA_VERSION = 2;
export const MAX_DASHBOARD_TEMPLATES = 30;
export const DEFAULT_CHART_TOP_N = 50;

export type ChartType = "bar" | "line" | "area" | "pie" | "donut" | "stackedBar" | "scatter";
export type ChartSize = "half" | "wide";
export type TimeGranularity = "year" | "quarter" | "month" | "day";
export type DimensionField = "completedDate" | "businessEvent" | "businessType" | "businessName" | "owner" | "provider" | "serviceName" | "serviceNameII" | "activeStatus" | "meteringRule" | "paymentCycle" | "providerCategory" | "calculationStatus" | "installmentCalculationFlag" | "removalType";
export type MeasureField = "rows" | "deviceCode" | "serviceCode" | "lines" | "monthlyMetering" | "discountedTariff" | "marketingFee" | "grossProfit" | "businessEvent" | "activeStatus";
export type Aggregation = "count" | "distinct" | "sum" | "average" | "min" | "max" | "installs" | "removals" | "netGrowth" | "activeRate";

export type ChartMeasure = { field: MeasureField; aggregation: Aggregation; label?: string };
export type ChartTemplateDraft = {
  title: string;
  description: string;
  chartType: ChartType;
  dimension: { field: DimensionField; timeGranularity?: TimeGranularity };
  seriesField?: DimensionField;
  measures: ChartMeasure[];
  options: {
    topN: number;
    includeEmpty: boolean;
    showOther: boolean;
    sort: "dimensionAsc" | "dimensionDesc" | "valueAsc" | "valueDesc";
    orientation: "vertical" | "horizontal";
    showLabels: boolean;
    showLegend: boolean;
    smooth: boolean;
    size: ChartSize;
    height: number;
  };
  pinned: boolean;
  archived: boolean;
  order: number;
};

export type ChartTemplate = ChartTemplateDraft & {
  id: string;
  schemaVersion: number;
  revision: number;
  system: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type ChartFieldDefinition = {
  field: DimensionField;
  label: string;
  type: "category" | "date";
  filterKey?: string;
};

export const CHART_FIELDS: readonly ChartFieldDefinition[] = [
  { field: "completedDate", label: "有效完工日期", type: "date", filterKey: "completedDate" },
  { field: "businessEvent", label: "业务判定", type: "category", filterKey: "types" },
  { field: "businessType", label: "源业务属性", type: "category" },
  { field: "businessName", label: "业务名称", type: "category", filterKey: "businessNames" },
  { field: "owner", label: "负责人", type: "category", filterKey: "owners" },
  { field: "provider", label: "供应商", type: "category", filterKey: "providers" },
  { field: "serviceName", label: "I 服务", type: "category", filterKey: "services" },
  { field: "serviceNameII", label: "II 服务", type: "category", filterKey: "servicesII" },
  { field: "activeStatus", label: "活跃状态", type: "category", filterKey: "statuses" },
  { field: "meteringRule", label: "计量规则", type: "category", filterKey: "rules" },
  { field: "paymentCycle", label: "付款周期", type: "category", filterKey: "paymentCycles" },
  { field: "providerCategory", label: "服务分类", type: "category", filterKey: "providerCategories" },
  { field: "calculationStatus", label: "计算状态", type: "category", filterKey: "calculationStatuses" },
  { field: "installmentCalculationFlag", label: "分期计算标识", type: "category", filterKey: "installmentFlags" },
  { field: "removalType", label: "拆机类型", type: "category", filterKey: "removalTypes" },
] as const;

export type MeasureDefinition = {
  field: MeasureField;
  label: string;
  aggregations: readonly Aggregation[];
  unit: "条" | "线" | "元" | "%";
};

export const CHART_MEASURE_FIELDS: readonly MeasureDefinition[] = [
  { field: "rows", label: "业务记录", aggregations: ["count"], unit: "条" },
  { field: "deviceCode", label: "设备编号", aggregations: ["distinct"], unit: "条" },
  { field: "serviceCode", label: "服务编号", aggregations: ["distinct"], unit: "条" },
  { field: "lines", label: "线数", aggregations: ["sum", "average", "min", "max"], unit: "线" },
  { field: "monthlyMetering", label: "月平均计量", aggregations: ["sum", "average", "min", "max"], unit: "元" },
  { field: "discountedTariff", label: "折扣后资费", aggregations: ["sum", "average", "min", "max"], unit: "元" },
  { field: "marketingFee", label: "营销费", aggregations: ["sum", "average", "min", "max"], unit: "元" },
  { field: "grossProfit", label: "毛利", aggregations: ["sum", "average", "min", "max"], unit: "元" },
  { field: "businessEvent", label: "业务增减", aggregations: ["installs", "removals", "netGrowth"], unit: "条" },
  { field: "activeStatus", label: "活跃状态", aggregations: ["activeRate"], unit: "%" },
] as const;

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  count: "计数", distinct: "去重计数", sum: "合计", average: "平均", min: "最小值", max: "最大值",
  installs: "新装数", removals: "拆机数", netGrowth: "净增数", activeRate: "活跃率",
};

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "柱状图", line: "折线图", area: "面积图", pie: "饼图", donut: "环形图", stackedBar: "堆叠柱状图", scatter: "散点图",
};

const chartTypes = new Set<ChartType>(Object.keys(CHART_TYPE_LABELS) as ChartType[]);
const dimensions = new Set<DimensionField>(CHART_FIELDS.map((item) => item.field));
const measureFields = new Map(CHART_MEASURE_FIELDS.map((item) => [item.field, item]));
const granularities = new Set<TimeGranularity>(["year", "quarter", "month", "day"]);

export function chartField(field: DimensionField) {
  return CHART_FIELDS.find((item) => item.field === field)!;
}

export function measureDefinition(field: MeasureField) {
  return measureFields.get(field)!;
}

export function measureTitle(measure: ChartMeasure) {
  return measure.label?.trim() || `${measureDefinition(measure.field).label}（${AGGREGATION_LABELS[measure.aggregation]}）`;
}

export function defaultChartDraft(order = 100): ChartTemplateDraft {
  return {
    title: "自定义业务图表",
    description: "基于当前筛选结果实时计算",
    chartType: "bar",
    dimension: { field: "businessEvent" },
    measures: [{ field: "rows", aggregation: "count" }],
    options: { topN: DEFAULT_CHART_TOP_N, includeEmpty: false, showOther: true, sort: "valueDesc", orientation: "vertical", showLabels: false, showLegend: true, smooth: false, size: "half", height: 300 },
    pinned: true,
    archived: false,
    order,
  };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function parseChartDraft(value: unknown): ChartTemplateDraft {
  if (!value || typeof value !== "object") throw new Error("图表配置格式无效");
  const source = value as Record<string, unknown>;
  const dimensionSource = source.dimension && typeof source.dimension === "object" ? source.dimension as Record<string, unknown> : {};
  const optionsSource = source.options && typeof source.options === "object" ? source.options as Record<string, unknown> : {};
  if (!chartTypes.has(source.chartType as ChartType)) throw new Error("不支持的图表类型");
  if (!dimensions.has(dimensionSource.field as DimensionField)) throw new Error("不支持的图表维度");
  const chartType = source.chartType as ChartType;
  const dimensionField = dimensionSource.field as DimensionField;
  const dimensionDefinition = chartField(dimensionField);
  const granularity = granularities.has(dimensionSource.timeGranularity as TimeGranularity) ? dimensionSource.timeGranularity as TimeGranularity : undefined;
  if (!Array.isArray(source.measures) || source.measures.length < 1 || source.measures.length > 3) throw new Error("图表必须包含 1 至 3 个指标");
  const rawMeasures = source.measures;
  const measures: ChartMeasure[] = rawMeasures.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    const definition = measureFields.get(input.field as MeasureField);
    if (!definition || !definition.aggregations.includes(input.aggregation as Aggregation)) return [];
    return [{ field: definition.field, aggregation: input.aggregation as Aggregation, label: text(input.label, 40) || undefined }];
  });
  if (measures.length !== rawMeasures.length) throw new Error("指标字段或聚合方式无效");
  if (source.seriesField !== undefined && source.seriesField !== "" && !dimensions.has(source.seriesField as DimensionField)) throw new Error("不支持的系列维度");
  const seriesField = dimensions.has(source.seriesField as DimensionField) && source.seriesField !== dimensionField ? source.seriesField as DimensionField : undefined;
  const draft: ChartTemplateDraft = {
    title: text(source.title, 80) || "未命名图表",
    description: text(source.description, 240),
    chartType,
    dimension: { field: dimensionField, timeGranularity: dimensionDefinition.type === "date" ? granularity ?? "month" : undefined },
    seriesField,
    measures,
    options: {
      topN: integer(optionsSource.topN, DEFAULT_CHART_TOP_N, 3, 50),
      includeEmpty: boolean(optionsSource.includeEmpty, false),
      showOther: boolean(optionsSource.showOther, true),
      sort: ["dimensionAsc", "dimensionDesc", "valueAsc", "valueDesc"].includes(String(optionsSource.sort)) ? optionsSource.sort as ChartTemplateDraft["options"]["sort"] : "valueDesc",
      orientation: optionsSource.orientation === "horizontal" ? "horizontal" : "vertical",
      showLabels: boolean(optionsSource.showLabels, false),
      showLegend: boolean(optionsSource.showLegend, true),
      smooth: boolean(optionsSource.smooth, false),
      size: optionsSource.size === "wide" ? "wide" : "half",
      height: integer(optionsSource.height, 300, 240, 520),
    },
    pinned: boolean(source.pinned, true),
    archived: boolean(source.archived, false),
    order: integer(source.order, 100, 0, 10_000),
  };
  const issues = validateChartDraft(draft);
  if (issues.length) throw new Error(issues.join("；"));
  return draft;
}

export function migrateChartDraft(draft: ChartTemplateDraft, sourceSchemaVersion: number) {
  if (sourceSchemaVersion < 2 && draft.options.topN === 10 && draft.options.showOther) {
    return { ...draft, options: { ...draft.options, topN: DEFAULT_CHART_TOP_N } };
  }
  return draft;
}

export function validateChartDraft(draft: ChartTemplateDraft) {
  const issues: string[] = [];
  if ((draft.chartType === "pie" || draft.chartType === "donut") && draft.measures.length !== 1) issues.push("饼图和环形图只能使用一个指标");
  if ((draft.chartType === "pie" || draft.chartType === "donut") && draft.measures[0]?.aggregation === "netGrowth") issues.push("饼图和环形图不能使用可能为负数的净增指标");
  if (draft.seriesField && draft.measures.length !== 1) issues.push("使用系列拆分时只能选择一个指标");
  if ((draft.chartType === "pie" || draft.chartType === "donut" || draft.chartType === "scatter") && draft.seriesField) issues.push("当前图表类型不支持系列拆分");
  if (draft.chartType === "scatter" && draft.measures.length !== 2) issues.push("散点图需要两个指标作为 X、Y 轴");
  if (draft.chartType === "stackedBar" && !draft.seriesField && draft.measures.length < 2) issues.push("堆叠柱状图需要系列拆分或至少两个指标");
  if (draft.measures.some((measure) => !measureFields.get(measure.field)?.aggregations.includes(measure.aggregation))) issues.push("指标和聚合方式不兼容");
  return issues;
}

const defaultTime = "2026-01-01T00:00:00.000Z";
function systemTemplate(id: string, draft: ChartTemplateDraft): ChartTemplate {
  return { ...draft, id, schemaVersion: CHART_SCHEMA_VERSION, revision: 1, system: true, createdAt: defaultTime, createdBy: "system", updatedAt: defaultTime, updatedBy: "system" };
}

export const DEFAULT_CHART_TEMPLATES: readonly ChartTemplate[] = [
  systemTemplate("system-monthly-metering", { ...defaultChartDraft(10), title: "月平均计量趋势", description: "按有效完工月份汇总月平均计量", chartType: "bar", dimension: { field: "completedDate", timeGranularity: "month" }, measures: [{ field: "monthlyMetering", aggregation: "sum" }], options: { ...defaultChartDraft().options, sort: "dimensionAsc", size: "wide" } }),
  systemTemplate("system-metering-rule", { ...defaultChartDraft(20), title: "计量规则分布", description: "新增量、新量、存量和超期记录结构", chartType: "donut", dimension: { field: "meteringRule" }, measures: [{ field: "rows", aggregation: "count" }] }),
  systemTemplate("system-owner-ranking", { ...defaultChartDraft(30), title: "负责人业绩", description: "负责人月平均计量 Top 50", dimension: { field: "owner" }, measures: [{ field: "monthlyMetering", aggregation: "sum" }], options: { ...defaultChartDraft().options, orientation: "horizontal" } }),
  systemTemplate("system-provider-ranking", { ...defaultChartDraft(40), title: "服务商进单", description: "供应商月平均计量 Top 50", dimension: { field: "provider" }, measures: [{ field: "monthlyMetering", aggregation: "sum" }], options: { ...defaultChartDraft().options, orientation: "horizontal" } }),
] as const;

export function templateDraft(template: ChartTemplate): ChartTemplateDraft {
  return {
    title: template.title,
    description: template.description,
    chartType: template.chartType,
    dimension: { ...template.dimension },
    seriesField: template.seriesField,
    measures: template.measures.map((measure) => ({ ...measure })),
    options: { ...template.options },
    pinned: template.pinned,
    archived: template.archived,
    order: template.order,
  };
}

export function dimensionRawValue(row: BusinessRow, field: DimensionField) {
  return String(row[field] ?? "").trim();
}
