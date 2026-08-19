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
  const [reportTablesSource, chartTemplateSource, chartBuilderSource, dashboardStoreSource, nextConfigSource, nginxConfigSource] = await Promise.all([
    readFile(new URL("app/components/ReportTables.tsx", root), "utf8"),
    readFile(new URL("app/lib/chart-template.ts", root), "utf8"),
    readFile(new URL("app/components/ChartBuilder.tsx", root), "utf8"),
    readFile(new URL("app/lib/server/dashboard-store.ts", root), "utf8"),
    readFile(new URL("next.config.ts", root), "utf8"),
    readFile(new URL("../deploy/nginx/crm-location.conf", root), "utf8"),
  ]);

  assert.match(gitignore, /public\/data\/local-snapshot\.json/);
  assert.match(registry, /REPORTS/);
  assert.match(syncScript, /providersByCode/);
  assert.match(sourceConfig, /\.\.\/csv_output/);
  assert.match(sourceConfig, /\.xlsx/);
  assert.doesNotMatch(pageSource, /demo-snapshot/);
  assert.doesNotMatch(pageSource, /data\/local-snapshot\.json/);
  assert.match(pageSource, /api\/auth\/session/);
  assert.match(pageSource, /api\/data\/current/);
  assert.match(pageSource, /DataCenterView/);
  assert.match(pageSource, /CURRENT DATA/);
  assert.match(pageSource, /VERSION HISTORY/);
  assert.match(pageSource, /切换到此版本/);
  assert.match(pageSource, /当前只有一个版本/);
  assert.match(pageSource, /多数据源整合/);
  assert.match(pageSource, /api\/data\/compose/);
  assert.match(pageSource, /api\/dashboard\/templates/);
  assert.match(pageSource, /自定义分析总览/);
  assert.match(pageSource, /新建图表/);
  assert.match(pageSource, /分期计算标识/);
  assert.match(pageSource, /用户拆机原因/);
  assert.match(pageSource, /联系人固话（脱敏）/);
  assert.match(pageSource, /结算待复核/);
  assert.match(pageSource, /均可用于版本管理、查询和已有字段筛选/);
  assert.match(pageSource, /activeNav !== "数据中心" && filterBar/);
  assert.match(pageSource, /activeNav === "数据中心" \? content/);
  assert.match(pageSource, /EMPTY_SNAPSHOT/);
  assert.match(pageSource, /MultiSelectGrid/);
  assert.match(pageSource, /pressedAt/);
  assert.match(pageSource, /550/);
  assert.match(importSource, /\.xlsb/);
  assert.match(importSource, /businessIds/);
  assert.match(importSource, /api\/data\/upload/);
  assert.match(importSource, /发布数据版本/);
  assert.match(importSource, /response\.status === 413/);
  assert.match(importSource, /MAX_UPLOAD_FILE_BYTES/);
  assert.doesNotMatch(importSource, /const result = await response\.json/);
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
  assert.match(dataModelSource, /classifyBusinessEvent/);
  assert.match(dataModelSource, /计量规则兜底/);
  assert.match(dataModelSource, /const baseYear = config\.baseDate/);
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
  assert.match(styleSource, /\.filter-options \{ display: flex; flex-wrap: wrap;/);
  assert.match(styleSource, /\.filter-options button \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/);
  assert.match(chartSource, /SVGRenderer/);
  assert.match(chartSource, /renderer: "svg"/);
  assert.match(chartSource, /ConfigurableChart/);
  assert.match(chartTemplateSource, /CHART_FIELDS/);
  assert.match(chartTemplateSource, /DEFAULT_CHART_TEMPLATES/);
  assert.doesNotMatch(chartTemplateSource, /eval\s*\(/);
  assert.match(chartBuilderSource, /LIVE PREVIEW/);
  assert.match(dashboardStoreSource, /revision/);
  assert.match(dashboardStoreSource, /rename\(temporary/);
  assert.match(nextConfigSource, /bodySizeLimit: "110mb"/);
  assert.match(nginxConfigSource, /client_max_body_size 110m/);
  assert.match(sanitizeScript, /local-snapshot\.json/);
  assert.match(pageSource, /BusinessReportTables/);
  assert.match(pageSource, /SalesReportTables/);
  assert.match(pageSource, /ProviderReportTables/);
  assert.match(pageSource, /SupplierReportTables/);
  assert.match(pageSource, /设备编号/);
  assert.match(pageSource, /ProfitTargetTables/);
  assert.match(pageSource, /SettlementReportTables/);
  assert.match(pageSource, /CalculationRulePanel/);
  assert.match(pageSource, /BusinessProgressTables/);
  assert.match(pageSource, /供应商/);
  assert.match(pageSource, /II服务编号/);
  assert.match(pageSource, /crm-calculation-rules/);
  assert.match(pageSource, /跟随当前日期/);
  assert.match(pageSource, /源业务属性/);
  assert.match(reportTablesSource, /不生成模拟金额/);
  assert.match(reportTablesSource, /全年业务拆装情况/);
  assert.match(reportTablesSource, /完工批次留存分析/);
  assert.match(reportTablesSource, /完工日期兜底审计/);
  assert.match(reportTablesSource, /服务商综合分布/);
  assert.match(reportTablesSource, /供应商综合分析/);
  assert.match(reportTablesSource, /总计 \/ 总览/);
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
