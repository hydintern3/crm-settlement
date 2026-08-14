"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsPlaceholder } from "./components/AnalyticsPlaceholder";
import { ImportDialog } from "./components/ImportDialog";
import { MonthlyChart, RankingChart, RuleChart } from "./components/AnalyticsCharts";
import { BusinessProgressTables, BusinessReportTables, DataQualityReportTables, ProfitTargetTables, ProviderReportTables, ReportCatalog, SalesReportTables, SettlementReportTables } from "./components/ReportTables";
import { applyDynamicCalculationRules, buildSnapshot, DEFAULT_CALCULATION_RULES, EMPTY_SNAPSHOT, normalizeSnapshot, summarizeRows, type BusinessRow, type CalculationRuleConfig, type NumericValue, type Snapshot } from "./lib/data-model";

const NAV_ITEMS = [
  ["总览", "总盘与关键指标"], ["统一查询", "明细筛选与导出"], ["业务分析", "趋势与计量结构"], ["销售分析", "负责人业绩与排名"],
  ["服务商分析", "I/II 服务商结构与明细"], ["毛利与目标", "目标、成本与毛利"], ["结算中心", "候选、复核与支付"], ["数据中心", "导入、质量与来源"],
] as const;
type ViewName = (typeof NAV_ITEMS)[number][0];

const EMPTY_FILTERS = { years: [] as string[], months: [] as string[], owners: [] as string[], types: [] as string[], statuses: [] as string[], rules: [] as string[], keyword: "" };
const safeText = (value: string | null | undefined) => value?.trim() || "--";
const numberText = (value: NumericValue, digits = 0) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const moneyWan = (value: NumericValue) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 10000);

function exportRows(rows: BusinessRow[]) {
  const headers = ["业务类型", "业务名称", "负责人", "供应商", "I服务编号", "I服务简称", "II服务编号", "II服务简称", "初始完工日期", "完工日期", "有效完工日期", "日期来源", "活跃状态", "源计量规则", "当前计量规则", "计算来源", "线数", "月平均计量"];
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) => [row.businessType, row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName, row.serviceCodeII, row.serviceNameII, row.initialCompletedDate, row.rawCompletedDate, row.completedDate, row.completionDateSource, row.activeStatus, row.sourceMeteringRule, row.meteringRule, row.calculationRuleSource, row.lines, row.monthlyMetering].map(quote).join(","));
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

function MultiSelectGrid({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function startLongPress(option: string) {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onChange([option]);
    }, 550);
  }
  function cancelLongPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function toggle(option: string) {
    if (longPressed.current) { longPressed.current = false; return; }
    if (!selected.length) return onChange([option]);
    if (selected.includes(option)) return onChange(selected.length === 1 ? [] : selected.filter((value) => value !== option));
    onChange([...selected, option]);
  }

  return <fieldset className="filter-group"><legend>{label}<small>短按多选 · 长按单选</small></legend><div className="filter-options">
    <button type="button" className={!selected.length ? "active all" : ""} aria-pressed={!selected.length} onClick={() => onChange([])}>全部</button>
    {options.length ? options.map((option) => <button type="button" key={option} className={selected.includes(option) ? "active" : ""} aria-pressed={selected.includes(option)} title={`点击增减选择；长按只选 ${option}`} onPointerDown={() => startLongPress(option)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress} onPointerCancel={cancelLongPress} onContextMenu={(event) => event.preventDefault()} onClick={() => toggle(option)}>{option}</button>) : <span className="filter-empty">--</span>}
  </div></fieldset>;
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
  const safePage = Math.min(page, pages);
  const visible = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return <>
    <div className="table-scroll"><table><thead><tr><th>业务类型</th><th>业务名称</th><th>负责人</th><th>供应商</th><th>I服务编号</th><th>I服务简称</th><th>II服务编号</th><th>II服务简称</th><th>有效完工日期</th><th>日期来源</th><th>活跃状态</th><th>计量规则</th><th>计算来源</th><th className="number">线数</th><th className="number">月平均计量</th></tr></thead>
      <tbody>{visible.length ? visible.map((row, index) => <tr key={`${row.serviceCode}-${index}`}><td><span className={`business-chip ${/拆机/.test(row.businessType) ? "removal" : ""}`}>{safeText(row.businessType)}</span></td><td>{safeText(row.businessName)}</td><td>{safeText(row.owner)}</td><td>{safeText(row.provider)}</td><td className="code">{safeText(row.serviceCode)}</td><td>{safeText(row.serviceName)}</td><td className="code">{safeText(row.serviceCodeII)}</td><td>{safeText(row.serviceNameII)}</td><td>{safeText(row.completedDate)}</td><td><span className={`date-source-chip ${row.completionDateSource === "完工日期兜底" ? "fallback" : row.completionDateSource === "缺失" ? "missing" : ""}`}>{safeText(row.completionDateSource)}</span></td><td><span className={`active-chip ${/不活跃|停止|暂停/.test(row.activeStatus) ? "inactive" : ""}`}>{safeText(row.activeStatus)}</span></td><td>{safeText(row.meteringRule)}</td><td>{safeText(row.calculationRuleSource)}</td><td className="number">{numberText(row.lines)}</td><td className="number">{row.monthlyMetering === null ? "--" : `¥ ${numberText(row.monthlyMetering, 2)}`}</td></tr>) : <tr><td className="empty-cell" colSpan={15}>--　暂无匹配数据</td></tr>}</tbody></table></div>
    <div className="table-foot"><span>共 {rows.length} 条 · 第 {safePage} / {pages} 页</span><div className="pager"><button disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}>上一页</button><button disabled={safePage >= pages} onClick={() => setPage(Math.min(pages, safePage + 1))}>下一页</button></div></div>
  </>;
}

function CalculationRulePanel({ config, rows, onChange }: { config: CalculationRuleConfig; rows: BusinessRow[]; onChange: (next: CalculationRuleConfig) => void }) {
  const differences = rows.filter((row) => row.sourceMeteringRule && row.meteringRule !== row.sourceMeteringRule).length;
  const numberChange = (key: "incrementalYear" | "newVolumeMonths" | "overdueMonths", value: string) => onChange({ ...config, [key]: Number(value) || 0 });
  return <Panel label="DYNAMIC CALCULATION" title="动态计算规则" aside={<span className={`status-chip ${config.enabled ? "ready" : "pending"}`}>{config.enabled ? "已启用" : "读取CRM结果"}</span>}><p className="panel-note">CRM导入值保持不变；平台依据下列参数动态生成当前计量规则，并保留源结果用于对比。设置保存在当前浏览器。</p><div className="calculation-grid">
    <label><span>动态计算</span><select value={config.enabled ? "on" : "off"} onChange={(event) => onChange({ ...config, enabled: event.target.value === "on" })}><option value="on">启用</option><option value="off">停用</option></select></label>
    <label><span>规则版本</span><input value={config.version} onChange={(event) => onChange({ ...config, version: event.target.value })} /></label>
    <label><span>计算基准日期</span><input type="date" value={config.baseDate} onChange={(event) => onChange({ ...config, baseDate: event.target.value })} /></label>
    <label><span>新增量年份</span><input type="number" min="2000" max="2100" value={config.incrementalYear} onChange={(event) => numberChange("incrementalYear", event.target.value)} /></label>
    <label><span>新量阈值（月）</span><input type="number" min="0" value={config.newVolumeMonths} onChange={(event) => numberChange("newVolumeMonths", event.target.value)} /></label>
    <label><span>超期阈值（月）</span><input type="number" min="0" value={config.overdueMonths} onChange={(event) => numberChange("overdueMonths", event.target.value)} /></label>
    <label><span>拆机率分母</span><select value={config.removalRateDenominator} onChange={(event) => onChange({ ...config, removalRateDenominator: event.target.value as "total" | "installs" })}><option value="total">总线数</option><option value="installs">新增线数</option></select></label>
  </div><div className="rule-audit"><span><strong>{rows.length}</strong> 当前记录</span><span><strong>{differences}</strong> 与CRM静态结果不同</span><span><strong>{config.version || "--"}</strong> 当前规则版本</span></div></Panel>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeNav, setActiveNav] = useState<ViewName>("总览");
  const [showImport, setShowImport] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [calculationRules, setCalculationRules] = useState<CalculationRuleConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_CALCULATION_RULES;
    try {
      const storedRules = window.localStorage.getItem("crm-calculation-rules");
      return storedRules ? { ...DEFAULT_CALCULATION_RULES, ...JSON.parse(storedRules) } : DEFAULT_CALCULATION_RULES;
    } catch {
      return DEFAULT_CALCULATION_RULES;
    }
  });
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());

  useEffect(() => {
    const listener = () => { const next = decodeURIComponent(window.location.hash.slice(1)) as ViewName; if (NAV_ITEMS.some(([name]) => name === next)) setActiveNav(next); };
    window.addEventListener("hashchange", listener);
    queueMicrotask(listener);
    fetch("/data/local-snapshot.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setSnapshot(normalizeSnapshot(data as Partial<Snapshot>))).catch(() => setSnapshot(EMPTY_SNAPSHOT));
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("crm-calculation-rules", JSON.stringify(calculationRules)); } catch { /* 仅影响偏好持久化。 */ }
  }, [calculationRules]);

  const calculatedRows = useMemo(() => applyDynamicCalculationRules(snapshot?.rows ?? [], calculationRules), [snapshot, calculationRules]);
  const filteredRows = useMemo(() => calculatedRows.filter((row) => {
    const [year, month] = row.completedDate.split("-");
    return (!filters.years.length || filters.years.includes(year)) && (!filters.months.length || filters.months.includes(month)) &&
      (!filters.owners.length || filters.owners.includes(row.owner)) && (!filters.types.length || filters.types.includes(row.businessType)) &&
      (!filters.statuses.length || filters.statuses.includes(row.activeStatus)) && (!filters.rules.length || filters.rules.includes(row.meteringRule)) &&
      (!deferredKeyword || [row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName, row.serviceCodeII, row.serviceNameII].join(" ").toLowerCase().includes(deferredKeyword));
  }), [calculatedRows, filters.years, filters.months, filters.owners, filters.types, filters.statuses, filters.rules, deferredKeyword]);
  const analysis = useMemo(() => buildSnapshot(filteredRows, snapshot?.source ?? EMPTY_SNAPSHOT.source, snapshot?.mode ?? "empty"), [filteredRows, snapshot?.source, snapshot?.mode]);

  if (!snapshot) return <main className="loading-screen"><div className="loading-mark">CRM</div><p>正在建立业务分析视图…</p></main>;
  const years = [...new Set(calculatedRows.map((row) => row.completedDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().reverse();
  const statuses = [...new Set(calculatedRows.map((row) => row.activeStatus).filter(Boolean))].sort();
  const rules = [...new Set(calculatedRows.map((row) => row.meteringRule).filter(Boolean))].sort();
  const owners = [...new Set(calculatedRows.map((row) => row.owner).filter(Boolean))].sort();
  const businessTypes = [...new Set(calculatedRows.map((row) => row.businessType).filter(Boolean))].sort();
  const updated = snapshot.mode === "empty" ? "--" : new Date(snapshot.generatedAt).toLocaleString("zh-CN", { hour12: false });

  function navigate(name: ViewName) { setActiveNav(name); window.history.replaceState(null, "", `#${encodeURIComponent(name)}`); }
  function selectRule(name: string) { setFilters((value) => ({ ...value, rules: [name] })); navigate("统一查询"); }
  function selectRank(name: string, field: "owner" | "provider") { setFilters((value) => field === "owner" ? ({ ...value, owners: [name] }) : ({ ...value, keyword: name })); navigate(field === "owner" ? "销售分析" : "服务商分析"); }

  const filterBar = <section className="filter-bar"><div className="filter-toolbar"><label className="search-box"><span>⌕</span><input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="搜索负责人、供应商、I/II服务编号…" /></label><span className="filter-tip">点击可多选，长按约半秒切换为单选</span><button className="clear-button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>重置筛选</button></div><div className="filter-grid">
    <MultiSelectGrid label="完工年份" options={years} selected={filters.years} onChange={(years) => setFilters((value) => ({ ...value, years }))} />
    <MultiSelectGrid label="完工月份" options={Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))} selected={filters.months} onChange={(months) => setFilters((value) => ({ ...value, months }))} />
    <MultiSelectGrid label="负责人" options={owners} selected={filters.owners} onChange={(owners) => setFilters((value) => ({ ...value, owners }))} />
    <MultiSelectGrid label="业务属性" options={businessTypes} selected={filters.types} onChange={(types) => setFilters((value) => ({ ...value, types }))} />
    <MultiSelectGrid label="活跃状态" options={statuses} selected={filters.statuses} onChange={(statuses) => setFilters((value) => ({ ...value, statuses }))} />
    <MultiSelectGrid label="计量规则" options={rules} selected={filters.rules} onChange={(rules) => setFilters((value) => ({ ...value, rules }))} />
  </div></section>;

  let content: React.ReactNode;
  if (activeNav === "总览") content = <><Metrics rows={filteredRows} /><section className="dashboard-grid"><Panel label="MONTHLY TREND" title="月平均计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="METERING RULE" title="计量规则分布" aside={<span className="tag">点击可下钻</span>}><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel><Panel label="SALES PERFORMANCE" title="负责人业绩"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="PROVIDER RANKING" title="服务商进单"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel></section></>;
  else if (activeNav === "统一查询") content = <Panel label="DETAIL QUERY" title="业务明细" aside={<button className="primary-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出筛选结果</button>}><p className="panel-note">筛选、分页和导出均基于当前真实数据；空字段统一显示为 --。</p><DataTable rows={filteredRows} /></Panel>;
  else if (activeNav === "业务分析") content = <><Metrics rows={filteredRows} /><BusinessProgressTables rows={filteredRows} rules={calculationRules} /><section className="dashboard-grid"><Panel label="BUSINESS TREND" title="月度计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="RULE STRUCTURE" title="计量规则结构"><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel></section><BusinessReportTables rows={filteredRows} /></>;
  else if (activeNav === "销售分析") content = <><section className="module-grid"><Panel label="OWNER RANKING" title="负责人业绩排名"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="OWNER DETAILS" title="负责人业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section><SalesReportTables rows={filteredRows} /></>;
  else if (activeNav === "服务商分析") content = <><section className="module-grid"><Panel label="PROVIDER RANKING" title="服务商进单排名"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel><Panel label="PROVIDER DETAILS" title="服务商业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section><ProviderReportTables rows={filteredRows} /></>;
  else if (activeNav === "毛利与目标") content = <ProfitTargetTables />;
  else if (activeNav === "结算中心") content = <><Metrics rows={filteredRows} /><SettlementReportTables /></>;
  else content = <><section className="module-grid"><Panel label="SOURCE" title="当前数据来源"><div className="source-card"><strong>{snapshot.source.label}</strong><span>{snapshot.source.currentFile}</span><small>{snapshot.source.files.length ? snapshot.source.files.join("、") : "--"}</small><button className="primary-button" onClick={() => setShowImport(true)}>重新导入</button></div></Panel><CalculationRulePanel config={calculationRules} rows={calculatedRows} onChange={setCalculationRules} /><Panel label="QUALITY" title="数据可用性"><div className="quality-list"><span><strong>{numberText(snapshot.summary.total)}</strong> 去重后业务记录</span><span><strong>{snapshot.source.sheets?.length ?? (snapshot.mode === "empty" ? "--" : 1)}</strong> 已识别工作表</span><span><strong>{snapshot.source.deduplication?.removedRows ?? "--"}</strong> 设备重复记录已排除</span><span><strong>{snapshot.source.deduplication?.blankKeyRows ?? "--"}</strong> 设备编号为空</span><span><strong>{numberText(snapshot.summary.review)}</strong> 待人工复核</span><span><strong>0</strong> mock 数据</span></div></Panel>{snapshot.source.sheets?.length ? <Panel label="SHEETS" title="工作表识别结果" className="wide-panel"><div className="sheet-summary">{snapshot.source.sheets.map((sheet) => <span key={`${sheet.fileName}-${sheet.sheetName}`} className={`sheet-chip ${sheet.kind}`}>{sheet.fileName} / {sheet.sheetName} · {sheet.rowCount} 行</span>)}</div></Panel> : null}<ReportCatalog /></section><DataQualityReportTables rows={filteredRows} /></>;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">衡</div><div><strong>衡析</strong><span>CRM 业务分析平台</span></div></div><nav>{NAV_ITEMS.map(([name, description], index) => <button key={name} className={activeNav === name ? "active" : ""} onClick={() => navigate(name)}><span className="nav-icon">{String(index + 1).padStart(2, "0")}</span><span><strong>{name}</strong><small>{description}</small></span></button>)}</nav><div className="sidebar-foot"><i className={snapshot.mode === "empty" ? "empty" : ""} /><div><strong>{snapshot.mode === "empty" ? "等待导入数据" : "数据已连接"}</strong><small>{snapshot.source.currentFile}</small></div></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">BUSINESS INTELLIGENCE · 2026</p><h1>{activeNav}</h1></div><div className="top-actions"><span className="sync-state">数据更新：{updated}</span><button className="ghost-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出当前数据</button><button className="primary-button" onClick={() => setShowImport(true)}>＋ 导入数据</button></div></header>{filterBar}{snapshot.source.deduplication && <div className="dedup-banner"><div><strong>已按设备编号去重</strong><span>输入 {snapshot.source.deduplication.inputRows} 条，保留 {snapshot.source.deduplication.outputRows} 条，排除 {snapshot.source.deduplication.removedRows} 条重复记录。</span></div><small>{snapshot.source.deduplication.strategy}</small></div>}{snapshot.mode === "empty" && <AnalyticsPlaceholder onImport={() => setShowImport(true)} />}{snapshot.mode !== "empty" && content}<footer><span>缺失数据统一显示 -- · 不推断脱敏或已清空字段 · 结算结果仅供内部工作分流</span><span>BH 逻辑只读取结果，不回写原始公式</span></footer></main>
    <ImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={(data) => { setSnapshot(data); setFilters(EMPTY_FILTERS); }} />
  </div>;
}
