"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AnalyticsPlaceholder } from "./components/AnalyticsPlaceholder";
import { ImportDialog } from "./components/ImportDialog";
import { MonthlyChart, RankingChart, RuleChart } from "./components/AnalyticsCharts";
import { buildSnapshot, EMPTY_SNAPSHOT, normalizeSnapshot, summarizeRows, type BusinessRow, type NumericValue, type Snapshot } from "./lib/data-model";

const NAV_ITEMS = [
  ["总览", "总盘与关键指标"], ["统一查询", "明细筛选与导出"], ["业务分析", "趋势与计量结构"], ["销售分析", "负责人业绩与排名"],
  ["服务商分析", "供应商结构与明细"], ["毛利与目标", "目标、成本与毛利"], ["结算中心", "候选、复核与支付"], ["数据中心", "导入、质量与来源"],
] as const;
type ViewName = (typeof NAV_ITEMS)[number][0];

const EMPTY_FILTERS = { year: "全部年份", month: "全部月份", status: "全部状态", rule: "全部计量规则", keyword: "" };
const safeText = (value: string | null | undefined) => value?.trim() || "--";
const numberText = (value: NumericValue, digits = 0) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const moneyWan = (value: NumericValue) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 10000);

function exportRows(rows: BusinessRow[]) {
  const headers = ["业务类型", "业务名称", "负责人", "供应商", "服务编号", "服务简称", "完工日期", "活跃状态", "计量规则", "线数", "月平均计量"];
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) => [row.businessType, row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName, row.completedDate, row.activeStatus, row.meteringRule, row.lines, row.monthlyMetering].map(quote).join(","));
  const blob = new Blob(["\uFEFF", [headers.map(quote).join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `CRM筛选结果_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Panel({ label, title, aside, children, className = "" }: { label: string; title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <article className={`panel ${className}`}><div className="panel-header"><div><span className="section-label">{label}</span><h2>{title}</h2></div>{aside}</div>{children}</article>;
}

function Metrics({ rows }: { rows: BusinessRow[] }) {
  const summary = summarizeRows(rows);
  const metrics = [
    ["业务总记录", numberText(summary.total), "条", "当前筛选结果", "navy"],
    ["实际活跃", numberText(summary.active), "条", summary.total === null ? "--" : `${((Number(summary.active) / Math.max(Number(summary.total), 1)) * 100).toFixed(1)}% 活跃率`, "green"],
    ["月平均计量", moneyWan(summary.monthlyMetering), "万元", "仅汇总有效金额", "amber"],
    ["新装", numberText(summary.installs), "条", "当前筛选范围", "blue"],
    ["拆机", numberText(summary.removals), "条", "当前筛选范围", "rose"],
    ["待人工复核", numberText(summary.review), "条", "缺规则、缺金额或特殊场景", "violet"],
  ];
  return <section className="metric-grid">{metrics.map(([label, value, unit, note, tone]) => <article className={`metric-card metric-${tone}`} key={label}><div className="metric-top"><span>{label}</span><i /></div><div className="metric-value"><strong>{value}</strong><span>{value === "--" ? "" : unit}</span></div><small>{note}</small></article>)}</section>;
}

function DataTable({ rows, pageSize = 20 }: { rows: BusinessRow[]; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => setPage(1), [rows]);
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return <>
    <div className="table-scroll"><table><thead><tr><th>业务类型</th><th>业务名称</th><th>负责人</th><th>供应商</th><th>服务编号</th><th>服务简称</th><th>完工日期</th><th>活跃状态</th><th>计量规则</th><th className="number">线数</th><th className="number">月平均计量</th></tr></thead>
      <tbody>{visible.length ? visible.map((row, index) => <tr key={`${row.serviceCode}-${index}`}><td><span className={`business-chip ${/拆机/.test(row.businessType) ? "removal" : ""}`}>{safeText(row.businessType)}</span></td><td>{safeText(row.businessName)}</td><td>{safeText(row.owner)}</td><td>{safeText(row.provider)}</td><td className="code">{safeText(row.serviceCode)}</td><td>{safeText(row.serviceName)}</td><td>{safeText(row.completedDate)}</td><td><span className={`active-chip ${/不活跃|停止|暂停/.test(row.activeStatus) ? "inactive" : ""}`}>{safeText(row.activeStatus)}</span></td><td>{safeText(row.meteringRule)}</td><td className="number">{numberText(row.lines)}</td><td className="number">{row.monthlyMetering === null ? "--" : `¥ ${numberText(row.monthlyMetering, 2)}`}</td></tr>) : <tr><td className="empty-cell" colSpan={11}>--　暂无匹配数据</td></tr>}</tbody></table></div>
    <div className="table-foot"><span>共 {rows.length} 条 · 第 {page} / {pages} 页</span><div className="pager"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>下一页</button></div></div>
  </>;
}

function MissingModule({ title, fields }: { title: string; fields: string[] }) {
  return <section className="module-grid"><Panel label="DATA AVAILABILITY" title={title}><div className="missing-module"><strong>--</strong><p>当前数据不足，系统不会生成模拟数。</p><div className="missing-fields">{fields.map((field) => <span key={field}>{field}</span>)}</div></div></Panel><Panel label="NEXT INPUT" title="补齐后可启用"><ul className="plain-list"><li>按规则版本计算并保留输入、输出与人工调整记录</li><li>对差异和异常只做标记，不自动确认正式金额</li><li>敏感或已清空字段不会被推断和补齐</li></ul></Panel></section>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeNav, setActiveNav] = useState<ViewName>("总览");
  const [showImport, setShowImport] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());

  useEffect(() => {
    const fromHash = decodeURIComponent(window.location.hash.slice(1)) as ViewName;
    if (NAV_ITEMS.some(([name]) => name === fromHash)) setActiveNav(fromHash);
    const listener = () => { const next = decodeURIComponent(window.location.hash.slice(1)) as ViewName; if (NAV_ITEMS.some(([name]) => name === next)) setActiveNav(next); };
    window.addEventListener("hashchange", listener);
    fetch("/data/local-snapshot.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setSnapshot(normalizeSnapshot(data))).catch(() => setSnapshot(EMPTY_SNAPSHOT));
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  const filteredRows = useMemo(() => (snapshot?.rows ?? []).filter((row) => {
    const [year, month] = row.completedDate.split("-");
    return (filters.year === "全部年份" || filters.year === year) && (filters.month === "全部月份" || filters.month === month) &&
      (filters.status === "全部状态" || row.activeStatus === filters.status) && (filters.rule === "全部计量规则" || row.meteringRule === filters.rule) &&
      (!deferredKeyword || [row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName].join(" ").toLowerCase().includes(deferredKeyword));
  }), [snapshot, filters.year, filters.month, filters.status, filters.rule, deferredKeyword]);
  const analysis = useMemo(() => buildSnapshot(filteredRows, snapshot?.source ?? EMPTY_SNAPSHOT.source, snapshot?.mode ?? "empty"), [filteredRows, snapshot?.source, snapshot?.mode]);

  if (!snapshot) return <main className="loading-screen"><div className="loading-mark">CRM</div><p>正在建立业务分析视图…</p></main>;
  const years = [...new Set(snapshot.rows.map((row) => row.completedDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().reverse();
  const statuses = [...new Set(snapshot.rows.map((row) => row.activeStatus).filter(Boolean))].sort();
  const rules = [...new Set(snapshot.rows.map((row) => row.meteringRule).filter(Boolean))].sort();
  const updated = snapshot.mode === "empty" ? "--" : new Date(snapshot.generatedAt).toLocaleString("zh-CN", { hour12: false });

  function navigate(name: ViewName) { setActiveNav(name); window.history.replaceState(null, "", `#${encodeURIComponent(name)}`); }
  function selectRule(name: string) { setFilters((value) => ({ ...value, rule: name })); navigate("统一查询"); }
  function selectRank(name: string, field: "owner" | "provider") { setFilters((value) => ({ ...value, keyword: name })); navigate(field === "owner" ? "销售分析" : "服务商分析"); }

  const filterBar = <section className="filter-bar"><label className="search-box"><span>⌕</span><input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="搜索负责人、供应商、服务编号…" /></label>
    <select value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}><option>全部年份</option>{years.map((value) => <option key={value}>{value}</option>)}</select>
    <select value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })}><option>全部月份</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((value) => <option key={value}>{value}</option>)}</select>
    <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>全部状态</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
    <select value={filters.rule} onChange={(event) => setFilters({ ...filters, rule: event.target.value })}><option>全部计量规则</option>{rules.map((value) => <option key={value}>{value}</option>)}</select>
    <button className="clear-button" onClick={() => setFilters(EMPTY_FILTERS)}>重置筛选</button></section>;

  let content: React.ReactNode;
  if (activeNav === "总览") content = <><Metrics rows={filteredRows} /><section className="dashboard-grid"><Panel label="MONTHLY TREND" title="月平均计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="METERING RULE" title="计量规则分布" aside={<span className="tag">点击可下钻</span>}><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel><Panel label="SALES PERFORMANCE" title="负责人业绩"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="PROVIDER RANKING" title="服务商进单"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel></section></>;
  else if (activeNav === "统一查询") content = <Panel label="DETAIL QUERY" title="业务明细" aside={<button className="primary-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出筛选结果</button>}><p className="panel-note">筛选、分页和导出均基于当前真实数据；空字段统一显示为 --。</p><DataTable rows={filteredRows} /></Panel>;
  else if (activeNav === "业务分析") content = <><Metrics rows={filteredRows} /><section className="dashboard-grid"><Panel label="BUSINESS TREND" title="月度计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="RULE STRUCTURE" title="计量规则结构"><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel></section></>;
  else if (activeNav === "销售分析") content = <section className="module-grid"><Panel label="OWNER RANKING" title="负责人业绩排名"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="OWNER DETAILS" title="负责人业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section>;
  else if (activeNav === "服务商分析") content = <section className="module-grid"><Panel label="PROVIDER RANKING" title="服务商进单排名"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel><Panel label="PROVIDER DETAILS" title="服务商业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section>;
  else if (activeNav === "毛利与目标") content = <MissingModule title="毛利与目标数据" fields={["年度/月度目标", "采购成本", "服务费政策", "毛利确认口径"]} />;
  else if (activeNav === "结算中心") content = <><Metrics rows={filteredRows} /><MissingModule title="正式结算闭环" fields={["实际账单", "应收/应付", "收款/付款", "销账与发票状态"]} /></>;
  else content = <section className="module-grid"><Panel label="SOURCE" title="当前数据来源"><div className="source-card"><strong>{snapshot.source.label}</strong><span>{snapshot.source.currentFile}</span><small>{snapshot.source.files.length ? snapshot.source.files.join("、") : "--"}</small><button className="primary-button" onClick={() => setShowImport(true)}>重新导入</button></div></Panel><Panel label="QUALITY" title="数据可用性"><div className="quality-list"><span><strong>{numberText(snapshot.summary.total)}</strong> 业务记录</span><span><strong>{snapshot.source.sheets?.length ?? (snapshot.mode === "empty" ? "--" : 1)}</strong> 已识别工作表</span><span><strong>{numberText(snapshot.summary.review)}</strong> 待人工复核</span><span><strong>0</strong> mock 数据</span></div></Panel>{snapshot.source.sheets?.length ? <Panel label="SHEETS" title="工作表识别结果" className="wide-panel"><div className="sheet-summary">{snapshot.source.sheets.map((sheet) => <span key={`${sheet.fileName}-${sheet.sheetName}`} className={`sheet-chip ${sheet.kind}`}>{sheet.fileName} / {sheet.sheetName} · {sheet.rowCount} 行</span>)}</div></Panel> : null}</section>;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">衡</div><div><strong>衡析</strong><span>CRM 业务分析平台</span></div></div><nav>{NAV_ITEMS.map(([name, description], index) => <button key={name} className={activeNav === name ? "active" : ""} onClick={() => navigate(name)}><span className="nav-icon">{String(index + 1).padStart(2, "0")}</span><span><strong>{name}</strong><small>{description}</small></span></button>)}</nav><div className="sidebar-foot"><i className={snapshot.mode === "empty" ? "empty" : ""} /><div><strong>{snapshot.mode === "empty" ? "等待导入数据" : "数据已连接"}</strong><small>{snapshot.source.currentFile}</small></div></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">BUSINESS INTELLIGENCE · 2026</p><h1>{activeNav}</h1></div><div className="top-actions"><span className="sync-state">数据更新：{updated}</span><button className="ghost-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出当前数据</button><button className="primary-button" onClick={() => setShowImport(true)}>＋ 导入数据</button></div></header>{filterBar}{snapshot.mode === "empty" && <AnalyticsPlaceholder onImport={() => setShowImport(true)} />}{snapshot.mode !== "empty" && content}<footer><span>缺失数据统一显示 -- · 不推断脱敏或已清空字段 · 结算结果仅供内部工作分流</span><span>BH 逻辑只读取结果，不回写原始公式</span></footer></main>
    <ImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={(data) => { setSnapshot(data); setFilters(EMPTY_FILTERS); }} />
  </div>;
}
