"use client";

import { useState, type ReactNode } from "react";
import {
  buildBusinessProgress,
  buildAnnualRemovalSummary,
  buildDoubleLineAssessment,
  buildCompletionCohorts,
  buildDataQualityMetrics,
  buildMonthlyBusiness,
  buildSalesNetGrowth,
  buildPerformance,
  buildServiceCombinationRows,
  buildServicePolicyDistribution,
  isActive,
  isRemoval,
  isSettlementReviewCandidate,
  type BusinessRow,
  type CalculationRuleConfig,
  type NumericValue,
} from "../lib/data-model";
import { REPORTS } from "../lib/report-registry";
import { formatWan } from "../lib/formatting";

type CellValue = ReactNode;
type TableRow = Record<string, CellValue>;
type Column = { key: string; label: string; numeric?: boolean };

const number = (value: NumericValue, digits = 0) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const money = (value: NumericValue) => value === null ? "--" : `${formatWan(value)} 元`;
const percent = (value: NumericValue) => value === null ? "--" : `${number(value, 1)}%`;
const knownSum = (values: NumericValue[]): NumericValue => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};
const lineCount = (row: BusinessRow) => row.lines ?? 1;

function buildAnnualAuditRows(rows: BusinessRow[], year?: string) {
  const duplicateDevices = new Map<string, number>();
  for (const row of rows) if (row.deviceCode) duplicateDevices.set(row.deviceCode, (duplicateDevices.get(row.deviceCode) ?? 0) + 1);
  return rows.flatMap((row, index) => {
    const issues: string[] = [];
    const rawYear = row.rawCompletedDate.slice(0, 4);
    if (!row.rawCompletedDate) issues.push("完工日期为空");
    if (row.initialCompletedDate && row.rawCompletedDate && row.initialCompletedDate !== row.rawCompletedDate) issues.push("初始完工日期与完工日期不一致");
    if (row.businessEvent === "拆机" && year && rawYear !== year) issues.push("业务属性为拆机但不在统计年度");
    if (year && rawYear === year && row.businessEvent === "待确认") issues.push("完工日期在统计年度但业务属性待确认");
    if (row.deviceCode && (duplicateDevices.get(row.deviceCode) ?? 0) > 1) issues.push("设备编号重复");
    if (row.monthlyMetering === null) issues.push("月平均计量为空");
    if (!issues.length) return [];
    return [{
      key: `${row.deviceCode || "blank"}-${index}`,
      deviceCode: row.deviceCode || "--",
      businessEvent: row.businessEvent || "待确认",
      rawDate: row.rawCompletedDate || "--",
      initialDate: row.initialCompletedDate || "--",
      metering: money(row.monthlyMetering),
      issues: issues.join("；"),
    }];
  });
}

function ReportPanel({ label, title, description, status = "ready", children, wide = false }: {
  label: string;
  title: string;
  description: string;
  status?: "ready" | "partial" | "pending";
  children: ReactNode;
  wide?: boolean;
}) {
  const statusText = status === "ready" ? "当前数据可计算" : status === "partial" ? "部分字段可计算" : "待补数据";
  return <article className={`panel report-table-panel ${wide ? "wide-panel" : ""}`}>
    <div className="panel-header"><div><span className="section-label">{label}</span><h2>{title}</h2><p>{description}</p></div><span className={`status-chip ${status}`}>{statusText}</span></div>
    {children}
  </article>;
}

export function BusinessProgressTables({ rows, rules }: { rows: BusinessRow[]; rules: CalculationRuleConfig }) {
  const [dimension, setDimension] = useState<"company" | "owner" | "supplier" | "service" | "service2">("company");
  const dimensions = [["company", "公司总体"], ["owner", "各销售"], ["supplier", "供应商"], ["service", "I服务商"], ["service2", "II服务商"]] as const;
  const formatProgress = (item: ReturnType<typeof buildBusinessProgress>[number]) => ({
    key: item.key, label: item.label, total: number(item.totalLines), installs: number(item.installs), installAmount: money(item.installMonthlyMetering),
    removals: number(item.removals), removalAmount: money(item.removalMonthlyMetering), removalRate: percent(item.removalRate),
    netGrowth: number(item.netGrowth), netAmount: money(item.netMonthlyMetering), netTariff: money(item.netAverageTariff), amount: money(item.monthlyMetering),
    newMargin: money(item.newGrossProfit), stockMargin: money(item.stockGrossProfit),
  });
  const progressRows = buildBusinessProgress(rows, dimension, rules.removalRateDenominator).map((item) => formatProgress(item));
  const overall = buildBusinessProgress(rows, "company", rules.removalRateDenominator)[0];
  const summary = overall ? { ...formatProgress(overall), key: "summary", label: "总计 / 总览" } : undefined;
  const denominatorText = rules.removalRateDenominator === "total" ? "拆机线数 / 总线数" : "拆机线数 / 新增线数";
  return <section className="module-grid report-module-grid"><ReportPanel wide label="BUSINESS PROGRESS" title="业务进展多维分析" status="partial" description={`同一套指标支持公司、销售、供应商、I服务商和II服务商切换；当前拆机率口径：${denominatorText}。净增长月平均计量＝新增月平均计量－拆机月平均计量；净增月平均资费＝净增长月平均计量÷净增长线路数，净增长线路数为0时显示--。`}>
    <div className="dimension-tabs" role="tablist" aria-label="业务进展分析维度">{dimensions.map(([key, label]) => <button key={key} className={dimension === key ? "active" : ""} onClick={() => setDimension(key)}>{label}</button>)}</div>
    <ReportTable columns={[{ key: "label", label: "分析对象" }, { key: "total", label: "总线路数", numeric: true }, { key: "amount", label: "总月平均计量", numeric: true }, { key: "installs", label: "新增线路数", numeric: true }, { key: "installAmount", label: "新增月平均计量", numeric: true }, { key: "removals", label: "拆机线路数", numeric: true }, { key: "removalAmount", label: "拆机月平均计量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }, { key: "netGrowth", label: "净增长线路数", numeric: true }, { key: "netAmount", label: "净增长月平均计量", numeric: true }, { key: "netTariff", label: "净增月平均资费", numeric: true }, { key: "newMargin", label: "新增毛利", numeric: true }, { key: "stockMargin", label: "存量毛利", numeric: true }]} rows={progressRows} summary={summary} emptyText={dimension === "service2" ? "当前筛选记录没有II服务编号" : "暂无匹配数据"} />
    {progressRows.every((row) => row.newMargin === "--" && row.stockMargin === "--") && <div className="availability-note"><strong>毛利暂未启用</strong><span>需补充运营有效金额、结算有效金额及新增/存量毛利规则。</span></div>}
  </ReportPanel></section>;
}

export function NetGrowthOverview({ rows }: { rows: BusinessRow[] }) {
  const installs = rows.filter((row) => row.businessEvent === "新装");
  const removals = rows.filter((row) => row.businessEvent === "拆机");
  const sum = (values: NumericValue[]) => knownSum(values);
  const installLines = installs.reduce((total, row) => total + (row.lines ?? 1), 0);
  const removalLines = removals.reduce((total, row) => total + (row.lines ?? 1), 0);
  const installAmount = sum(installs.map((row) => row.monthlyMetering));
  const removalAmount = sum(removals.map((row) => row.monthlyMetering));
  const netAmount = installAmount !== null && removalAmount !== null ? installAmount - removalAmount : null;
  return <ReportPanel wide label="NET GROWTH OVERVIEW" title="净增长分析" description="按当前筛选结果汇总新增与拆机线路、月平均计量及净增长月平均计量。">
    <ReportTable columns={[{ key: "installs", label: "新增线路", numeric: true }, { key: "installAmount", label: "新增月平均计量", numeric: true }, { key: "removals", label: "拆机线路", numeric: true }, { key: "removalAmount", label: "拆机月平均计量", numeric: true }, { key: "netAmount", label: "净增长月平均计量", numeric: true }]} rows={[{ key: "overview", installs: number(installLines), installAmount: money(installAmount), removals: number(removalLines), removalAmount: money(removalAmount), netAmount: money(netAmount) }]} />
  </ReportPanel>;
}

export function DoubleLineOverview({ rows }: { rows: BusinessRow[] }) {
  const [target, setTarget] = useState("0.75");
  const targetValue = target === "custom" ? 0.75 : Number(target);
  const assessment = buildDoubleLineAssessment(rows, targetValue);
  const [customTarget, setCustomTarget] = useState("75");
  const actualTarget = target === "custom" ? Math.max(0.01, Number(customTarget) / 100 || 0.75) : targetValue;
  const result = target === "custom" ? buildDoubleLineAssessment(rows, actualTarget) : assessment;
  const formatRatio = (value: NumericValue) => value === null ? "--" : `${number(value, 1)}%`;
  const rowsToDisplay = [{
    key: "assessment",
    installLines: number(result.installLines), installConvertedLines: number(result.installConvertedLines), installTotalLines: number(result.installTotalLines),
    removalLines: number(result.removalLines), removalConvertedLines: number(result.removalConvertedLines), removalTotalLines: number(result.removalTotalLines),
    rawRatio: formatRatio(result.rawRatio), convertedRatio: formatRatio(result.convertedRatio), rawPendingLines: number(result.rawPendingLines), convertedPendingLines: number(result.convertedPendingLines),
  }];
  return <ReportPanel wide label="DOUBLE-LINE ASSESSMENT" title="双线拆装比" description="折算规则：月平均资费低于10,000元不折算；10,000元起每满2,000元计1线，最高20线；新增和拆机使用同一口径。">
    <div className="dimension-tabs" role="group" aria-label="拆装比考核档位"><span className="section-label">考核目标</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="0.68">68%</option><option value="0.75">75%</option><option value="custom">自定义</option></select>{target === "custom" && <label><span className="sr-only">自定义拆装比</span><input type="number" min="1" max="200" step="0.1" value={customTarget} onChange={(event) => setCustomTarget(event.target.value)} />%</label>}</div>
    <ReportTable columns={[{ key: "installLines", label: "新增线路数", numeric: true }, { key: "installConvertedLines", label: "新增折算线路数", numeric: true }, { key: "installTotalLines", label: "合计新增线路数", numeric: true }, { key: "removalLines", label: "拆机线路数", numeric: true }, { key: "removalConvertedLines", label: "拆机折算线路数", numeric: true }, { key: "removalTotalLines", label: "合计拆机线路数", numeric: true }, { key: "rawRatio", label: "原始拆装比", numeric: true }, { key: "convertedRatio", label: "折算拆装比", numeric: true }, { key: "rawPendingLines", label: "原始待补线路数", numeric: true }, { key: "convertedPendingLines", label: "折算后待补线路数", numeric: true }]} rows={rowsToDisplay} />
  </ReportPanel>;
}

function ReportTable({ columns, rows, summary, emptyText = "暂无匹配数据" }: { columns: Column[]; rows: TableRow[]; summary?: TableRow; emptyText?: string }) {
  return <div className="table-scroll report-table"><table><thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "number" : ""}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row, index) => <tr key={String(row.key ?? index)}>{columns.map((column) => <td key={column.key} className={column.numeric ? "number" : ""}>{row[column.key] ?? "--"}</td>)}</tr>) : <tr><td className="empty-cell" colSpan={columns.length}>--　{emptyText}</td></tr>}</tbody>
    {rows.length && summary ? <tfoot><tr>{columns.map((column) => <td key={column.key} className={column.numeric ? "number" : ""}>{summary[column.key] ?? "--"}</td>)}</tr></tfoot> : null}</table></div>;
}

function UnavailableTable({ columns, missing, note }: { columns: string[]; missing: string[]; note?: string }) {
  return <><div className="availability-note"><strong>不生成模拟金额</strong><span>{note ?? "补齐并确认下列输入后，才会启用正式计算。"}</span></div>
    <ReportTable columns={columns.map((label, index) => ({ key: `c${index}`, label, numeric: /金额|业务额|毛利|占比|线数|数量|差异|目标/.test(label) }))} rows={[]} emptyText="字段结构已建立，当前没有可复核的数据" />
    <div className="missing-fields report-missing">{missing.map((field) => <span key={field}>{field}</span>)}</div></>;
}

export function BusinessReportTables({ rows, year }: { rows: BusinessRow[]; year?: string }) {
  const monthlyYear = year || [...new Set(rows.map((row) => row.rawCompletedDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().at(-1);
  const monthlyData = buildMonthlyBusiness(rows, monthlyYear);
  const annualRemovalData = buildAnnualRemovalSummary(rows, "2026");
  const monthly = monthlyData.map((item) => ({
    key: item.month,
    month: item.month,
    installs: number(item.installs),
    installAmount: money(item.installAmount),
    removals: number(item.removals),
    removalAmount: money(item.removalAmount),
    activeLines: number(item.activeLines),
    activeAmount: money(item.activeAmount),
    quarterTarget: "--",
    quarterCompletion: "--",
    annualTarget: "--",
    annualCompletion: "--",
    ratio: percent(item.installRemovalRatio),
    quarterRatioTarget: "--",
    quarterRatio: "--",
    annualRatio: "--",
  }));
  const cohortData = buildCompletionCohorts(rows);
  const cohorts = cohortData.map((item) => ({
    key: item.month,
    month: item.month,
    lines: number(item.lines),
    activeLines: number(item.activeLines),
    removalLines: number(item.removalLines),
    activeRate: percent(item.activeRate),
    amount: money(item.monthlyMetering),
    activeAmount: money(item.activeMonthlyMetering),
  }));
  const monthlyInstalls = monthlyData.reduce((sum, item) => sum + item.installs, 0);
  const monthlyRemovals = monthlyData.reduce((sum, item) => sum + item.removals, 0);
  const monthlySummary = {
    key: "summary", month: "总计 / 总览", installs: number(monthlyInstalls), installAmount: money(knownSum(monthlyData.map((item) => item.installAmount))),
    removals: number(monthlyRemovals), removalAmount: money(knownSum(monthlyData.map((item) => item.removalAmount))), activeLines: number(monthlyData.reduce((sum, item) => sum + item.activeLines, 0)),
    activeAmount: money(knownSum(monthlyData.map((item) => item.activeAmount))), quarterTarget: "--", quarterCompletion: "--", annualTarget: "--", annualCompletion: "--",
    ratio: percent(monthlyInstalls ? monthlyRemovals / monthlyInstalls * 100 : null), quarterRatioTarget: "--", quarterRatio: "--", annualRatio: "--",
  };
  const cohortLines = cohortData.reduce((sum, item) => sum + item.lines, 0);
  const cohortActive = cohortData.reduce((sum, item) => sum + item.activeLines, 0);
  const cohortSummary = {
    key: "summary", month: "总计 / 总览", lines: number(cohortLines), activeLines: number(cohortActive), removalLines: number(cohortData.reduce((sum, item) => sum + item.removalLines, 0)),
    activeRate: percent(cohortLines ? cohortActive / cohortLines * 100 : null), amount: money(knownSum(cohortData.map((item) => item.monthlyMetering))), activeAmount: money(knownSum(cohortData.map((item) => item.activeMonthlyMetering))),
  };
  const auditRows = buildAnnualAuditRows(rows, monthlyYear);
  const annualRemovalRows = annualRemovalData.map((item) => ({
    key: item.month,
    month: item.month,
    records: number(item.records),
    lines: number(item.lines),
    monthlyMetering: money(item.monthlyMetering),
    discountedTariff: money(item.discountedTariff),
  }));
  const annualRemovalSummary = {
    key: "summary",
    month: "2026 年总计",
    records: number(annualRemovalData.reduce((sum, item) => sum + item.records, 0)),
    lines: number(annualRemovalData.reduce((sum, item) => sum + item.lines, 0)),
    monthlyMetering: money(knownSum(annualRemovalData.map((item) => item.monthlyMetering))),
    discountedTariff: money(knownSum(annualRemovalData.map((item) => item.discountedTariff))),
  };
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="ANNUAL INSTALL / REMOVAL" title="全年业务拆装情况" status="partial" description={`统计年度：${monthlyYear || "--"}；月份字段：源表完工日期；新装/当年拆机按业务属性统计。当前活跃为当前状态，不代表历史月末状态。`}>
      <ReportTable columns={[
        { key: "month", label: "月份" }, { key: "installs", label: "新装线数", numeric: true }, { key: "installAmount", label: "新装月平均计量", numeric: true },
        { key: "removals", label: "当年拆机线数", numeric: true }, { key: "removalAmount", label: "拆机月平均计量", numeric: true }, { key: "activeLines", label: "当前活跃线数", numeric: true },
        { key: "activeAmount", label: "当前活跃月平均计量", numeric: true }, { key: "quarterTarget", label: "季度目标", numeric: true }, { key: "quarterCompletion", label: "季度完成比", numeric: true },
        { key: "annualTarget", label: "全年目标", numeric: true }, { key: "annualCompletion", label: "全年完成比", numeric: true }, { key: "ratio", label: "月度拆装比", numeric: true },
        { key: "quarterRatioTarget", label: "季度拆装比目标", numeric: true }, { key: "quarterRatio", label: "季度拆装比", numeric: true }, { key: "annualRatio", label: "全年拆装比", numeric: true },
      ]} rows={monthly} summary={monthlySummary} />
    </ReportPanel>
    <ReportPanel wide label="ANNUAL REMOVAL SUMMARY" title="2026 年度拆机汇总" description="纳入条件：业务属性（平台）为“拆机”，且 CRM 源表完工日期在 2026 年；按完工月份汇总。不使用初始完工日期或平台日期兜底。">
      <ReportTable columns={[
        { key: "month", label: "完工月份（CRM）" }, { key: "records", label: "拆机业务数", numeric: true }, { key: "lines", label: "拆机线数", numeric: true },
        { key: "monthlyMetering", label: "月平均计量", numeric: true }, { key: "discountedTariff", label: "优惠资费", numeric: true },
      ]} rows={annualRemovalRows} summary={annualRemovalSummary} emptyText="当前筛选结果中没有符合条件的 2026 年拆机记录" />
    </ReportPanel>
    <ReportPanel wide label="COMPLETION COHORT" title="完工批次留存分析" description="按统计完工月份形成批次；统计完工日期优先取初始完工日期，缺失时使用完工日期兜底。">
      <ReportTable columns={[
        { key: "month", label: "有效完工月份" }, { key: "lines", label: "完工线数", numeric: true }, { key: "activeLines", label: "当前活跃线数", numeric: true },
        { key: "removalLines", label: "拆机线数", numeric: true }, { key: "activeRate", label: "当前活跃率", numeric: true },
        { key: "amount", label: "月平均计量", numeric: true }, { key: "activeAmount", label: "活跃月平均计量", numeric: true },
      ]} rows={cohorts} summary={cohortSummary} />
    </ReportPanel>
    <ReportPanel wide label="ANNUAL RECONCILIATION" title="年度拆装异常对账" status={auditRows.length ? "partial" : "ready"} description="仅列出需要人工复核的记录，不修改源数据。检查完工日期完整性、日期差异、年度归属、业务属性、设备唯一键和月平均计量。">
      <ReportTable columns={[{ key: "deviceCode", label: "设备编号" }, { key: "businessEvent", label: "业务属性（平台）" }, { key: "rawDate", label: "完工日期（CRM）" }, { key: "initialDate", label: "初始完工日期" }, { key: "metering", label: "月平均计量", numeric: true }, { key: "issues", label: "异常项" }]} rows={auditRows} emptyText="当前年度没有发现需人工复核的拆装异常" />
    </ReportPanel>
  </section>;
}

export function SalesReportTables({ rows }: { rows: BusinessRow[] }) {
  const performanceData = buildPerformance(rows, "owner", { amount: "discountedTariff" });
  const performance = performanceData.map((item) => ({
    key: item.key, owner: item.label, lines: number(item.lines), amount: money(item.amount), average: money(item.average), share: percent(item.share), rank: item.rank,
  }));
  const netGrowthData = buildSalesNetGrowth(rows);
  const netGrowth = netGrowthData.map((item) => ({
    key: item.owner, owner: item.owner, additions: number(item.additions), additionAmount: money(item.additionAmount), sameYearRemovals: number(item.sameYearRemovals), sameYearRemovalAmount: money(item.sameYearRemovalAmount), netLines: number(item.netLines), netAmount: money(item.netAmount), annualRemovals: number(item.annualRemovals), annualRemovalAmount: money(item.annualRemovalAmount), ratio: percent(item.sameYearRemovalRate),
  }));
  const marketingData = buildPerformance(rows, "owner", { amount: "marketingFee" });
  const marketing = marketingData.map((item) => ({ key: item.key, owner: item.label, lines: number(item.lines), amount: money(item.amount) }));
  const performanceLines = performanceData.reduce((sum, item) => sum + item.lines, 0);
  const performanceAmount = knownSum(performanceData.map((item) => item.amount));
  const performanceSummary = { key: "summary", owner: "总计 / 总览", lines: number(performanceLines), amount: money(performanceAmount), average: money(performanceAmount === null ? null : performanceAmount / Math.max(performanceLines, 1)), share: performanceData.length ? "100.0%" : "--", rank: "--" };
  const marketingSummary = { key: "summary", owner: "总计 / 总览", lines: number(marketingData.reduce((sum, item) => sum + item.lines, 0)), amount: money(knownSum(marketingData.map((item) => item.amount))) };
  const netAdditions = netGrowthData.reduce((sum, item) => sum + item.additions, 0);
  const netSameYearRemovals = netGrowthData.reduce((sum, item) => sum + item.sameYearRemovals, 0);
  const netSummary = { key: "summary", owner: "总计 / 总览", additions: number(netAdditions), additionAmount: money(knownSum(netGrowthData.map((item) => item.additionAmount))), sameYearRemovals: number(netSameYearRemovals), sameYearRemovalAmount: money(knownSum(netGrowthData.map((item) => item.sameYearRemovalAmount))), netLines: number(netAdditions - netSameYearRemovals), netAmount: money(knownSum(netGrowthData.map((item) => item.netAmount))), annualRemovals: number(netGrowthData.reduce((sum, item) => sum + item.annualRemovals, 0)), annualRemovalAmount: money(knownSum(netGrowthData.map((item) => item.annualRemovalAmount))), ratio: percent(netAdditions ? netSameYearRemovals / netAdditions * 100 : null) };
  return <section className="module-grid report-module-grid">
    <ReportPanel label="SALES COMPLETION" title="销售完成情况（优惠资费口径）" status="partial" description="业务额取源表优惠资费有效值；空值不按月平均计量替代。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "业务额", numeric: true }, { key: "average", label: "业务均值", numeric: true }, { key: "share", label: "贡献率", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={performance} summary={performanceSummary} />
    </ReportPanel>
    <ReportPanel label="MARKETING COST" title="营销增值费用分析" status="partial" description="金额取增值或营销字段；无有效金额时显示 --。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "金额", numeric: true }]} rows={marketing} summary={marketingSummary} />
    </ReportPanel>
    <ReportPanel wide label="NET GROWTH" title="销售业务净增情况" description="新增口径：当前计量规则为“新增量”或初始完工日期在 2026 年。净增扣减“当年新增当年拆机”：同时符合新增口径、业务属性为拆机且 CRM 完工日期在 2026 年。末列“2026 年度拆机”仅按业务属性为拆机且 CRM 完工日期在 2026 年统计，不混入净增。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "additions", label: "新增线数", numeric: true }, { key: "additionAmount", label: "新增业务量", numeric: true }, { key: "sameYearRemovals", label: "当年新增当年拆机线数", numeric: true }, { key: "sameYearRemovalAmount", label: "当年新增当年拆机业务量", numeric: true }, { key: "netLines", label: "净增线数", numeric: true }, { key: "netAmount", label: "净增业务量", numeric: true }, { key: "annualRemovals", label: "2026 年度拆机线数", numeric: true }, { key: "annualRemovalAmount", label: "2026 年度拆机业务量", numeric: true }, { key: "ratio", label: "当年新增拆机率", numeric: true }]} rows={netGrowth} summary={netSummary} />
    </ReportPanel>
  </section>;
}

export function ProviderReportTables({ rows }: { rows: BusinessRow[] }) {
  const serviceData = buildPerformance(rows, "service");
  const removalData = buildPerformance(rows, "service", { removalsOnly: true });
  const serviceIIData = buildPerformance(rows, "service2");
  const toRows = (data: ReturnType<typeof buildPerformance>) => data.slice(0, 10).map((item) => ({
    key: item.key, code: item.label, name: item.secondary || "--", lines: number(item.lines), amount: money(item.amount), share: percent(item.share), rank: item.rank,
  }));
  const rankingSummary = (data: ReturnType<typeof buildPerformance>) => ({ key: "summary", code: "总计 / 总览", name: "--", lines: number(data.reduce((sum, item) => sum + item.lines, 0)), amount: money(knownSum(data.map((item) => item.amount))), share: data.length ? "100.0%" : "--", rank: "--" });
  const categories = new Map<string, BusinessRow[]>();
  for (const row of rows) if (row.providerCategory) categories.set(row.providerCategory, [...(categories.get(row.providerCategory) ?? []), row]);
  const categoryRows = [...categories.entries()].map(([category, group]) => {
    const removed = group.filter(isRemoval);
    return { key: category, category, lines: number(group.length), amount: money(group.reduce((sum, row) => sum + (row.monthlyMetering ?? 0), 0)), removalRate: percent(group.length ? (removed.length / group.length) * 100 : null), note: "服务分类取源表原值" };
  });
  const services = new Map<string, BusinessRow[]>();
  for (const row of rows) if (row.serviceCode) services.set(row.serviceCode, [...(services.get(row.serviceCode) ?? []), row]);
  const providerOverview = [...services.entries()].map(([code, group]) => {
    const removals = group.filter(isRemoval);
    const active = group.filter((row) => /活跃|正常/.test(row.activeStatus) && !/不活跃|停止|暂停/.test(row.activeStatus));
    const lines = group.reduce((sum, row) => sum + (row.lines ?? 1), 0);
    const removalLines = removals.reduce((sum, row) => sum + (row.lines ?? 1), 0);
    return {
      key: code,
      code,
      name: group.find((row) => row.serviceName)?.serviceName || "--",
      lines: number(lines),
      activeLines: number(active.reduce((sum, row) => sum + (row.lines ?? 1), 0)),
      removalLines: number(removalLines),
      amount: money(group.reduce((sum, row) => sum + (row.monthlyMetering ?? 0), 0)),
      removalRate: percent(lines ? (removalLines / lines) * 100 : null),
    };
  }).sort((left, right) => Number(String(right.lines).replace(/,/g, "")) - Number(String(left.lines).replace(/,/g, "")));
  const serviceRows = rows.filter((row) => row.serviceCode);
  const serviceLines = serviceRows.reduce((sum, row) => sum + lineCount(row), 0);
  const activeLines = serviceRows.filter(isActive).reduce((sum, row) => sum + lineCount(row), 0);
  const removalLines = serviceRows.filter(isRemoval).reduce((sum, row) => sum + lineCount(row), 0);
  const providerOverviewSummary = { key: "summary", code: "总计 / 总览", name: "--", lines: number(serviceLines), activeLines: number(activeLines), removalLines: number(removalLines), amount: money(knownSum(serviceRows.map((row) => row.monthlyMetering))), removalRate: percent(serviceLines ? removalLines / serviceLines * 100 : null) };
  const categorizedRows = rows.filter((row) => row.providerCategory);
  const categorizedRemovals = categorizedRows.filter(isRemoval);
  const categorySummary = { key: "summary", category: "总计 / 总览", lines: number(categorizedRows.length), amount: money(knownSum(categorizedRows.map((row) => row.monthlyMetering))), removalRate: percent(categorizedRows.length ? categorizedRemovals.length / categorizedRows.length * 100 : null), note: "仅汇总有服务分类的记录" };
  const combinations = buildServiceCombinationRows(rows).map((item) => ({
    key: item.key, serviceCode: item.serviceCode, serviceName: item.serviceName, serviceCodeII: item.serviceCodeII, serviceNameII: item.serviceNameII,
    records: number(item.records), lines: number(item.lines), newVolumeRecords: number(item.newVolumeRecords), newVolumeAmount: money(item.newVolumeAmount), stockRecords: number(item.stockRecords), stockAmount: money(item.stockAmount), monthlyMetering: money(item.monthlyMetering),
  }));
  const policyDistributionRaw = buildServicePolicyDistribution(rows);
  const policyDistribution = policyDistributionRaw.map((item) => ({
    key: item.key, policy: item.policy, belowAuthorizedPrice: item.belowAuthorizedPrice,
    serviceOneRecords: number(item.serviceOneRecords), serviceTwoRecords: number(item.serviceTwoRecords), totalServiceRecords: number(item.totalServiceRecords),
    serviceOneLines: number(item.serviceOneLines), serviceTwoLines: number(item.serviceTwoLines), totalServiceLines: number(item.totalServiceLines),
    serviceOneAmount: money(item.serviceOneAmount), serviceTwoAmount: money(item.serviceTwoAmount), totalServiceAmount: money(item.totalServiceAmount),
  }));
  const policySummaryRaw = policyDistributionRaw;
  const policySummary = policySummaryRaw.length ? {
    key: "summary", policy: "总计 / 总览", belowAuthorizedPrice: "--",
    serviceOneRecords: number(policySummaryRaw.reduce((sum, item) => sum + item.serviceOneRecords, 0)), serviceTwoRecords: number(policySummaryRaw.reduce((sum, item) => sum + item.serviceTwoRecords, 0)), totalServiceRecords: number(policySummaryRaw.reduce((sum, item) => sum + item.totalServiceRecords, 0)),
    serviceOneLines: number(policySummaryRaw.reduce((sum, item) => sum + item.serviceOneLines, 0)), serviceTwoLines: number(policySummaryRaw.reduce((sum, item) => sum + item.serviceTwoLines, 0)), totalServiceLines: number(policySummaryRaw.reduce((sum, item) => sum + item.totalServiceLines, 0)),
    serviceOneAmount: money(knownSum(policySummaryRaw.map((item) => item.serviceOneAmount))), serviceTwoAmount: money(knownSum(policySummaryRaw.map((item) => item.serviceTwoAmount))), totalServiceAmount: money(knownSum(policySummaryRaw.map((item) => item.totalServiceAmount))),
  } : undefined;
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="PROVIDER OVERVIEW" title="服务商综合分布" description="按 I 服务编号汇总进单、当前活跃、拆机、计量与拆机率，便于在同一张表比较规模和留存。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "总线数", numeric: true }, { key: "activeLines", label: "活跃线数", numeric: true }, { key: "removalLines", label: "拆机线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }]} rows={providerOverview} summary={providerOverviewSummary} />
    </ReportPanel>
    <ReportPanel label="TOP 10 PROVIDERS" title="服务商进单排名" description="按 I 服务编号汇总当前筛选记录，排名依据月平均计量。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={toRows(serviceData)} summary={rankingSummary(serviceData)} />
    </ReportPanel>
    <ReportPanel label="TOP 10 REMOVALS" title="服务商拆机排名" description="仅统计业务属性判断（平台）为拆机的记录；明确的拆机、退订或注销不会被新增量兜底覆盖。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "拆机线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={toRows(removalData)} summary={rankingSummary(removalData)} />
    </ReportPanel>
    <ReportPanel wide label="II SERVICE PROVIDERS" title="II服务商进单排名" status="partial" description="按II服务编号汇总；II服务编号为空的记录不纳入排名，也不会用供应商名称代替。">
      <ReportTable columns={[{ key: "code", label: "II 服务编号" }, { key: "name", label: "II 服务简称" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={toRows(serviceIIData)} summary={rankingSummary(serviceIIData)} emptyText="当前筛选记录没有II服务编号" />
    </ReportPanel>
    <ReportPanel wide label="I + II SERVICE COMBINATION" title="I / II 服务组合分析" status="partial" description="按同一 CRM 记录的 I、II 服务组合汇总。新量、存量采用计量规则（按当前日期计算）；缺少任一服务编号的记录仍保留，不用供应商名称替代。">
      <ReportTable columns={[{ key: "serviceCode", label: "I 服务编号" }, { key: "serviceName", label: "I 服务简称" }, { key: "serviceCodeII", label: "II 服务编号" }, { key: "serviceNameII", label: "II 服务简称" }, { key: "records", label: "业务记录", numeric: true }, { key: "lines", label: "线数", numeric: true }, { key: "newVolumeRecords", label: "新量记录", numeric: true }, { key: "newVolumeAmount", label: "新量月平均计量", numeric: true }, { key: "stockRecords", label: "存量记录", numeric: true }, { key: "stockAmount", label: "存量月平均计量", numeric: true }, { key: "monthlyMetering", label: "合计月平均计量", numeric: true }]} rows={combinations} emptyText="当前筛选记录没有 I 或 II 服务编号" />
    </ReportPanel>
    <ReportPanel wide label="SERVICE POLICY DISTRIBUTION" title="服务商新量、存量政策分布" status="partial" description="按服务侧统计：同一记录同时有 I、II 服务时分别计入 I 服务和 II 服务，合计即 I 服务 + II 服务。因此合计服务项可能大于业务记录数；可通过“是否低于授权价”筛选联动分析。">
      <ReportTable columns={[{ key: "policy", label: "计量规则（按当前日期计算）" }, { key: "belowAuthorizedPrice", label: "是否低于授权价" }, { key: "serviceOneRecords", label: "I服务记录", numeric: true }, { key: "serviceTwoRecords", label: "II服务记录", numeric: true }, { key: "totalServiceRecords", label: "合计服务记录", numeric: true }, { key: "serviceOneLines", label: "I服务线数", numeric: true }, { key: "serviceTwoLines", label: "II服务线数", numeric: true }, { key: "totalServiceLines", label: "合计服务线数", numeric: true }, { key: "serviceOneAmount", label: "I服务月平均计量", numeric: true }, { key: "serviceTwoAmount", label: "II服务月平均计量", numeric: true }, { key: "totalServiceAmount", label: "合计服务月平均计量", numeric: true }]} rows={policyDistribution} summary={policySummary} emptyText="当前筛选没有新量或存量服务记录" />
    </ReportPanel>
    <ReportPanel wide label="PROVIDER CATEGORY" title="年拆机服务商分类占比" status="partial" description="服务分类当前可能因脱敏而全部为空；系统不会自动补齐。">
      <ReportTable columns={[{ key: "category", label: "I 服务分类" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "业务量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }, { key: "note", label: "备注" }]} rows={categoryRows} summary={categorySummary} emptyText="服务分类为空或当前筛选无记录" />
    </ReportPanel>
  </section>;
}

export function SupplierReportTables({ rows }: { rows: BusinessRow[] }) {
  const data = buildPerformance(rows, "provider");
  const performance = data.map((item) => ({
    key: item.key,
    supplier: item.label,
    lines: number(item.lines),
    amount: money(item.amount),
    average: money(item.average),
    share: percent(item.share),
    rank: item.rank,
  }));
  const lines = data.reduce((sum, item) => sum + item.lines, 0);
  const amount = knownSum(data.map((item) => item.amount));
  const summary = { key: "summary", supplier: "总计 / 总览", lines: number(lines), amount: money(amount), average: money(amount === null ? null : amount / Math.max(lines, 1)), share: data.length ? "100.0%" : "--", rank: "--" };
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="SUPPLIER ANALYSIS" title="供应商综合分析" description="严格按源表供应商字段汇总；供应商与服务编号口径分开，不互相替代。">
      <ReportTable columns={[{ key: "supplier", label: "供应商" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "average", label: "平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={performance} summary={summary} />
    </ReportPanel>
  </section>;
}

export function DataQualityReportTables({ rows }: { rows: BusinessRow[] }) {
  const metrics = buildDataQualityMetrics(rows);
  const auditRows = rows.filter((row) => row.completionDateSource !== "初始完工日期").map((row, index) => ({
    key: `${row.deviceCode || "blank"}-${index}`,
    serviceCode: row.serviceCode || "--",
    owner: row.owner || "--",
    initialDate: row.initialCompletedDate || "--",
    rawDate: row.rawCompletedDate || "--",
    effectiveDate: row.completedDate || "--",
    source: row.completionDateSource,
  }));
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="DATA QUALITY" title="数据质量检查" description="检查设备唯一键和日期完整性；只输出异常，不修改源数据。">
      <div className="quality-metric-grid">{metrics.map((metric) => <div className={`quality-metric ${metric.status}`} key={metric.key}><span>{metric.label}</span><strong>{number(metric.value)}</strong><small>{metric.description}</small></div>)}</div>
    </ReportPanel>
    <ReportPanel wide label="DATE FALLBACK AUDIT" title="完工日期兜底审计" description="仅展示未使用初始完工日期的记录，便于核对统计完工日期来源。">
      <ReportTable columns={[{ key: "serviceCode", label: "I 服务编号" }, { key: "owner", label: "负责人" }, { key: "initialDate", label: "初始完工日期" }, { key: "rawDate", label: "完工日期" }, { key: "effectiveDate", label: "统计完工日期（平台）" }, { key: "source", label: "日期取值来源（平台）" }]} rows={auditRows} emptyText="当前记录均使用初始完工日期，无兜底或缺失记录" />
    </ReportPanel>
  </section>;
}

export function ProfitTargetTables() {
  const marginColumns = ["负责人", "线数", "运营有效计算金额", "结算有效计算金额", "业务毛利（未完成）", "业务毛利（完成）", "排名"];
  return <section className="module-grid report-module-grid">
    <ReportPanel label="FIRST-YEAR MARGIN" title="2026 年新增量首年毛利分析" status="pending" description="完成口径、春开及季度 5% 规则尚未形成可审计配置。">
      <UnavailableTable columns={marginColumns} missing={["运营有效计算金额", "结算有效计算金额", "首年毛利规则", "完成状态规则"]} />
    </ReportPanel>
    <ReportPanel label="SECOND-YEAR MARGIN" title="2025 年新增量第二年毛利分析" status="pending" description="奖励与达量标准未定，不计入正式结果。">
      <UnavailableTable columns={marginColumns} missing={["次年有效计算金额", "奖励标准", "达量标准", "毛利确认口径"]} />
    </ReportPanel>
    <ReportPanel wide label="POLICY DISTRIBUTION" title="首年 / 次年服务扣率政策分布" status="pending" description="保留业务名称、授权价判断及扣率分布结构，不推断服务商政策。">
      <UnavailableTable columns={["年度", "是否低于授权价", "业务名称", "服务扣率", "线数", "总计"]} missing={["首年服务扣率", "次年服务扣率", "政策生效日期", "确认人"]} />
    </ReportPanel>
    <ReportPanel wide label="TARGET PROGRESS" title="业务目标与季度进度" status="pending" description="支持上年、当年、明年预测及年目标对比，目标数据补齐后启用。">
      <UnavailableTable columns={["年度", "季度", "业务", "负责人", "目标", "完成额", "完成率"]} missing={["年度目标", "季度目标", "目标分解规则", "明年预测"]} />
    </ReportPanel>
  </section>;
}

export function SettlementReportTables({ rows }: { rows: BusinessRow[] }) {
  const settlementRows = rows.map((row, index) => ({
    key: `${row.deviceCode || row.serviceCode}-${index}`,
    businessCategory: row.businessCategory || "--",
    businessName: row.businessName || "--",
    deviceCode: row.deviceCode || "--",
    owner: row.owner || "--",
    serviceCode: row.serviceCode || "--",
    serviceName: row.serviceName || "--",
    completedDate: row.completedDate || "--",
    activeStatus: row.activeStatus || "--",
    calculationStatus: row.calculationStatus || "--",
    calculationMethod: row.calculationMethod || "--",
    paymentCycle: row.paymentCycle || "--",
    meteringRule: row.meteringRule || "--",
    monthlyTariff: money(row.discountedTariff),
    monthlyMetering: money(row.monthlyMetering),
    grossProfit: money(row.grossProfit),
  }));
  const candidateGroups = new Map<string, BusinessRow[]>();
  for (const row of rows) {
    if (!row.serviceCode) continue;
    candidateGroups.set(row.serviceCode, [...(candidateGroups.get(row.serviceCode) ?? []), row]);
  }
  const candidates = [...candidateGroups.entries()].map(([serviceCode, group]) => {
    const active = group.filter(isActive);
    const calculable = group.filter((row) => /计算中|恢复计算/.test(row.calculationStatus));
    const review = group.filter(isSettlementReviewCandidate);
    return {
      key: serviceCode,
      serviceCode,
      serviceName: group.find((row) => row.serviceName)?.serviceName || "--",
      records: number(group.length),
      activeRecords: number(active.length),
      calculableRecords: number(calculable.length),
      reviewRecords: number(review.length),
      monthlyMeteringValue: knownSum(group.map((row) => row.monthlyMetering)),
      monthlyMetering: money(knownSum(group.map((row) => row.monthlyMetering))),
      grossProfit: money(knownSum(group.map((row) => row.grossProfit))),
    };
  }).sort((left, right) => (right.monthlyMeteringValue ?? Number.NEGATIVE_INFINITY) - (left.monthlyMeteringValue ?? Number.NEGATIVE_INFINITY));
  const candidateSummary = {
    key: "summary", serviceCode: "总计 / 总览", serviceName: "--", records: number(rows.length), activeRecords: number(rows.filter(isActive).length),
    calculableRecords: number(rows.filter((row) => /计算中|恢复计算/.test(row.calculationStatus)).length), reviewRecords: number(rows.filter(isSettlementReviewCandidate).length),
    monthlyMetering: money(knownSum(rows.map((row) => row.monthlyMetering))), grossProfit: money(knownSum(rows.map((row) => row.grossProfit))),
  };
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="CRM SETTLEMENT PREPARATION" title="CRM 结算准备明细" status="partial" description="参照财务“服务结算”和“双线应收”示例，展示 CRM 已有且可复核的业务、服务、状态和计量字段；不模拟运营应收、扣率、税额或实收。">
      <ReportTable columns={[{ key: "businessCategory", label: "业务类别" }, { key: "businessName", label: "业务名称" }, { key: "deviceCode", label: "设备编号" }, { key: "owner", label: "负责人" }, { key: "serviceCode", label: "I服务编号" }, { key: "serviceName", label: "I服务简称" }, { key: "completedDate", label: "统计完工日期" }, { key: "activeStatus", label: "活跃状态" }, { key: "calculationStatus", label: "计算状态" }, { key: "calculationMethod", label: "计算方式" }, { key: "paymentCycle", label: "付款周期" }, { key: "meteringRule", label: "计量规则" }, { key: "monthlyTariff", label: "月平均资费", numeric: true }, { key: "monthlyMetering", label: "月平均计量", numeric: true }, { key: "grossProfit", label: "业务毛利（CRM）", numeric: true }]} rows={settlementRows} emptyText="当前筛选没有可展示的 CRM 业务记录" />
    </ReportPanel>
    <ReportPanel wide label="SERVICE SETTLEMENT CANDIDATES" title="服务商结算候选汇总" status="partial" description="按 I 服务编号汇总当前记录、活跃记录、计算状态、结算待复核和 CRM 计量；用于复核分流，不代表正式结算金额或付款指令。">
      <ReportTable columns={[{ key: "serviceCode", label: "I服务编号" }, { key: "serviceName", label: "I服务简称" }, { key: "records", label: "业务记录", numeric: true }, { key: "activeRecords", label: "活跃记录", numeric: true }, { key: "calculableRecords", label: "计算中/恢复计算", numeric: true }, { key: "reviewRecords", label: "结算待复核", numeric: true }, { key: "monthlyMetering", label: "月平均计量", numeric: true }, { key: "grossProfit", label: "业务毛利（CRM）", numeric: true }]} rows={candidates} summary={candidateSummary} emptyText="当前筛选记录没有 I 服务编号" />
    </ReportPanel>
    <ReportPanel wide label="SETTLEMENT BY BUSINESS" title="结算按业务汇总" status="pending" description="运营商业务、其他补充、扣款、审核差异、开票与付款批次。">
      <UnavailableTable columns={["编号", "服务名称", "政企固网", "政企双线", "政企宽带", "T-1 共享表金额", "其他运营合作", "联通", "移动", "信网 BGP", "号百", "其他补充", "其他扣款", "合计", "支付金额", "审核差异", "开票金额", "开票支付差异", "备注", "付款批次"]} missing={["实际账单", "审核结果", "支付记录", "开票记录"]} />
    </ReportPanel>
    <ReportPanel wide label="MONTHLY SERVICE FEE" title="结算按月年服务费汇总" status="pending" description="仅建立非敏感业务与支付跟踪字段；个人身份、联系方式及账户明细不进入分析快照。">
      <UnavailableTable columns={["销售编号", "服务简称", "支付方式", "审核日期", "开票金额", "收票标识", "发票日期", "实付金额", "支付日期", "平台手续费", "发票类型", "税点", "应税名称", "预付/待付", "备注", "政企固网", "政企双线", "政企宽带", "T-1 共享表金额"]} missing={["月度结算清单", "发票状态", "支付状态", "税务校验结果"]} />
    </ReportPanel>
    <ReportPanel label="MONTHLY SUMMARY" title="月度汇报：汇总统计" status="pending" description="面向 T+1 与 T-1 周期，按服务商、平台、销售提成汇总。">
      <UnavailableTable columns={["属性/结算方式", "服务商数量", "服务商金额", "服务商占比", "平台数量", "平台金额", "平台占比", "销售提成数量", "销售提成金额", "销售提成占比", "总计数量", "总计金额"]} missing={["结算属性", "结算方式", "结算期间", "确认金额"]} />
    </ReportPanel>
    <ReportPanel label="PAYMENT / INVOICE" title="预计支付及发票跟踪" status="pending" description="发票、支付和前期结转数据补齐后启用。">
      <UnavailableTable columns={["结算方式", "预计支付时间", "预计支付金额", "平台", "销售提成已支付", "销售提成未支付", "服务商收到发票", "服务商待收发票", "前期待收发票", "待收发票总计"]} missing={["预计支付计划", "实际支付记录", "收票记录", "前期结转"]} />
    </ReportPanel>
    <article className="panel wide-panel settlement-rules"><span className="section-label">SETTLEMENT RULES</span><h2>当前结算规则说明</h2><ul className="plain-list"><li>服务商：25 日前收到发票；未按期提供则顺延至下月划款。</li><li>销售提成：现金方式，沟通一致后统一提现、分发和支付。</li><li>特殊结算：业务部门需提前一天上午 9:30 前通知财务部。</li></ul></article>
  </section>;
}

export function ReportCatalog() {
  const labels = { ready: "可计算", pending: "待确认", planned: "待补数据" } as const;
  return <article className="panel wide-panel reports-panel"><div className="panel-header"><div><span className="section-label">REPORT REGISTRY</span><h2>报表目录与数据状态</h2><p>状态表示当前输入是否足以生成可复核结果。</p></div></div><div className="report-grid">{REPORTS.map((report) => <div className="report-card" key={report.id}><span className={`report-icon tone-${report.tone}`}>{report.short}</span><span className="report-copy"><strong>{report.name}</strong><small>{report.description}</small></span><span className={`status-chip ${report.status}`}>{labels[report.status]}</span></div>)}</div></article>;
}
