import { isActive, isNewVolume, isRemoval, type BusinessRow, type NumericValue } from "./data-model.ts";
import { chartField, dimensionRawValue, measureDefinition, measureTitle, type ChartMeasure, type ChartTemplateDraft, type DimensionField, type TimeGranularity } from "./chart-template.ts";

export type ChartSeriesData = { name: string; values: NumericValue[] };
export type AggregatedChartData = {
  categories: string[];
  series: ChartSeriesData[];
  recordCount: number;
  groupCount: number;
  unit: string;
  warnings: string[];
};

function dateBucket(value: string, granularity: TimeGranularity) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  if (granularity === "year") return match[1];
  if (granularity === "quarter") return `${match[1]}-Q${Math.ceil(Number(match[2]) / 3)}`;
  if (granularity === "month") return `${match[1]}-${match[2]}`;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function chartDimensionValue(row: BusinessRow, field: DimensionField, granularity?: TimeGranularity) {
  const raw = dimensionRawValue(row, field);
  return chartField(field).type === "date" ? dateBucket(raw, granularity ?? "month") : raw;
}

function aggregate(rows: BusinessRow[], measure: ChartMeasure): NumericValue {
  if (measure.aggregation === "count") return rows.length;
  const rowField = measure.field as keyof BusinessRow;
  if (measure.aggregation === "distinct") return new Set(rows.map((row) => String(row[rowField] ?? "").trim()).filter(Boolean)).size;
  if (measure.aggregation === "installs") return rows.filter(isNewVolume).length;
  if (measure.aggregation === "removals") return rows.filter(isRemoval).length;
  if (measure.aggregation === "netGrowth") return rows.reduce((total, row) => total + (isNewVolume(row) ? 1 : isRemoval(row) ? -1 : 0), 0);
  if (measure.aggregation === "activeRate") return rows.length ? rows.filter(isActive).length / rows.length * 100 : null;
  const values = rows.map((row) => row[rowField]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  if (measure.aggregation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (measure.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (measure.aggregation === "min") return Math.min(...values);
  if (measure.aggregation === "max") return Math.max(...values);
  return null;
}

function displayAggregate(rows: BusinessRow[], measure: ChartMeasure): NumericValue {
  const value = aggregate(rows, measure);
  return value;
}

function groupRows(rows: BusinessRow[], template: ChartTemplateDraft, retained: Set<string> | null, mergeOthers = false) {
  const groups = new Map<string, BusinessRow[]>();
  for (const row of rows) {
    let dimension = chartDimensionValue(row, template.dimension.field, template.dimension.timeGranularity);
    if (!dimension) dimension = "--";
    if (!template.options.includeEmpty && dimension === "--") continue;
    if (retained && !retained.has(dimension)) {
      if (!mergeOthers) continue;
      dimension = "其他";
    }
    const series = template.seriesField ? chartDimensionValue(row, template.seriesField) || "--" : "";
    if (!template.options.includeEmpty && series === "--") continue;
    const key = `${dimension}\u0000${series}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function scoreCategories(groups: Map<string, BusinessRow[]>, measure: ChartMeasure) {
  const categoryRows = new Map<string, BusinessRow[]>();
  for (const [key, rows] of groups) {
    const dimension = key.split("\u0000")[0];
    categoryRows.set(dimension, [...(categoryRows.get(dimension) ?? []), ...rows]);
  }
  return new Map([...categoryRows].map(([category, rows]) => [category, aggregate(rows, measure) ?? 0]));
}

export function buildChartData(rows: BusinessRow[], template: ChartTemplateDraft): AggregatedChartData {
  const initialGroups = groupRows(rows, template, null);
  const scores = scoreCategories(initialGroups, template.measures[0]);
  const categories = [...scores.keys()];
  if (template.options.sort === "dimensionAsc" || template.options.sort === "dimensionDesc") categories.sort((left, right) => left.localeCompare(right, "zh-CN") * (template.options.sort === "dimensionDesc" ? -1 : 1));
  else categories.sort((left, right) => ((scores.get(left) ?? 0) - (scores.get(right) ?? 0)) * (template.options.sort === "valueDesc" ? -1 : 1));

  const warnings: string[] = [];
  if (categories.length > template.options.topN) {
    warnings.push(`类别较多，图表初始显示 ${template.options.topN} 项，可使用图内滚动条查看全部 ${categories.length} 项`);
  }

  const groups = initialGroups;

  const seriesCategories = template.seriesField ? [...new Set([...groups.keys()].map((key) => key.split("\u0000")[1]))].sort((left, right) => left.localeCompare(right, "zh-CN")).slice(0, 12) : [];
  if (template.seriesField && new Set([...groups.keys()].map((key) => key.split("\u0000")[1])).size > 12) warnings.push("系列超过 12 项，仅展示前 12 项");
  const series: ChartSeriesData[] = template.seriesField
    ? seriesCategories.map((seriesName) => ({ name: seriesName, values: categories.map((category) => displayAggregate(groups.get(`${category}\u0000${seriesName}`) ?? [], template.measures[0])) }))
    : template.measures.map((measure) => ({ name: measureTitle(measure), values: categories.map((category) => displayAggregate(groups.get(`${category}\u0000`) ?? [], measure)) }));
  const unit = measureDefinition(template.measures[0].field).unit;
  return { categories, series, recordCount: rows.length, groupCount: groups.size, unit, warnings };
}
