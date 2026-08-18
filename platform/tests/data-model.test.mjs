import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDynamicCalculationRules,
  classifyBusinessEvent,
  localDateISO,
  maskContactLandline,
  toBusinessRow,
} from "../app/lib/data-model.ts";
import { mergeVersionSnapshots } from "../app/lib/workbook-import.ts";

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
  const row = toBusinessRow({ 业务类型: "", 计量规则: "新增量", 初始完工日期: "2026/1/2", 现日期: "2026/7/28", 联系人固话: "021-87654321", 计算状态: "暂停计算", 分期计算标识: "年付半年结", 拆机类型: "用户拆机", 用户拆机原因: "经营调整" });
  assert.equal(row.businessType, "");
  assert.equal(row.businessEvent, "新装");
  assert.equal(row.businessEventSource, "计量规则兜底");
  assert.equal(row.initialCompletedDate, "2026-01-02");
  assert.equal(row.sourceCurrentDate, "2026-07-28");
  assert.equal(row.sourceMeteringRule, "新增量");
  assert.equal(row.contactLandlineMasked, "****-4321");
  assert.equal(row.calculationStatus, "暂停计算");
  assert.equal(row.installmentCalculationFlag, "年付半年结");
  assert.equal(row.removalType, "用户拆机");
  assert.equal(row.userRemovalReason, "经营调整");
  assert.equal(maskContactLandline("1234"), "****");
});

test("newer full CRM versions replace duplicate devices while blank keys remain", () => {
  const snapshot = (label, rows) => ({ mode: "imported", generatedAt: "2026-08-18T00:00:00.000Z", source: { label, files: [`${label}.csv`], currentFile: `${label}.csv`, sheets: [] }, summary: {}, monthly: [], meteringRules: [], owners: [], providers: [], providersII: [], rows });
  const oldDuplicate = toBusinessRow({ 设备编号: "D-1", 业务名称: "旧名称", 计算状态: "暂停计算", 初始完工日期: "2026-01-01" });
  const newDuplicate = toBusinessRow({ 设备编号: "D-1", 业务名称: "新名称", 计算状态: "恢复计算", 初始完工日期: "2025-01-01" });
  const result = mergeVersionSnapshots([
    { id: "v1", label: "旧全量", createdAt: "2026-07-01T00:00:00.000Z", snapshot: snapshot("v1", [oldDuplicate, toBusinessRow({ 设备编号: "", 业务名称: "空键旧" })]) },
    { id: "v2", label: "新全量", createdAt: "2026-08-01T00:00:00.000Z", snapshot: snapshot("v2", [newDuplicate, toBusinessRow({ 设备编号: "D-2", 业务名称: "新增设备" }), toBusinessRow({ 设备编号: "", 业务名称: "空键新" })]) },
  ]);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows.find((row) => row.deviceCode === "D-1")?.businessName, "新名称");
  assert.equal(result.rows.find((row) => row.deviceCode === "D-1")?.calculationStatus, "恢复计算");
  assert.equal(result.rows.filter((row) => !row.deviceCode).length, 2);
  assert.deepEqual(result.source.deduplication, { keyField: "设备编号", inputRows: 5, outputRows: 4, removedRows: 1, duplicateKeys: 1, blankKeyRows: 2, strategy: "按版本发布时间从旧到新整合；同一设备编号由较新的 CRM 全量版本整行覆盖；设备编号为空的记录全部保留" });
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
