import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDynamicCalculationRules,
  classifyBusinessEvent,
  localDateISO,
  toBusinessRow,
} from "../app/lib/data-model.ts";

const rules = (baseDate) => ({
  enabled: true,
  version: "test",
  dateMode: "manual",
  baseDate,
  newVolumeMonths: 13,
  overdueMonths: 120,
  removalRateDenominator: "total",
});

test("business event keeps explicit attributes and uses incremental volume only as fallback", () => {
  assert.deepEqual(classifyBusinessEvent("新装", "存量"), { businessEvent: "新装", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent("变更", "新增量"), { businessEvent: "变更", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent("拆机", "新增量"), { businessEvent: "拆机", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent("", "新增量"), { businessEvent: "新装", businessEventSource: "计量规则兜底" });
  assert.deepEqual(classifyBusinessEvent("未识别", "存量"), { businessEvent: "待确认", businessEventSource: "待确认" });
});

test("field mapping preserves source values and audit fields", () => {
  const row = toBusinessRow({ 业务类型: "", 计量规则: "新增量", 初始完工日期: "2026/1/2", 现日期: "2026/7/28" });
  assert.equal(row.businessType, "");
  assert.equal(row.businessEvent, "新装");
  assert.equal(row.businessEventSource, "计量规则兜底");
  assert.equal(row.initialCompletedDate, "2026-01-02");
  assert.equal(row.sourceCurrentDate, "2026-07-28");
  assert.equal(row.sourceMeteringRule, "新增量");
});

test("metering rules derive incremental year and month thresholds from the base date", () => {
  const input = [
    ["2026-01-01", "新增量"],
    ["2025-07-01", "新量"],
    ["2025-06-01", "存量"],
    ["2016-07-01", "存量"],
    ["2016-06-01", "超期"],
  ].map(([date]) => toBusinessRow({ 业务属性: "", 计量规则: "旧值", 初始完工日期: date }));

  const output = applyDynamicCalculationRules(input, rules("2026-07-28"));
  assert.deepEqual(output.map((row) => row.meteringRule), ["新增量", "新量", "存量", "存量", "超期"]);
  assert.equal(output[0].businessEvent, "新装");
  assert.equal(output[0].businessEventSource, "计量规则兜底");

  const nextYear = applyDynamicCalculationRules(
    [toBusinessRow({ 业务属性: "", 计量规则: "存量", 初始完工日期: "2027-02-01" })],
    rules("2027-08-18"),
  );
  assert.equal(nextYear[0].meteringRule, "新增量");
});

test("local date formatting does not use UTC date boundaries", () => {
  assert.equal(localDateISO(new Date(2026, 7, 18, 0, 5)), "2026-08-18");
});
