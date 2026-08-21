import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDynamicCalculationRules,
  buildAnnualRemovalSummary,
  buildAnnualAdditionReconciliation,
  buildSalesNetGrowth,
  buildDoubleLineAssessment,
  buildMonthlyBusiness,
  buildServiceCombinationRows,
  buildServicePolicyDistribution,
  buildSettlementReviewSummary,
  buildSnapshot,
  buildBusinessProgress,
  classifyBusinessEvent,
  isNewVolume,
  isSameYearInstallRemoval,
  localDateISO,
  maskContactLandline,
  toBusinessRow,
} from "../app/lib/data-model.ts";
import { mergeVersionSnapshots } from "../app/lib/workbook-import.ts";
import { assessDataMappingQuality } from "../app/lib/data-version.ts";

const rules = (baseDate) => ({
  enabled: true,
  version: "test",
  dateMode: "manual",
  baseDate,
  removalRateDenominator: "total",
});

test("business event only reflects the CRM business attribute", () => {
  assert.deepEqual(classifyBusinessEvent("新装"), { businessEvent: "新装", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent("变更"), { businessEvent: "变更", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent("拆机"), { businessEvent: "拆机", businessEventSource: "业务属性" });
  assert.deepEqual(classifyBusinessEvent(""), { businessEvent: "待确认", businessEventSource: "待确认" });
  assert.deepEqual(classifyBusinessEvent("未识别"), { businessEvent: "待确认", businessEventSource: "待确认" });
});

test("field mapping preserves source values and audit fields", () => {
  const row = toBusinessRow({ 业务类型: "", 计量规则: "新增量", 初始完工日期: "2026/1/2", 现日期: "2026/7/28", 月平均资费: "10000", 优惠资费: "888", 联系人固话: "021-87654321", 计算状态: "暂停计算", 分期计算标识: "年付半年结", 拆机类型: "用户拆机", 用户拆机原因: "经营调整" });
  assert.equal(row.businessType, "");
  assert.equal(row.businessEvent, "待确认");
  assert.equal(row.businessEventSource, "待确认");
  assert.equal(row.initialCompletedDate, "2026-01-02");
  assert.equal(row.sourceCurrentDate, "2026-07-28");
  assert.equal(row.sourceMeteringRule, "新增量");
  assert.equal(row.monthlyTariff, 10000);
  assert.equal(row.discountedTariff, 888);
  assert.equal(row.contactLandlineMasked, "****-4321");
  assert.equal(row.calculationStatus, "暂停计算");
  assert.equal(row.installmentCalculationFlag, "年付半年结");
  assert.equal(row.removalType, "用户拆机");
  assert.equal(row.userRemovalReason, "经营调整");
  assert.equal(maskContactLandline("1234"), "****");
});

test("double-line assessment uses monthly tariff with 2,000 yuan increments and a 20-line cap", () => {
  const rows = [
    toBusinessRow({ 业务属性: "新装", 计量规则: "新增量", 线数: "1", 月平均资费: "9999", 优惠资费: "50000" }),
    toBusinessRow({ 业务属性: "新装", 计量规则: "新增量", 线数: "1", 月平均资费: "10000" }),
    toBusinessRow({ 业务属性: "新装", 计量规则: "新增量", 线数: "1", 月平均资费: "12000" }),
    toBusinessRow({ 业务属性: "新装", 计量规则: "新增量", 线数: "1", 月平均资费: "14000" }),
    toBusinessRow({ 业务属性: "拆机", 线数: "2", 月平均资费: "50000" }),
  ];
  const result = buildDoubleLineAssessment(rows, 0.75);
  assert.equal(result.installLines, 4);
  assert.equal(result.installConvertibleRecords, 3);
  assert.equal(result.installConvertedLines, 6);
  assert.equal(result.installTotalLines, 10);
  assert.equal(result.removalLines, 2);
  assert.equal(result.removalConvertibleRecords, 1);
  assert.equal(result.removalConvertedLines, 20);
  assert.equal(result.removalTotalLines, 22);
  assert.equal(result.rawRatio, 50);
  assert.equal(result.convertedRatio, 220);
  assert.equal(result.rawPendingLines, 0);
  assert.equal(result.convertedPendingLines, 20);
});

test("service combinations preserve single-sided records and policy distribution counts I and II service sides", () => {
  const rows = [
    toBusinessRow({ 设备编号: "D-1", I服务编号: "I-1", II服务编号: "II-1", 计量规则: "新量", 是否低于授权价: "是", 线数: "2", 月平均计量: "100" }),
    toBusinessRow({ 设备编号: "D-2", I服务编号: "I-1", 计量规则: "存量", 是否低于授权价: "否", 线数: "1", 月平均计量: "50" }),
    toBusinessRow({ 设备编号: "D-3", II服务编号: "II-2", 计量规则: "新量", 是否低于授权价: "是", 线数: "3", 月平均计量: "70" }),
  ];
  const combinations = buildServiceCombinationRows(rows);
  assert.equal(combinations.length, 3);
  assert.equal(combinations.find((item) => item.serviceCode === "--" && item.serviceCodeII === "II-2")?.records, 1);
  assert.equal(combinations.find((item) => item.serviceCode === "I-1" && item.serviceCodeII === "II-1")?.newVolumeAmount, 100);
  const policies = buildServicePolicyDistribution(rows);
  const newAndBelow = policies.find((item) => item.policy === "新量" && item.belowAuthorizedPrice === "是");
  assert.deepEqual(newAndBelow && { first: newAndBelow.serviceOneRecords, second: newAndBelow.serviceTwoRecords, total: newAndBelow.totalServiceRecords, amount: newAndBelow.totalServiceAmount }, { first: 1, second: 2, total: 3, amount: 270 });
});

test("annual install and removal summary groups by source completion date", () => {
  const rows = [
    toBusinessRow({ 设备编号: "D-1", 业务属性: "新装", 初始完工日期: "2025-12-31", 完工日期: "2026-01-03", 月平均计量: "100" }),
    toBusinessRow({ 设备编号: "D-2", 业务属性: "拆机", 初始完工日期: "2026-02-01", 完工日期: "2026-04-08", 月平均计量: "20" }),
    toBusinessRow({ 设备编号: "D-3", 业务属性: "拆机", 初始完工日期: "2026-05-01", 完工日期: "2025-05-01", 月平均计量: "30" }),
  ];
  const monthly = buildMonthlyBusiness(rows);
  assert.deepEqual(monthly.map((item) => [item.month, item.installs, item.removals]), [["2026-01", 1, 0], ["2026-04", 0, 1]]);
});

test("2026 annual removal summary only includes removal records with CRM completion dates in 2026", () => {
  const rows = [
    toBusinessRow({ 设备编号: "D-1", 业务属性: "拆机", 完工日期: "2026-01-03", 线数: "2", 月平均计量: "100", 优惠资费: "12000" }),
    toBusinessRow({ 设备编号: "D-2", 业务属性: "拆机", 完工日期: "2026-01-28", 线数: "1", 月平均计量: "50", 优惠资费: "10000" }),
    toBusinessRow({ 设备编号: "D-3", 业务属性: "拆机", 完工日期: "2025-02-01", 线数: "9", 月平均计量: "900", 优惠资费: "9000" }),
    toBusinessRow({ 设备编号: "D-4", 业务属性: "新装", 完工日期: "2026-03-01", 线数: "8", 月平均计量: "800", 优惠资费: "8000" }),
    toBusinessRow({ 设备编号: "D-5", 业务属性: "拆机", 初始完工日期: "2026-04-01", 完工日期: "", 线数: "7", 月平均计量: "700", 优惠资费: "7000" }),
  ];
  assert.deepEqual(buildAnnualRemovalSummary(rows, "2026"), [{ month: "2026-01", records: 2, lines: 3, monthlyMetering: 150, discountedTariff: 22000 }]);
});

test("annual addition reconciliation counts all 2026 initial completions and separates current status", () => {
  const rows = [
    toBusinessRow({ 设备编号: "D-1", 负责人: "甲", 初始完工日期: "2026-01-01", 完工日期: "2026-01-02", 业务属性: "新装", 活跃状态: "活跃", 线数: "2", 月平均计量: "100" }),
    toBusinessRow({ 设备编号: "D-2", 负责人: "甲", 初始完工日期: "2026-01-03", 完工日期: "2026-02-02", 业务属性: "拆机", 活跃状态: "不活跃", 线数: "3", 月平均计量: "200" }),
    toBusinessRow({ 设备编号: "D-3", 负责人: "甲", 初始完工日期: "2026-01-04", 完工日期: "2027-01-02", 业务属性: "拆机", 活跃状态: "不活跃", 线数: "4", 月平均计量: "300" }),
    toBusinessRow({ 设备编号: "D-4", 负责人: "甲", 初始完工日期: "2026-01-05", 完工日期: "", 业务属性: "拆机", 活跃状态: "不活跃", 线数: "5", 月平均计量: "400" }),
    toBusinessRow({ 设备编号: "D-5", 负责人: "甲", 初始完工日期: "2026-01-06", 完工日期: "2026-01-07", 业务属性: "变更", 活跃状态: "暂停", 线数: "6", 月平均计量: "500" }),
    toBusinessRow({ 设备编号: "D-6", 负责人: "甲", 初始完工日期: "2026-01-08", 完工日期: "2026-01-09", 业务属性: "新装", 活跃状态: "", 线数: "7", 月平均计量: "600" }),
    toBusinessRow({ 设备编号: "D-7", 负责人: "甲", 初始完工日期: "2025-12-31", 完工日期: "2026-01-09", 业务属性: "新装", 活跃状态: "活跃", 线数: "8", 月平均计量: "700" }),
  ];
  const result = buildAnnualAdditionReconciliation(rows, "2026", "owner");
  assert.deepEqual(result, [{ key: "甲", label: "甲", records: 6, lines: 27, monthlyMetering: 2100, activeLines: 2, sameYearRemovalLines: 3, laterRemovalLines: 4, removalDateMissingLines: 5, inactiveNotRemovalLines: 6, statusMissingLines: 7, reconciledLines: 27, unreconciledLines: 0 }]);
});

test("sales net growth uses 2026 additions and keeps same-year and annual removals separate", () => {
  const rows = [
    toBusinessRow({ 负责人: "销售甲", 业务属性: "新装", 计量规则: "存量", 初始完工日期: "2026-01-05", 线数: "2", 月平均计量: "200" }),
    toBusinessRow({ 负责人: "销售甲", 业务属性: "变更", 计量规则: "新增量", 初始完工日期: "2025-12-05", 线数: "3", 月平均计量: "300" }),
    toBusinessRow({ 负责人: "销售甲", 业务属性: "拆机", 计量规则: "新增量", 初始完工日期: "2026-02-06", 完工日期: "2026-04-06", 线数: "1", 月平均计量: "100" }),
    toBusinessRow({ 负责人: "销售甲", 业务属性: "拆机", 计量规则: "存量", 初始完工日期: "2024-01-01", 完工日期: "2026-05-06", 线数: "4", 月平均计量: "400" }),
    toBusinessRow({ 负责人: "销售甲", 业务属性: "拆机", 计量规则: "新增量", 初始完工日期: "2026-03-01", 完工日期: "2025-06-06", 线数: "5", 月平均计量: "500" }),
  ];
  assert.deepEqual(buildSalesNetGrowth(rows), [{ owner: "销售甲", additions: 9, additionAmount: 900, sameYearRemovals: 1, sameYearRemovalAmount: 100, netLines: 8, netAmount: 800, annualRemovals: 5, annualRemovalAmount: 500, sameYearRemovalRate: 100 / 9 }]);
});

test("partial CRM rows remain available while settlement review reasons stay explicit", () => {
  const partial = toBusinessRow({ "设备 编号": "D-PARTIAL", "业务 名称": "字段不完整业务", "负责人\n": "测试负责人" });
  const snapshot = buildSnapshot([partial], { label: "partial", files: ["partial.xlsx"], currentFile: "partial.xlsx", sheets: [] });
  const review = buildSettlementReviewSummary(snapshot.rows);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.summary.total, 1);
  assert.equal(snapshot.summary.review, 1);
  assert.equal(snapshot.rows[0].deviceCode, "D-PARTIAL");
  assert.equal(snapshot.rows[0].businessName, "字段不完整业务");
  assert.equal(snapshot.rows[0].owner, "测试负责人");
  assert.deepEqual(review, { total: 1, missingMeteringRule: 1, missingMonthlyMetering: 1, annualPlan: 0 });
});

test("mapping quality separates incomplete business rows from legacy empty snapshots", () => {
  const incomplete = buildSnapshot([toBusinessRow({ 设备编号: "D-PARTIAL" })], { label: "partial", files: [], currentFile: "partial" });
  const legacyEmpty = buildSnapshot(Array.from({ length: 3 }, () => toBusinessRow({})), { label: "legacy", files: [], currentFile: "legacy" });
  assert.deepEqual(assessDataMappingQuality(incomplete), { status: "ready", mappedRows: 1, unmappedRows: 0 });
  assert.deepEqual(assessDataMappingQuality(legacyEmpty), { status: "unusable", mappedRows: 0, unmappedRows: 3 });
});

test("newer CRM versions override non-empty fields without erasing existing values", () => {
  const snapshot = (label, rows) => ({ mode: "imported", generatedAt: "2026-08-18T00:00:00.000Z", source: { label, files: [`${label}.csv`], currentFile: `${label}.csv`, sheets: [] }, summary: {}, monthly: [], meteringRules: [], owners: [], providers: [], providersII: [], rows });
  const oldDuplicate = toBusinessRow({ 设备编号: "D-1", 业务名称: "活跃完整名称", 供应商: "供应商甲", I服务编号: "S-1", 月平均计量: "123.456789", 计算状态: "暂停计算", 初始完工日期: "2026-01-01", 活跃状态: "活跃" });
  const newDuplicate = toBusinessRow({ 设备编号: "D-1", 业务名称: "", 计算状态: "恢复计算", 初始完工日期: "", 活跃状态: "不活跃" });
  const result = mergeVersionSnapshots([
    { id: "v1", label: "旧全量", createdAt: "2026-07-01T00:00:00.000Z", snapshot: snapshot("v1", [oldDuplicate, toBusinessRow({ 设备编号: "", 业务名称: "空键旧" })]) },
    { id: "v2", label: "新全量", createdAt: "2026-08-01T00:00:00.000Z", snapshot: snapshot("v2", [newDuplicate, toBusinessRow({ 设备编号: "D-2", 业务名称: "新增设备" }), toBusinessRow({ 设备编号: "", 业务名称: "空键新" })]) },
  ]);
  assert.equal(result.rows.length, 4);
  const merged = result.rows.find((row) => row.deviceCode === "D-1");
  assert.equal(merged?.businessName, "活跃完整名称");
  assert.equal(merged?.provider, "供应商甲");
  assert.equal(merged?.serviceCode, "S-1");
  assert.equal(merged?.monthlyMetering, 123.456789);
  assert.equal(merged?.initialCompletedDate, "2026-01-01");
  assert.equal(merged?.activeStatus, "不活跃");
  assert.equal(merged?.calculationStatus, "恢复计算");
  assert.equal(result.rows.filter((row) => !row.deviceCode).length, 2);
  assert.deepEqual(result.source.deduplication, { keyField: "设备编号", inputRows: 5, outputRows: 4, removedRows: 1, duplicateKeys: 1, blankKeyRows: 2, strategy: "按版本发布时间从旧到新整合；同一设备编号由较新版本的非空字段覆盖，较新空值保留已有值；设备编号为空的记录全部保留" });
});

test("metering rules follow the fixed 2026 Excel formula and do not infer business attributes", () => {
  const input = [
    ["2026-01-01", "新增量"],
    ["2025-07-01", "新量"],
    ["2025-06-01", "存量"],
    ["2016-07-01", "存量"],
    ["2016-06-01", "超期"],
  ].map(([date]) => toBusinessRow({ 业务属性: "", 计量规则: "旧值", 初始完工日期: date }));

  const output = applyDynamicCalculationRules(input, rules("2026-07-28"));
  assert.deepEqual(output.map((row) => row.meteringRule), ["新增量", "新量", "存量", "存量", "超期"]);
  assert.equal(output[0].businessEvent, "待确认");
  assert.equal(output[0].businessEventSource, "待确认");

  const nextYear = applyDynamicCalculationRules(
    [toBusinessRow({ 业务属性: "", 计量规则: "存量", 初始完工日期: "2027-02-01" })],
    rules("2027-08-18"),
  );
  assert.equal(nextYear[0].meteringRule, "新量");

  const missingInitialDate = applyDynamicCalculationRules(
    [toBusinessRow({ 业务属性: "新装", 计量规则: "存量", 完工日期: "2026-02-01" })],
    rules("2026-07-28"),
  );
  assert.equal(missingInitialDate[0].meteringRule, "存量");
  assert.equal(missingInitialDate[0].calculationRuleSource, "CRM静态结果");
});

test("new-volume metrics include changed business and exclude installed stock business", () => {
  const changedNewVolume = toBusinessRow({ 负责人: "销售甲", 业务属性: "变更", 计量规则: "新增量", 线数: "3" });
  const installedStock = toBusinessRow({ 负责人: "销售甲", 业务属性: "新装", 计量规则: "存量", 线数: "2" });
  assert.equal(isNewVolume(changedNewVolume), true);
  assert.equal(isNewVolume(installedStock), false);
  assert.equal(buildBusinessProgress([changedNewVolume, installedStock], "owner", "total")[0].installs, 3);
});

test("same-year install removal uses initial completion for addition and CRM completion for removal", () => {
  const sameYear = toBusinessRow({ 业务属性: "拆机", 初始完工日期: "2026-01-02", 完工日期: "2026-06-03" });
  assert.equal(isSameYearInstallRemoval(sameYear), true);
  assert.equal(isSameYearInstallRemoval(toBusinessRow({ 业务属性: "拆机", 初始完工日期: "2026-01-02", 完工日期: "2025-12-31" })), false);
  assert.equal(isSameYearInstallRemoval(toBusinessRow({ 业务属性: "拆机", 初始完工日期: "2025-12-31", 完工日期: "2026-01-02" })), false);
  assert.equal(isSameYearInstallRemoval(toBusinessRow({ 业务属性: "新装", 初始完工日期: "2026-01-02", 完工日期: "2026-06-03" })), false);
});

test("local date formatting does not use UTC date boundaries", () => {
  assert.equal(localDateISO(new Date(2026, 7, 18, 0, 5)), "2026-08-18");
});
