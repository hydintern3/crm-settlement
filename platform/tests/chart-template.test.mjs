import assert from "node:assert/strict";
import test from "node:test";

import { buildChartData } from "../app/lib/chart-aggregation.ts";
import { defaultChartDraft, parseChartDraft, validateChartDraft } from "../app/lib/chart-template.ts";
import { toBusinessRow } from "../app/lib/data-model.ts";

const rows = [
  toBusinessRow({ 业务属性: "新装", 业务名称: "A", 设备编号: "D-1", 负责人: "张三", 供应商: "甲", 初始完工日期: "2026-01-02", 月平均计量: "100", 线数: "2", 活跃状态: "活跃", 计量规则: "新增量" }),
  toBusinessRow({ 业务属性: "拆机", 业务名称: "B", 设备编号: "D-2", 负责人: "张三", 供应商: "乙", 初始完工日期: "2026-01-18", 月平均计量: "50", 线数: "1", 活跃状态: "不活跃", 计量规则: "新量" }),
  toBusinessRow({ 业务属性: "新装", 业务名称: "C", 设备编号: "D-3", 负责人: "李四", 供应商: "丙", 初始完工日期: "2026-02-03", 月平均计量: "0", 线数: "3", 活跃状态: "正常", 计量规则: "存量" }),
  toBusinessRow({ 业务属性: "新装", 业务名称: "D", 设备编号: "D-3", 负责人: "王五", 供应商: "丁", 初始完工日期: "", 月平均计量: "", 线数: "", 活跃状态: "", 计量规则: "" }),
];

test("chart aggregation handles date buckets, nulls and real zero", () => {
  const draft = defaultChartDraft();
  draft.dimension = { field: "completedDate", timeGranularity: "month" };
  draft.measures = [{ field: "monthlyMetering", aggregation: "sum" }];
  draft.options.sort = "dimensionAsc";
  const data = buildChartData(rows, draft);
  assert.deepEqual(data.categories, ["2026-01", "2026-02"]);
  assert.deepEqual(data.series[0].values, [150, 0]);
  assert.equal(data.recordCount, 4);
});

test("chart aggregation supports business metrics, distinct counts and top N other", () => {
  const draft = defaultChartDraft();
  draft.dimension = { field: "provider" };
  draft.measures = [{ field: "deviceCode", aggregation: "distinct" }];
  draft.options.topN = 3;
  draft.options.showOther = true;
  const distinct = buildChartData(rows, draft);
  assert.equal(distinct.categories.length, 4);
  assert.equal(distinct.categories.at(-1), "其他");
  assert.equal(distinct.series[0].values.reduce((sum, value) => sum + Number(value), 0), 4);

  draft.dimension = { field: "owner" };
  draft.measures = [{ field: "businessEvent", aggregation: "netGrowth" }];
  draft.options.topN = 10;
  const growth = buildChartData(rows, draft);
  assert.equal(growth.series[0].values[growth.categories.indexOf("张三")], 0);
  assert.equal(growth.series[0].values[growth.categories.indexOf("李四")], 1);
});

test("series split and active rate are calculated from the same grouped records", () => {
  const draft = defaultChartDraft();
  draft.dimension = { field: "owner" };
  draft.seriesField = "businessEvent";
  draft.measures = [{ field: "rows", aggregation: "count" }];
  const data = buildChartData(rows, draft);
  assert.deepEqual(new Set(data.series.map((series) => series.name)), new Set(["新装", "拆机"]));

  draft.seriesField = undefined;
  draft.measures = [{ field: "activeStatus", aggregation: "activeRate" }];
  const rates = buildChartData(rows, draft);
  assert.equal(rates.series[0].values[rates.categories.indexOf("张三")], 50);
});

test("template parser constrains unsafe and incompatible configurations", () => {
  const parsed = parseChartDraft({ ...defaultChartDraft(), title: "  自定义图表  ", options: { ...defaultChartDraft().options, topN: 999 } });
  assert.equal(parsed.title, "自定义图表");
  assert.equal(parsed.options.topN, 50);
  const invalid = { ...defaultChartDraft(), chartType: "pie", measures: [{ field: "rows", aggregation: "count" }, { field: "lines", aggregation: "sum" }] };
  assert.deepEqual(validateChartDraft(invalid), ["饼图和环形图只能使用一个指标"]);
  assert.throws(() => parseChartDraft(invalid), /只能使用一个指标/);
  assert.throws(() => parseChartDraft({ ...defaultChartDraft(), chartType: "javascript" }), /不支持的图表类型/);
  assert.throws(() => parseChartDraft({ ...defaultChartDraft(), dimension: { field: "contactLandlineMasked" } }), /不支持的图表维度/);
  assert.equal(JSON.stringify(parsed).includes("javascript"), false);
});
