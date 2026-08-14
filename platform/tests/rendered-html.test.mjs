import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps local data private and does not fall back to mock records", async () => {
  const [gitignore, registry, syncScript, sourceConfig, pageSource, importSource, dataModelSource, workbookSource, sanitizeScript, styleSource, chartSource] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL("app/lib/report-registry.ts", root), "utf8"),
    readFile(new URL("scripts/sync-local-folder.mjs", root), "utf8"),
    readFile(new URL("config/local-source.json", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/ImportDialog.tsx", root), "utf8"),
    readFile(new URL("app/lib/data-model.ts", root), "utf8"),
    readFile(new URL("app/lib/workbook-import.ts", root), "utf8"),
    readFile(new URL("scripts/sanitize-build.mjs", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/components/AnalyticsCharts.tsx", root), "utf8"),
  ]);
  const reportTablesSource = await readFile(new URL("app/components/ReportTables.tsx", root), "utf8");

  assert.match(gitignore, /public\/data\/local-snapshot\.json/);
  assert.match(registry, /REPORTS/);
  assert.match(syncScript, /providersByCode/);
  assert.match(sourceConfig, /\.\.\/csv_output/);
  assert.match(sourceConfig, /\.xlsx/);
  assert.doesNotMatch(pageSource, /demo-snapshot/);
  assert.match(pageSource, /EMPTY_SNAPSHOT/);
  assert.match(pageSource, /MultiSelectGrid/);
  assert.match(pageSource, /startLongPress/);
  assert.match(pageSource, /550/);
  assert.match(importSource, /\.xlsb/);
  assert.match(importSource, /businessIds/);
  assert.match(dataModelSource, /初始完工日期/);
  assert.match(dataModelSource, /initialCompletedDate \|\| rawCompletedDate/);
  assert.match(dataModelSource, /buildCompletionCohorts/);
  assert.match(dataModelSource, /buildDataQualityMetrics/);
  assert.match(dataModelSource, /const month = row\.completedDate/);
  assert.match(dataModelSource, /buildMonthlyBusiness/);
  assert.match(dataModelSource, /buildNetGrowth/);
  assert.match(dataModelSource, /discountedTariff/);
  assert.match(dataModelSource, /serviceCodeII/);
  assert.match(dataModelSource, /applyDynamicCalculationRules/);
  assert.match(dataModelSource, /buildBusinessProgress/);
  assert.match(dataModelSource, /netMonthlyMetering/);
  assert.match(dataModelSource, /netAverageTariff/);
  assert.match(dataModelSource, /providers: buildRanking\(rows, "service"\)/);
  assert.doesNotMatch(dataModelSource, /\["供应商", "服务商"/);
  assert.match(workbookSource, /flatMap/);
  assert.match(workbookSource, /deduplicateCandidates/);
  assert.match(workbookSource, /keyField: "设备编号"/);
  assert.match(workbookSource, /shouldReplace/);
  assert.match(styleSource, /Readability baseline/);
  assert.match(styleSource, /table \{ font-size: 12px/);
  assert.match(chartSource, /SVGRenderer/);
  assert.match(chartSource, /renderer: "svg"/);
  assert.match(sanitizeScript, /local-snapshot\.json/);
  assert.match(pageSource, /BusinessReportTables/);
  assert.match(pageSource, /SalesReportTables/);
  assert.match(pageSource, /ProviderReportTables/);
  assert.match(pageSource, /ProfitTargetTables/);
  assert.match(pageSource, /SettlementReportTables/);
  assert.match(pageSource, /CalculationRulePanel/);
  assert.match(pageSource, /BusinessProgressTables/);
  assert.match(pageSource, /供应商/);
  assert.match(pageSource, /II服务编号/);
  assert.match(pageSource, /crm-calculation-rules/);
  assert.match(reportTablesSource, /不生成模拟金额/);
  assert.match(reportTablesSource, /全年业务拆装情况/);
  assert.match(reportTablesSource, /完工批次留存分析/);
  assert.match(reportTablesSource, /完工日期兜底审计/);
  assert.match(reportTablesSource, /服务商综合分布/);
  assert.match(reportTablesSource, /服务商拆机排名/);
  assert.match(reportTablesSource, /业务进展多维分析/);
  assert.match(reportTablesSource, /新增月平均计量/);
  assert.match(reportTablesSource, /拆机月平均计量/);
  assert.match(reportTablesSource, /净增长月平均计量/);
  assert.match(reportTablesSource, /净增月平均资费/);
  assert.match(reportTablesSource, /II服务商进单排名/);
  assert.match(reportTablesSource, /结算按业务汇总/);
  assert.doesNotMatch(reportTablesSource, /身份证号码|银行卡号|手机号码/);
  await assert.rejects(access(new URL("public/data/demo-snapshot.json", root)));
  await assert.rejects(access(new URL("dist/client/data/local-snapshot.json", root)));
  await assert.rejects(access(new URL("dist/standalone/dist/client/data/local-snapshot.json", root)));
  await assert.rejects(access(new URL("dist/standalone/public/data/local-snapshot.json", root)));
});
