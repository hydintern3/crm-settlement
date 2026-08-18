"use client";

import { useState, type ReactNode } from "react";
import {
  buildBusinessProgress,
  buildCompletionCohorts,
  buildDataQualityMetrics,
  buildMonthlyBusiness,
  buildNetGrowth,
  buildPerformance,
  isRemoval,
  type BusinessRow,
  type CalculationRuleConfig,
  type NumericValue,
} from "../lib/data-model";
import { REPORTS } from "../lib/report-registry";

type CellValue = ReactNode;
type TableRow = Record<string, CellValue>;
type Column = { key: string; label: string; numeric?: boolean };

const number = (value: NumericValue, digits = 0) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const money = (value: NumericValue) => value === null ? "--" : `¥ ${number(value, 2)}`;
const percent = (value: NumericValue) => value === null ? "--" : `${number(value, 1)}%`;

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
  const [dimension, setDimension] = useState<"company" | "owner" | "service" | "service2">("company");
  const dimensions = [["company", "公司总体"], ["owner", "各销售"], ["service", "I服务商"], ["service2", "II服务商"]] as const;
  const progressRows = buildBusinessProgress(rows, dimension, rules.removalRateDenominator).map((item) => ({
    key: item.key, label: item.label, total: number(item.totalLines), installs: number(item.installs), installAmount: money(item.installMonthlyMetering),
    removals: number(item.removals), removalAmount: money(item.removalMonthlyMetering), removalRate: percent(item.removalRate),
    netGrowth: number(item.netGrowth), netAmount: money(item.netMonthlyMetering), netTariff: money(item.netAverageTariff), amount: money(item.monthlyMetering),
    newMargin: money(item.newGrossProfit), stockMargin: money(item.stockGrossProfit),
  }));
  const denominatorText = rules.removalRateDenominator === "total" ? "拆机线数 / 总线数" : "拆机线数 / 新增线数";
  return <section className="module-grid report-module-grid"><ReportPanel wide label="BUSINESS PROGRESS" title="业务进展多维分析" status="partial" description={`同一套指标支持公司、销售、I服务商和II服务商切换；当前拆机率口径：${denominatorText}。净增长月平均计量＝新增月平均计量－拆机月平均计量；净增月平均资费＝净增长月平均计量÷净增长线路数，净增长线路数为0时显示--。`}>
    <div className="dimension-tabs" role="tablist" aria-label="业务进展分析维度">{dimensions.map(([key, label]) => <button key={key} className={dimension === key ? "active" : ""} onClick={() => setDimension(key)}>{label}</button>)}</div>
    <ReportTable columns={[{ key: "label", label: "分析对象" }, { key: "total", label: "总线路数", numeric: true }, { key: "amount", label: "总月平均计量", numeric: true }, { key: "installs", label: "新增线路数", numeric: true }, { key: "installAmount", label: "新增月平均计量", numeric: true }, { key: "removals", label: "拆机线路数", numeric: true }, { key: "removalAmount", label: "拆机月平均计量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }, { key: "netGrowth", label: "净增长线路数", numeric: true }, { key: "netAmount", label: "净增长月平均计量", numeric: true }, { key: "netTariff", label: "净增月平均资费", numeric: true }, { key: "newMargin", label: "新增毛利", numeric: true }, { key: "stockMargin", label: "存量毛利", numeric: true }]} rows={progressRows} emptyText={dimension === "service2" ? "当前筛选记录没有II服务编号" : "暂无匹配数据"} />
    {progressRows.every((row) => row.newMargin === "--" && row.stockMargin === "--") && <div className="availability-note"><strong>毛利暂未启用</strong><span>需补充运营有效金额、结算有效金额及新增/存量毛利规则。</span></div>}
  </ReportPanel></section>;
}

function ReportTable({ columns, rows, emptyText = "暂无匹配数据" }: { columns: Column[]; rows: TableRow[]; emptyText?: string }) {
  return <div className="table-scroll report-table"><table><thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "number" : ""}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row, index) => <tr key={String(row.key ?? index)}>{columns.map((column) => <td key={column.key} className={column.numeric ? "number" : ""}>{row[column.key] ?? "--"}</td>)}</tr>) : <tr><td className="empty-cell" colSpan={columns.length}>--　{emptyText}</td></tr>}</tbody></table></div>;
}

function UnavailableTable({ columns, missing, note }: { columns: string[]; missing: string[]; note?: string }) {
  return <><div className="availability-note"><strong>不生成模拟金额</strong><span>{note ?? "补齐并确认下列输入后，才会启用正式计算。"}</span></div>
    <ReportTable columns={columns.map((label, index) => ({ key: `c${index}`, label, numeric: /金额|业务额|毛利|占比|线数|数量|差异|目标/.test(label) }))} rows={[]} emptyText="字段结构已建立，当前没有可复核的数据" />
    <div className="missing-fields report-missing">{missing.map((field) => <span key={field}>{field}</span>)}</div></>;
}

export function BusinessReportTables({ rows }: { rows: BusinessRow[] }) {
  const monthly = buildMonthlyBusiness(rows).map((item) => ({
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
  const cohorts = buildCompletionCohorts(rows).map((item) => ({
    key: item.month,
    month: item.month,
    lines: number(item.lines),
    activeLines: number(item.activeLines),
    removalLines: number(item.removalLines),
    activeRate: percent(item.activeRate),
    amount: money(item.monthlyMetering),
    activeAmount: money(item.activeMonthlyMetering),
  }));
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="ANNUAL INSTALL / REMOVAL" title="全年业务拆装情况" status="partial" description="完工年月来自当前筛选记录；目标与历史时点活跃口径尚未提供，保持 --。">
      <ReportTable columns={[
        { key: "month", label: "月份" }, { key: "installs", label: "新装线数", numeric: true }, { key: "installAmount", label: "新装月平均计量", numeric: true },
        { key: "removals", label: "当年拆机线数", numeric: true }, { key: "removalAmount", label: "拆机月平均计量", numeric: true }, { key: "activeLines", label: "当前活跃线数", numeric: true },
        { key: "activeAmount", label: "当前活跃月平均计量", numeric: true }, { key: "quarterTarget", label: "季度目标", numeric: true }, { key: "quarterCompletion", label: "季度完成比", numeric: true },
        { key: "annualTarget", label: "全年目标", numeric: true }, { key: "annualCompletion", label: "全年完成比", numeric: true }, { key: "ratio", label: "月度拆装比", numeric: true },
        { key: "quarterRatioTarget", label: "季度拆装比目标", numeric: true }, { key: "quarterRatio", label: "季度拆装比", numeric: true }, { key: "annualRatio", label: "全年拆装比", numeric: true },
      ]} rows={monthly} />
    </ReportPanel>
    <ReportPanel wide label="COMPLETION COHORT" title="完工批次留存分析" description="按有效完工月份形成批次；有效完工日期优先取初始完工日期，缺失时使用完工日期兜底。">
      <ReportTable columns={[
        { key: "month", label: "有效完工月份" }, { key: "lines", label: "完工线数", numeric: true }, { key: "activeLines", label: "当前活跃线数", numeric: true },
        { key: "removalLines", label: "拆机线数", numeric: true }, { key: "activeRate", label: "当前活跃率", numeric: true },
        { key: "amount", label: "月平均计量", numeric: true }, { key: "activeAmount", label: "活跃月平均计量", numeric: true },
      ]} rows={cohorts} />
    </ReportPanel>
  </section>;
}

export function SalesReportTables({ rows }: { rows: BusinessRow[] }) {
  const performance = buildPerformance(rows, "owner", { amount: "discountedTariff" }).map((item) => ({
    key: item.key, owner: item.label, lines: number(item.lines), amount: money(item.amount), average: money(item.average), share: percent(item.share), rank: item.rank,
  }));
  const netGrowth = buildNetGrowth(rows).map((item) => ({
    key: item.owner, owner: item.owner, installs: number(item.installs), installAmount: money(item.installAmount), removals: number(item.removals), removalAmount: money(item.removalAmount), netLines: number(item.netLines), netAmount: money(item.netAmount), ratio: percent(item.installRemovalRatio),
  }));
  const marketing = buildPerformance(rows, "owner", { amount: "marketingFee" }).map((item) => ({ key: item.key, owner: item.label, lines: number(item.lines), amount: money(item.amount) }));
  return <section className="module-grid report-module-grid">
    <ReportPanel label="SALES COMPLETION" title="销售完成情况（优惠资费口径）" status="partial" description="业务额取源表优惠资费有效值；空值不按月平均计量替代。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "业务额", numeric: true }, { key: "average", label: "业务均值", numeric: true }, { key: "share", label: "贡献率", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={performance} />
    </ReportPanel>
    <ReportPanel label="MARKETING COST" title="营销增值费用分析" status="partial" description="金额取增值或营销字段；无有效金额时显示 --。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "金额", numeric: true }]} rows={marketing} />
    </ReportPanel>
    <ReportPanel wide label="NET GROWTH" title="销售业务净增情况" description="新装、拆机、变更优先按源业务属性识别；属性为空或无法识别时，当前计量规则为新增量可兜底判为新装。拆装比为拆机线数 / 新装线数。">
      <ReportTable columns={[{ key: "owner", label: "负责人" }, { key: "installs", label: "新增数", numeric: true }, { key: "installAmount", label: "新增业务量", numeric: true }, { key: "removals", label: "拆机数", numeric: true }, { key: "removalAmount", label: "拆机业务量", numeric: true }, { key: "netLines", label: "净增数", numeric: true }, { key: "netAmount", label: "净增业务量", numeric: true }, { key: "ratio", label: "拆装比", numeric: true }]} rows={netGrowth} />
    </ReportPanel>
  </section>;
}

export function ProviderReportTables({ rows }: { rows: BusinessRow[] }) {
  const toRows = (removalsOnly: boolean) => buildPerformance(rows, "service", { removalsOnly }).slice(0, 10).map((item) => ({
    key: item.key, code: item.label, name: item.secondary || "--", lines: number(item.lines), amount: money(item.amount), share: percent(item.share), rank: item.rank,
  }));
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
  return <section className="module-grid report-module-grid">
    <ReportPanel wide label="PROVIDER OVERVIEW" title="服务商综合分布" description="按 I 服务编号汇总进单、当前活跃、拆机、计量与拆机率，便于在同一张表比较规模和留存。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "总线数", numeric: true }, { key: "activeLines", label: "活跃线数", numeric: true }, { key: "removalLines", label: "拆机线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }]} rows={providerOverview} />
    </ReportPanel>
    <ReportPanel label="TOP 10 PROVIDERS" title="服务商进单排名" description="按 I 服务编号汇总当前筛选记录，排名依据月平均计量。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={toRows(false)} />
    </ReportPanel>
    <ReportPanel label="TOP 10 REMOVALS" title="服务商拆机排名" description="仅统计统一业务判定为拆机的记录；明确的拆机、退订或注销不会被新增量兜底覆盖。">
      <ReportTable columns={[{ key: "code", label: "I 服务编号" }, { key: "name", label: "I 服务简称" }, { key: "lines", label: "拆机线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={toRows(true)} />
    </ReportPanel>
    <ReportPanel wide label="II SERVICE PROVIDERS" title="II服务商进单排名" status="partial" description="按II服务编号汇总；II服务编号为空的记录不纳入排名，也不会用供应商名称代替。">
      <ReportTable columns={[{ key: "code", label: "II 服务编号" }, { key: "name", label: "II 服务简称" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "月平均计量", numeric: true }, { key: "share", label: "占比", numeric: true }, { key: "rank", label: "排名", numeric: true }]} rows={buildPerformance(rows, "service2").slice(0, 10).map((item) => ({ key: item.key, code: item.label, name: item.secondary || "--", lines: number(item.lines), amount: money(item.amount), share: percent(item.share), rank: item.rank }))} emptyText="当前筛选记录没有II服务编号" />
    </ReportPanel>
    <ReportPanel wide label="PROVIDER CATEGORY" title="年拆机服务商分类占比" status="partial" description="服务分类当前可能因脱敏而全部为空；系统不会自动补齐。">
      <ReportTable columns={[{ key: "category", label: "I 服务分类" }, { key: "lines", label: "线数", numeric: true }, { key: "amount", label: "业务量", numeric: true }, { key: "removalRate", label: "拆机率", numeric: true }, { key: "note", label: "备注" }]} rows={categoryRows} emptyText="服务分类为空或当前筛选无记录" />
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
    <ReportPanel wide label="DATE FALLBACK AUDIT" title="完工日期兜底审计" description="仅展示未使用初始完工日期的记录，便于核对有效日期来源。">
      <ReportTable columns={[{ key: "serviceCode", label: "I 服务编号" }, { key: "owner", label: "负责人" }, { key: "initialDate", label: "初始完工日期" }, { key: "rawDate", label: "完工日期" }, { key: "effectiveDate", label: "有效完工日期" }, { key: "source", label: "日期来源" }]} rows={auditRows} emptyText="当前记录均使用初始完工日期，无兜底或缺失记录" />
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

export function SettlementReportTables() {
  return <section className="module-grid report-module-grid">
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
