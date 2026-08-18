"use client";

import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AnalyticsPlaceholder } from "./components/AnalyticsPlaceholder";
import { BusinessProgressTables, BusinessReportTables, DataQualityReportTables, ProfitTargetTables, ProviderReportTables, SalesReportTables, SettlementReportTables } from "./components/ReportTables";
import { applyDynamicCalculationRules, buildSnapshot, DEFAULT_CALCULATION_RULES, EMPTY_SNAPSHOT, localDateISO, normalizeSnapshot, summarizeRows, type BusinessRow, type CalculationRuleConfig, type NumericValue, type RankedItem, type Snapshot } from "./lib/data-model";
import { BASE_PATH } from "./lib/deployment";
import type { DataVersionManifest } from "./lib/data-version";

const LazyImportDialog = lazy(() => import("./components/ImportDialog").then((module) => ({ default: module.ImportDialog })));
const LazyMonthlyChart = lazy(() => import("./components/AnalyticsCharts").then((module) => ({ default: module.MonthlyChart })));
const LazyRankingChart = lazy(() => import("./components/AnalyticsCharts").then((module) => ({ default: module.RankingChart })));
const LazyRuleChart = lazy(() => import("./components/AnalyticsCharts").then((module) => ({ default: module.RuleChart })));

const NAV_ITEMS = [
  ["总览", "总盘与关键指标"], ["统一查询", "明细筛选与导出"], ["业务分析", "趋势与计量结构"], ["销售分析", "负责人业绩与排名"],
  ["服务商分析", "I/II 服务商结构与明细"], ["毛利与目标", "目标、成本与毛利"], ["结算中心", "候选、复核与支付"], ["数据中心", "导入、质量与来源"],
] as const;
type ViewName = (typeof NAV_ITEMS)[number][0];

const EMPTY_FILTERS = { years: [] as string[], months: [] as string[], owners: [] as string[], types: [] as string[], statuses: [] as string[], rules: [] as string[], providers: [] as string[], businessNames: [] as string[], services: [] as string[], servicesII: [] as string[], paymentCycles: [] as string[], providerCategories: [] as string[], calculationStatuses: [] as string[], installmentFlags: [] as string[], removalTypes: [] as string[], keyword: "" };
const safeText = (value: string | null | undefined) => value?.trim() || "--";
const serviceFilterValue = (code: string, name: string) => [code, name].filter(Boolean).join(" · ");
const numberText = (value: NumericValue, digits = 0) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
const moneyWan = (value: NumericValue) => value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 10000);

function LoginScreen({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(`${BASE_PATH}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { username?: string; error?: string };
      if (!response.ok || !result.username) throw new Error(result.error || "登录失败");
      setPassword("");
      onLogin(result.username);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setWorking(false);
    }
  }
  return <main className="login-screen"><form className="login-card" onSubmit={(event) => void submit(event)}><div className="brand-mark">衡</div><span className="section-label">ADMIN ACCESS</span><h1>管理员登录</h1><p>业务数据与版本管理仅对管理员开放。</p><label><span>管理员账号</span><input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label><span>密码</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <div className="login-error">{message}</div>}<button className="primary-button" disabled={working}>{working ? "正在验证…" : "登录"}</button></form></main>;
}

type CenterNotice = { tone: "success" | "error"; text: string } | null;

function VersionPanel({ versions, activeId, workingId, onActivate, onCompose }: { versions: DataVersionManifest[]; activeId: string | null; workingId: string; onActivate: (id: string) => void; onCompose: (ids: string[], label: string) => Promise<boolean> }) {
  const [composeMode, setComposeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [composeLabel, setComposeLabel] = useState("");
  const ordered = [...versions].sort((left, right) => left.id === activeId ? -1 : right.id === activeId ? 1 : right.createdAt.localeCompare(left.createdAt));
  const selectableIds = ordered.filter((version) => version.kind !== "composed").map((version) => version.id);
  async function submitCompose() {
    if (await onCompose(selectedIds, composeLabel)) {
      setComposeMode(false);
      setSelectedIds([]);
      setComposeLabel("");
    }
  }
  return <Panel label="VERSION HISTORY" title="历史数据版本" className="wide-panel" aside={<div className="version-panel-actions"><span className="tag">历史版本不可变</span>{selectableIds.length >= 2 && <button className="ghost-button" onClick={() => setComposeMode((value) => !value)}>{composeMode ? "取消整合" : "多数据源整合"}</button>}</div>}>
    <p className="panel-note">每次上传都会生成新版本并自动激活。可选择多个原始上传版本，按设备编号整合为新的不可变版本；较新的 CRM 全量版本优先。</p>
    {versions.length === 1 && <div className="version-guidance">当前只有一个版本。再次上传表格后，可切换历史版本或进行多数据源整合。</div>}
    {composeMode && <div className="compose-box"><div><strong>选择需要整合的原始数据源</strong><span>已选 {selectedIds.length} 个版本，合计 {ordered.filter((version) => selectedIds.includes(version.id)).reduce((sum, version) => sum + version.rowCount, 0).toLocaleString("zh-CN")} 行</span></div><label><span>整合版本名称</span><input value={composeLabel} maxLength={120} onChange={(event) => setComposeLabel(event.target.value)} placeholder="例如：2026年8月 CRM 全量整合版" /></label><div className="compose-actions"><small>同一设备编号由发布时间较新的版本整行覆盖；空设备编号全部保留。</small><button className="primary-button" disabled={selectedIds.length < 2 || Boolean(workingId)} onClick={() => void submitCompose()}>{workingId === "compose" ? "整合中…" : "发布整合版本"}</button></div></div>}
    <div className="version-list">{ordered.length ? ordered.map((version) => {
      const isComposed = version.kind === "composed";
      return <article key={version.id} className={`version-item ${version.id === activeId ? "active" : ""}`}>
        {composeMode && <label className={`version-select ${isComposed ? "disabled" : ""}`} title={isComposed ? "派生版本不可再次作为原始数据源" : "选择此数据源"}><input type="checkbox" disabled={isComposed || Boolean(workingId)} checked={selectedIds.includes(version.id)} onChange={() => setSelectedIds((value) => value.includes(version.id) ? value.filter((id) => id !== version.id) : [...value, version.id])} /><span>{isComposed ? "派生" : "选择"}</span></label>}
        <div className="version-copy"><div className="version-title-row"><strong>{version.label}</strong>{version.id === activeId && <span className="status-chip ready">当前使用</span>}{isComposed && <span className="status-chip partial">整合版本</span>}</div><code>{version.id}</code><small>{new Date(version.createdAt).toLocaleString("zh-CN", { hour12: false })} · 上传者 {version.createdBy}</small><small>{version.rowCount.toLocaleString("zh-CN")} 条记录 · {isComposed ? `${version.sourceVersionIds?.length ?? 0} 个父版本` : `${version.files.length} 个源文件`}</small></div>
        {version.id === activeId ? <span className="version-current-note">全站正在使用</span> : <button className="ghost-button" disabled={Boolean(workingId)} onClick={() => onActivate(version.id)}>{workingId === version.id ? "切换中…" : "切换到此版本"}</button>}
      </article>;
    }) : <div className="availability-note"><strong>尚无服务器版本</strong><span>点击上方“上传新版本”发布第一份数据。</span></div>}</div>
  </Panel>;
}

function DataCenterView({ snapshot, admin, versions, activeId, workingId, notice, config, rows, onUpload, onRefresh, onActivate, onCompose, onLogout, onConfigChange }: { snapshot: Snapshot; admin: string; versions: DataVersionManifest[]; activeId: string | null; workingId: string; notice: CenterNotice; config: CalculationRuleConfig; rows: BusinessRow[]; onUpload: () => void; onRefresh: () => void; onActivate: (id: string) => void; onCompose: (ids: string[], label: string) => Promise<boolean>; onLogout: () => void; onConfigChange: (next: CalculationRuleConfig) => void }) {
  const activeVersion = versions.find((version) => version.id === activeId) ?? null;
  return <section className="data-center-flow">
    <Panel label="CURRENT DATA" title="当前数据版本" className="data-center-current" aside={<span className={`status-chip ${activeVersion ? "ready" : "pending"}`}>{activeVersion ? "已激活" : "等待发布"}</span>}>
      {notice && <div className={`center-notice ${notice.tone}`}>{notice.text}</div>}
      {activeVersion ? <><div className="current-version-head"><div><strong>{activeVersion.label}</strong><code>{activeVersion.id}</code></div><div className="current-version-actions"><button className="primary-button" onClick={onUpload}>＋ 上传新版本</button><button className="ghost-button" onClick={onRefresh}>刷新版本</button><button className="text-button" onClick={onLogout}>退出登录</button></div></div><div className="current-version-stats"><span><small>发布时间</small><strong>{new Date(activeVersion.createdAt).toLocaleString("zh-CN", { hour12: false })}</strong></span><span><small>上传者</small><strong>{activeVersion.createdBy}</strong></span><span><small>业务记录</small><strong>{activeVersion.rowCount.toLocaleString("zh-CN")} 条</strong></span><span><small>数据来源</small><strong>{activeVersion.kind === "composed" ? `${activeVersion.sourceVersionIds?.length ?? 0} 个版本` : `${activeVersion.files.length} 个文件`}</strong></span></div></> : <div className="current-version-empty"><div><strong>尚未发布服务器数据</strong><span>上传表格并确认工作表后，系统会生成第一个不可变版本并自动激活。</span></div><div className="current-version-actions"><button className="primary-button" onClick={onUpload}>＋ 上传第一个版本</button><button className="text-button" onClick={onLogout}>退出登录（{admin}）</button></div></div>}
    </Panel>
    <VersionPanel versions={versions} activeId={activeId} workingId={workingId} onActivate={onActivate} onCompose={onCompose} />
    <section className="module-grid data-center-secondary">
      <Panel label="SOURCE" title="当前数据来源"><div className="compact-source"><strong>{snapshot.source.label}</strong><span>{snapshot.source.currentFile}</span><small>{snapshot.source.files.length ? snapshot.source.files.join("、") : "--"}</small></div></Panel>
      <Panel label="QUALITY SUMMARY" title="数据概况"><div className="quality-list compact"><span><strong>{numberText(snapshot.summary.total)}</strong>业务记录</span><span><strong>{snapshot.source.deduplication?.removedRows ?? "--"}</strong>排除重复</span><span><strong>{snapshot.source.deduplication?.blankKeyRows ?? "--"}</strong>设备号为空</span><span><strong>{numberText(snapshot.summary.review)}</strong>待复核</span></div></Panel>
    </section>
    <div className="data-center-full"><CalculationRulePanel config={config} rows={rows} onChange={onConfigChange} /></div>
    {snapshot.source.sheets?.length ? <Panel label="SHEET AUDIT" title="工作表与去重审计" className="wide-panel"><div className="sheet-summary">{snapshot.source.sheets.map((sheet) => <span key={`${sheet.fileName}-${sheet.sheetName}`} className={`sheet-chip ${sheet.kind}`}>{sheet.fileName} / {sheet.sheetName} · {sheet.rowCount} 行</span>)}</div>{snapshot.source.deduplication && <p className="panel-note">按设备编号去重：输入 {snapshot.source.deduplication.inputRows} 条，保留 {snapshot.source.deduplication.outputRows} 条，排除 {snapshot.source.deduplication.removedRows} 条；空设备编号 {snapshot.source.deduplication.blankKeyRows} 条。</p>}</Panel> : null}
    {rows.length ? <div className="data-center-quality"><DataQualityReportTables rows={rows} /></div> : null}
  </section>;
}

function ChartFallback() {
  return <div className="chart-empty"><span>图表加载中…</span></div>;
}

function MonthlyChart({ data }: { data: Snapshot["monthly"] }) {
  return <Suspense fallback={<ChartFallback />}><LazyMonthlyChart data={data} /></Suspense>;
}

function RuleChart({ data, onSelect }: { data: Snapshot["meteringRules"]; onSelect?: (name: string) => void }) {
  return <Suspense fallback={<ChartFallback />}><LazyRuleChart data={data} onSelect={onSelect} /></Suspense>;
}

function RankingChart({ items, onSelect }: { items: RankedItem[]; onSelect?: (name: string) => void }) {
  return <Suspense fallback={<ChartFallback />}><LazyRankingChart items={items} onSelect={onSelect} /></Suspense>;
}

function exportRows(rows: BusinessRow[]) {
  const headers = ["业务判定", "判定来源", "源业务属性", "业务名称", "负责人", "供应商", "I服务编号", "I服务简称", "II服务编号", "II服务简称", "初始完工日期", "完工日期", "有效完工日期", "日期来源", "表内现日期", "活跃状态", "源计量规则", "当前计量规则", "计算来源", "计算状态", "分期计算标识", "拆机类型", "用户拆机原因", "联系人固话（脱敏）", "付款周期", "服务分类", "线数", "月平均计量"];
  const quote = (value: unknown) => {
    const source = String(value ?? "");
    const safe = typeof value === "string" && /^[=+\-@]/.test(source.trimStart()) ? `'${source}` : source;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const body = rows.map((row) => [row.businessEvent, row.businessEventSource, row.businessType, row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName, row.serviceCodeII, row.serviceNameII, row.initialCompletedDate, row.rawCompletedDate, row.completedDate, row.completionDateSource, row.sourceCurrentDate, row.activeStatus, row.sourceMeteringRule, row.meteringRule, row.calculationRuleSource, row.calculationStatus, row.installmentCalculationFlag, row.removalType, row.userRemovalReason, row.contactLandlineMasked, row.paymentCycle, row.providerCategory, row.lines, row.monthlyMetering].map(quote).join(","));
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

function MultiSelectGrid({ label, options, selected, onChange, limit = 12 }: { label: string; options: string[]; selected: string[]; onChange: (next: string[]) => void; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  function toggle(option: string) {
    if (!selected.length) return onChange([option]);
    if (selected.includes(option)) return onChange(selected.length === 1 ? [] : selected.filter((value) => value !== option));
    onChange([...selected, option]);
  }
  function release(event: React.PointerEvent<HTMLButtonElement>, option: string) {
    const startedAt = Number(event.currentTarget.dataset.pressedAt ?? 0);
    delete event.currentTarget.dataset.pressedAt;
    if (startedAt && event.timeStamp - startedAt >= 550) onChange([option]);
    else toggle(option);
  }

  const orderedOptions = [...selected, ...options.filter((option) => !selected.includes(option))];
  const visibleOptions = expanded ? orderedOptions : orderedOptions.slice(0, limit);
  return <fieldset className="filter-group"><legend>{label}<small>短按多选 · 长按单选</small></legend><div className="filter-options">
    <button type="button" className={!selected.length ? "active all" : ""} aria-pressed={!selected.length} onClick={() => onChange([])}>全部</button>
    {options.length ? visibleOptions.map((option) => <button type="button" key={option} className={selected.includes(option) ? "active" : ""} aria-pressed={selected.includes(option)} title={`点击增减选择；长按只选 ${option}`} onPointerDown={(event) => { event.currentTarget.dataset.pressedAt = String(event.timeStamp); }} onPointerUp={(event) => release(event, option)} onPointerLeave={(event) => { delete event.currentTarget.dataset.pressedAt; }} onPointerCancel={(event) => { delete event.currentTarget.dataset.pressedAt; }} onContextMenu={(event) => event.preventDefault()} onClick={(event) => { if (event.detail === 0) toggle(option); }}>{option}</button>) : <span className="filter-empty">--</span>}
    {orderedOptions.length > limit && <button type="button" className="filter-more" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : `更多 ${orderedOptions.length - limit}`}</button>}
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
    <div className="table-scroll"><table><thead><tr><th>业务判定</th><th>判定来源</th><th>源业务属性</th><th>业务名称</th><th>负责人</th><th>供应商</th><th>I服务编号</th><th>I服务简称</th><th>II服务编号</th><th>II服务简称</th><th>有效完工日期</th><th>日期来源</th><th>活跃状态</th><th>计量规则</th><th>计算来源</th><th>计算状态</th><th>分期计算标识</th><th>拆机类型</th><th>用户拆机原因</th><th>联系人固话（脱敏）</th><th>付款周期</th><th>服务分类</th><th className="number">线数</th><th className="number">月平均计量</th></tr></thead>
      <tbody>{visible.length ? visible.map((row, index) => <tr key={`${row.serviceCode}-${index}`}><td><span className={`business-chip ${row.businessEvent === "拆机" ? "removal" : ""}`}>{safeText(row.businessEvent)}</span></td><td>{safeText(row.businessEventSource)}</td><td>{safeText(row.businessType)}</td><td>{safeText(row.businessName)}</td><td>{safeText(row.owner)}</td><td>{safeText(row.provider)}</td><td className="code">{safeText(row.serviceCode)}</td><td>{safeText(row.serviceName)}</td><td className="code">{safeText(row.serviceCodeII)}</td><td>{safeText(row.serviceNameII)}</td><td>{safeText(row.completedDate)}</td><td><span className={`date-source-chip ${row.completionDateSource === "完工日期兜底" ? "fallback" : row.completionDateSource === "缺失" ? "missing" : ""}`}>{safeText(row.completionDateSource)}</span></td><td><span className={`active-chip ${/不活跃|停止|暂停/.test(row.activeStatus) ? "inactive" : ""}`}>{safeText(row.activeStatus)}</span></td><td>{safeText(row.meteringRule)}</td><td>{safeText(row.calculationRuleSource)}</td><td>{safeText(row.calculationStatus)}</td><td>{safeText(row.installmentCalculationFlag)}</td><td>{safeText(row.removalType)}</td><td>{safeText(row.userRemovalReason)}</td><td>{safeText(row.contactLandlineMasked)}</td><td>{safeText(row.paymentCycle)}</td><td>{safeText(row.providerCategory)}</td><td className="number">{numberText(row.lines)}</td><td className="number">{row.monthlyMetering === null ? "--" : `¥ ${numberText(row.monthlyMetering, 2)}`}</td></tr>) : <tr><td className="empty-cell" colSpan={24}>--　暂无匹配数据</td></tr>}</tbody></table></div>
    <div className="table-foot"><span>共 {rows.length} 条 · 第 {safePage} / {pages} 页</span><div className="pager"><button disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}>上一页</button><button disabled={safePage >= pages} onClick={() => setPage(Math.min(pages, safePage + 1))}>下一页</button></div></div>
  </>;
}

function CalculationRulePanel({ config, rows, onChange }: { config: CalculationRuleConfig; rows: BusinessRow[]; onChange: (next: CalculationRuleConfig) => void }) {
  const differences = rows.filter((row) => row.sourceMeteringRule && row.meteringRule !== row.sourceMeteringRule).length;
  const numberChange = (key: "newVolumeMonths" | "overdueMonths", value: string) => onChange({ ...config, [key]: Number(value) || 0 });
  return <Panel label="DYNAMIC CALCULATION" title="动态计算规则" aside={<span className={`status-chip ${config.enabled ? "ready" : "pending"}`}>{config.enabled ? "已启用" : "读取CRM结果"}</span>}><p className="panel-note">CRM导入值保持不变；平台依据下列参数动态生成当前计量规则，并保留源结果用于对比。设置保存在当前浏览器。</p><div className="calculation-grid">
    <label><span>动态计算</span><select value={config.enabled ? "on" : "off"} onChange={(event) => onChange({ ...config, enabled: event.target.value === "on" })}><option value="on">启用</option><option value="off">停用</option></select></label>
    <label><span>规则版本</span><input value={config.version} onChange={(event) => onChange({ ...config, version: event.target.value })} /></label>
    <label><span>日期模式</span><select value={config.dateMode} onChange={(event) => onChange({ ...config, dateMode: event.target.value as "current" | "manual", baseDate: event.target.value === "manual" ? localDateISO() : config.baseDate })}><option value="current">跟随当前日期</option><option value="manual">指定审计日期</option></select></label>
    <label><span>计算基准日期</span><input type="date" disabled={config.dateMode === "current"} value={config.dateMode === "current" ? localDateISO() : config.baseDate} onChange={(event) => onChange({ ...config, baseDate: event.target.value })} /></label>
    <label><span>新量阈值（月）</span><input type="number" min="0" value={config.newVolumeMonths} onChange={(event) => numberChange("newVolumeMonths", event.target.value)} /></label>
    <label><span>超期阈值（月）</span><input type="number" min="0" value={config.overdueMonths} onChange={(event) => numberChange("overdueMonths", event.target.value)} /></label>
    <label><span>拆机率分母</span><select value={config.removalRateDenominator} onChange={(event) => onChange({ ...config, removalRateDenominator: event.target.value as "total" | "installs" })}><option value="total">总线数</option><option value="installs">新增线数</option></select></label>
  </div><div className="rule-audit"><span><strong>{rows.length}</strong> 当前记录</span><span><strong>{differences}</strong> 与CRM静态结果不同</span><span><strong>{config.version || "--"}</strong> 当前规则版本</span></div></Panel>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [admin, setAdmin] = useState<string | null | undefined>(undefined);
  const [versions, setVersions] = useState<DataVersionManifest[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [versionWorking, setVersionWorking] = useState("");
  const [centerNotice, setCenterNotice] = useState<CenterNotice>(null);
  const [activeNav, setActiveNav] = useState<ViewName>("总览");
  const [showImport, setShowImport] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [currentDate, setCurrentDate] = useState(() => localDateISO());
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
    void (async () => {
      try {
        const sessionResponse = await fetch(`${BASE_PATH}/api/auth/session`, { cache: "no-store" });
        if (!sessionResponse.ok) throw new Error("unauthorized");
        const session = await sessionResponse.json() as { username: string };
        setAdmin(session.username);
        const [currentResponse, versionsResponse] = await Promise.all([
          fetch(`${BASE_PATH}/api/data/current`, { cache: "no-store" }),
          fetch(`${BASE_PATH}/api/data/versions`, { cache: "no-store" }),
        ]);
        if (currentResponse.ok) {
          const current = await currentResponse.json() as { snapshot: Partial<Snapshot>; version: DataVersionManifest };
          setSnapshot(normalizeSnapshot(current.snapshot));
          setActiveVersionId(current.version.id);
        } else {
          setSnapshot(EMPTY_SNAPSHOT);
        }
        if (versionsResponse.ok) {
          const history = await versionsResponse.json() as { activeId: string | null; versions: DataVersionManifest[] };
          setVersions(history.versions);
          setActiveVersionId(history.activeId);
        }
      } catch {
        setAdmin(null);
        setSnapshot(EMPTY_SNAPSHOT);
      }
    })();
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("crm-calculation-rules", JSON.stringify(calculationRules)); } catch { /* 仅影响偏好持久化。 */ }
  }, [calculationRules]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(localDateISO()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const effectiveCalculationRules = useMemo(() => calculationRules.dateMode === "current" ? { ...calculationRules, baseDate: currentDate } : calculationRules, [calculationRules, currentDate]);
  const calculatedRows = useMemo(() => applyDynamicCalculationRules(snapshot?.rows ?? [], effectiveCalculationRules), [snapshot, effectiveCalculationRules]);
  const filteredRows = useMemo(() => calculatedRows.filter((row) => {
    const [year, month] = row.completedDate.split("-");
    return (!filters.years.length || filters.years.includes(year)) && (!filters.months.length || filters.months.includes(month)) &&
      (!filters.owners.length || filters.owners.includes(row.owner)) && (!filters.types.length || filters.types.includes(row.businessEvent)) &&
      (!filters.statuses.length || filters.statuses.includes(row.activeStatus)) && (!filters.rules.length || filters.rules.includes(row.meteringRule)) &&
      (!filters.providers.length || filters.providers.includes(row.provider)) && (!filters.businessNames.length || filters.businessNames.includes(row.businessName)) &&
      (!filters.services.length || filters.services.includes(serviceFilterValue(row.serviceCode, row.serviceName))) && (!filters.servicesII.length || filters.servicesII.includes(serviceFilterValue(row.serviceCodeII, row.serviceNameII))) &&
      (!filters.paymentCycles.length || filters.paymentCycles.includes(row.paymentCycle)) && (!filters.providerCategories.length || filters.providerCategories.includes(row.providerCategory)) &&
      (!filters.calculationStatuses.length || filters.calculationStatuses.includes(row.calculationStatus)) && (!filters.installmentFlags.length || filters.installmentFlags.includes(row.installmentCalculationFlag)) &&
      (!filters.removalTypes.length || filters.removalTypes.includes(row.removalType)) &&
      (!deferredKeyword || [row.businessName, row.owner, row.provider, row.serviceCode, row.serviceName, row.serviceCodeII, row.serviceNameII, row.calculationStatus, row.installmentCalculationFlag, row.removalType, row.userRemovalReason, row.contactLandlineMasked].join(" ").toLowerCase().includes(deferredKeyword));
  }), [calculatedRows, filters, deferredKeyword]);
  const analysis = useMemo(() => buildSnapshot(filteredRows, snapshot?.source ?? EMPTY_SNAPSHOT.source, snapshot?.mode ?? "empty"), [filteredRows, snapshot?.source, snapshot?.mode]);

  async function refreshServerData() {
    const [currentResponse, versionsResponse] = await Promise.all([
      fetch(`${BASE_PATH}/api/data/current`, { cache: "no-store" }),
      fetch(`${BASE_PATH}/api/data/versions`, { cache: "no-store" }),
    ]);
    if (currentResponse.status === 401 || versionsResponse.status === 401) {
      setAdmin(null);
      setSnapshot(EMPTY_SNAPSHOT);
      throw new Error("管理员会话已失效，请重新登录");
    }
    if (!currentResponse.ok && currentResponse.status !== 404) throw new Error("当前数据读取失败");
    if (!versionsResponse.ok) throw new Error("版本列表读取失败");
    if (currentResponse.ok) {
      const current = await currentResponse.json() as { snapshot: Partial<Snapshot>; version: DataVersionManifest };
      setSnapshot(normalizeSnapshot(current.snapshot));
      setActiveVersionId(current.version.id);
    } else setSnapshot(EMPTY_SNAPSHOT);
    if (versionsResponse.ok) {
      const history = await versionsResponse.json() as { activeId: string | null; versions: DataVersionManifest[] };
      setVersions(history.versions);
      setActiveVersionId(history.activeId);
    }
  }

  async function refreshDataCenter() {
    setCenterNotice(null);
    try {
      await refreshServerData();
      setCenterNotice({ tone: "success", text: "版本列表和当前数据已刷新。" });
    } catch (error) {
      setCenterNotice({ tone: "error", text: error instanceof Error ? error.message : "数据刷新失败" });
    }
  }

  async function activateDataVersion(id: string) {
    const target = versions.find((version) => version.id === id);
    const current = versions.find((version) => version.id === activeVersionId);
    if (!target || !window.confirm(`确认切换数据版本？\n\n当前：${current?.label ?? "--"}\n目标：${target.label}\n\n切换后全站立即读取目标版本，现有版本不会被覆盖或删除。`)) return;
    setVersionWorking(id);
    setCenterNotice(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/data/versions/${encodeURIComponent(id)}/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "管理员在数据中心手动切换" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "版本切换失败");
      await refreshServerData();
      setFilters(EMPTY_FILTERS);
      setCenterNotice({ tone: "success", text: `已切换到“${target.label}”，全站数据已同步更新。` });
    } catch (error) {
      setCenterNotice({ tone: "error", text: error instanceof Error ? error.message : "版本切换失败" });
    } finally {
      setVersionWorking("");
    }
  }

  async function composeDataVersions(ids: string[], label: string) {
    const selected = versions.filter((version) => ids.includes(version.id)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    if (selected.length < 2) return false;
    const summary = selected.map((version) => `${version.label}（${version.rowCount.toLocaleString("zh-CN")} 条）`).join("\n");
    if (!window.confirm(`确认发布多数据源整合版本？\n\n${summary}\n\n同一设备将保留发布时间较新的 CRM 全量版本记录，原版本不会被修改。`)) return false;
    setVersionWorking("compose");
    setCenterNotice(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/data/compose`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceVersionIds: ids, label }) });
      const result = await response.json() as { snapshot?: Partial<Snapshot>; version?: DataVersionManifest; error?: string };
      if (!response.ok || !result.snapshot || !result.version) throw new Error(result.error || "多数据源整合失败");
      setSnapshot(normalizeSnapshot(result.snapshot));
      setActiveVersionId(result.version.id);
      setFilters(EMPTY_FILTERS);
      await refreshServerData();
      setCenterNotice({ tone: "success", text: `已发布并激活“${result.version.label}”，原始版本仍完整保留。` });
      return true;
    } catch (error) {
      setCenterNotice({ tone: "error", text: error instanceof Error ? error.message : "多数据源整合失败" });
      return false;
    } finally {
      setVersionWorking("");
    }
  }

  async function logout() {
    await fetch(`${BASE_PATH}/api/auth/logout`, { method: "POST" }).catch(() => undefined);
    setAdmin(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setVersions([]);
  }

  if (admin === undefined || !snapshot) return <main className="loading-screen"><div className="loading-mark">CRM</div><p>正在验证管理员会话…</p></main>;
  if (admin === null) return <LoginScreen onLogin={(username) => { setAdmin(username); setSnapshot(null); window.location.reload(); }} />;
  const years = [...new Set(calculatedRows.map((row) => row.completedDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().reverse();
  const statuses = [...new Set(calculatedRows.map((row) => row.activeStatus).filter(Boolean))].sort();
  const rules = [...new Set(calculatedRows.map((row) => row.meteringRule).filter(Boolean))].sort();
  const owners = [...new Set(calculatedRows.map((row) => row.owner).filter(Boolean))].sort();
  const businessTypes = [...new Set(calculatedRows.map((row) => row.businessEvent).filter(Boolean))].sort();
  const providers = [...new Set(calculatedRows.map((row) => row.provider).filter(Boolean))].sort();
  const businessNames = [...new Set(calculatedRows.map((row) => row.businessName).filter(Boolean))].sort();
  const services = [...new Set(calculatedRows.map((row) => serviceFilterValue(row.serviceCode, row.serviceName)).filter(Boolean))].sort();
  const servicesII = [...new Set(calculatedRows.map((row) => serviceFilterValue(row.serviceCodeII, row.serviceNameII)).filter(Boolean))].sort();
  const paymentCycles = [...new Set(calculatedRows.map((row) => row.paymentCycle).filter(Boolean))].sort();
  const providerCategories = [...new Set(calculatedRows.map((row) => row.providerCategory).filter(Boolean))].sort();
  const calculationStatuses = [...new Set(calculatedRows.map((row) => row.calculationStatus).filter(Boolean))].sort();
  const installmentFlags = [...new Set(calculatedRows.map((row) => row.installmentCalculationFlag).filter(Boolean))].sort();
  const removalTypes = [...new Set(calculatedRows.map((row) => row.removalType).filter(Boolean))].sort();
  const updated = snapshot.mode === "empty" ? "--" : new Date(snapshot.generatedAt).toLocaleString("zh-CN", { hour12: false });

  function navigate(name: ViewName) { setActiveNav(name); window.history.replaceState(null, "", `#${encodeURIComponent(name)}`); }
  function selectRule(name: string) { setFilters((value) => ({ ...value, rules: [name] })); navigate("统一查询"); }
  function selectRank(name: string, field: "owner" | "provider") { setFilters((value) => field === "owner" ? ({ ...value, owners: [name] }) : ({ ...value, keyword: name })); navigate(field === "owner" ? "销售分析" : "服务商分析"); }
  const moreFilterCount = filters.providers.length + filters.businessNames.length + filters.services.length + filters.servicesII.length + filters.paymentCycles.length + filters.providerCategories.length + filters.calculationStatuses.length + filters.installmentFlags.length + filters.removalTypes.length;

  const filterBar = <section className="filter-bar"><div className="filter-toolbar"><label className="search-box"><span>⌕</span><input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="搜索业务、服务、拆机原因、固话尾号…" /></label><span className="filter-tip">点击可多选，长按约半秒切换为单选</span><button className="ghost-button filter-toggle" onClick={() => setShowMoreFilters((value) => !value)}>{showMoreFilters ? "收起扩展筛选" : `更多筛选${moreFilterCount ? `（${moreFilterCount}）` : ""}`}</button><button className="clear-button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>重置筛选</button></div><div className="filter-grid">
    <MultiSelectGrid label="完工年份" options={years} selected={filters.years} onChange={(years) => setFilters((value) => ({ ...value, years }))} />
    <MultiSelectGrid label="完工月份" options={Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))} selected={filters.months} onChange={(months) => setFilters((value) => ({ ...value, months }))} />
    <MultiSelectGrid label="负责人" options={owners} selected={filters.owners} onChange={(owners) => setFilters((value) => ({ ...value, owners }))} />
    <MultiSelectGrid label="业务判定" options={businessTypes} selected={filters.types} onChange={(types) => setFilters((value) => ({ ...value, types }))} />
    <MultiSelectGrid label="活跃状态" options={statuses} selected={filters.statuses} onChange={(statuses) => setFilters((value) => ({ ...value, statuses }))} />
    <MultiSelectGrid label="计量规则" options={rules} selected={filters.rules} onChange={(rules) => setFilters((value) => ({ ...value, rules }))} />
    {showMoreFilters && <>
      <MultiSelectGrid label="供应商" options={providers} selected={filters.providers} onChange={(providers) => setFilters((value) => ({ ...value, providers }))} />
      <MultiSelectGrid label="业务名称" options={businessNames} selected={filters.businessNames} onChange={(businessNames) => setFilters((value) => ({ ...value, businessNames }))} />
      <MultiSelectGrid label="I 服务" options={services} selected={filters.services} onChange={(services) => setFilters((value) => ({ ...value, services }))} />
      <MultiSelectGrid label="II 服务" options={servicesII} selected={filters.servicesII} onChange={(servicesII) => setFilters((value) => ({ ...value, servicesII }))} />
      <MultiSelectGrid label="付款周期" options={paymentCycles} selected={filters.paymentCycles} onChange={(paymentCycles) => setFilters((value) => ({ ...value, paymentCycles }))} />
      <MultiSelectGrid label="服务分类" options={providerCategories} selected={filters.providerCategories} onChange={(providerCategories) => setFilters((value) => ({ ...value, providerCategories }))} />
      <MultiSelectGrid label="计算状态" options={calculationStatuses} selected={filters.calculationStatuses} onChange={(calculationStatuses) => setFilters((value) => ({ ...value, calculationStatuses }))} />
      <MultiSelectGrid label="分期计算标识" options={installmentFlags} selected={filters.installmentFlags} onChange={(installmentFlags) => setFilters((value) => ({ ...value, installmentFlags }))} />
      <MultiSelectGrid label="拆机类型" options={removalTypes} selected={filters.removalTypes} onChange={(removalTypes) => setFilters((value) => ({ ...value, removalTypes }))} />
    </>}
  </div></section>;

  let content: React.ReactNode;
  if (activeNav === "总览") content = <><Metrics rows={filteredRows} /><section className="dashboard-grid"><Panel label="MONTHLY TREND" title="月平均计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="METERING RULE" title="计量规则分布" aside={<span className="tag">点击可下钻</span>}><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel><Panel label="SALES PERFORMANCE" title="负责人业绩"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="PROVIDER RANKING" title="服务商进单"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel></section></>;
  else if (activeNav === "统一查询") content = <Panel label="DETAIL QUERY" title="业务明细" aside={<button className="primary-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出筛选结果</button>}><p className="panel-note">筛选、分页和导出均基于当前真实数据；空字段统一显示为 --。</p><DataTable rows={filteredRows} /></Panel>;
  else if (activeNav === "业务分析") content = <><Metrics rows={filteredRows} /><BusinessProgressTables rows={filteredRows} rules={effectiveCalculationRules} /><section className="dashboard-grid"><Panel label="BUSINESS TREND" title="月度计量趋势"><MonthlyChart data={analysis.monthly} /></Panel><Panel label="RULE STRUCTURE" title="计量规则结构"><RuleChart data={analysis.meteringRules} onSelect={selectRule} /></Panel></section><BusinessReportTables rows={filteredRows} /></>;
  else if (activeNav === "销售分析") content = <><section className="module-grid"><Panel label="OWNER RANKING" title="负责人业绩排名"><RankingChart items={analysis.owners} onSelect={(name) => selectRank(name, "owner")} /></Panel><Panel label="OWNER DETAILS" title="负责人业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section><SalesReportTables rows={filteredRows} /></>;
  else if (activeNav === "服务商分析") content = <><section className="module-grid"><Panel label="PROVIDER RANKING" title="服务商进单排名"><RankingChart items={analysis.providers} onSelect={(name) => selectRank(name, "provider")} /></Panel><Panel label="PROVIDER DETAILS" title="服务商业务明细"><DataTable rows={filteredRows} pageSize={10} /></Panel></section><ProviderReportTables rows={filteredRows} /></>;
  else if (activeNav === "毛利与目标") content = <ProfitTargetTables />;
  else if (activeNav === "结算中心") content = <><Metrics rows={filteredRows} /><SettlementReportTables /></>;
  else content = <DataCenterView snapshot={snapshot} admin={admin} versions={versions} activeId={activeVersionId} workingId={versionWorking} notice={centerNotice} config={calculationRules} rows={calculatedRows} onUpload={() => setShowImport(true)} onRefresh={() => void refreshDataCenter()} onActivate={(id) => void activateDataVersion(id)} onCompose={composeDataVersions} onLogout={() => void logout()} onConfigChange={setCalculationRules} />;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">衡</div><div><strong>衡析</strong><span>CRM 业务分析平台</span></div></div><nav>{NAV_ITEMS.map(([name, description], index) => <button key={name} className={activeNav === name ? "active" : ""} onClick={() => navigate(name)}><span className="nav-icon">{String(index + 1).padStart(2, "0")}</span><span><strong>{name}</strong><small>{description}</small></span></button>)}</nav><div className="sidebar-foot"><i className={snapshot.mode === "empty" ? "empty" : ""} /><div><strong>{snapshot.mode === "empty" ? "等待导入数据" : "数据已连接"}</strong><small>{snapshot.source.currentFile}</small></div></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">BUSINESS INTELLIGENCE · 2026</p><h1>{activeNav}</h1></div><div className="top-actions"><span className="sync-state">数据更新：{updated}</span><button className="ghost-button" disabled={!filteredRows.length} onClick={() => exportRows(filteredRows)}>导出当前数据</button><button className="primary-button" onClick={() => setShowImport(true)}>＋ 导入数据</button></div></header>{activeNav !== "数据中心" && filterBar}{activeNav !== "数据中心" && snapshot.source.deduplication && <div className="dedup-banner"><div><strong>已按设备编号去重</strong><span>输入 {snapshot.source.deduplication.inputRows} 条，保留 {snapshot.source.deduplication.outputRows} 条，排除 {snapshot.source.deduplication.removedRows} 条重复记录。</span></div><small>{snapshot.source.deduplication.strategy}</small></div>}{activeNav === "数据中心" ? content : snapshot.mode === "empty" ? <AnalyticsPlaceholder onImport={() => setShowImport(true)} /> : content}<footer><span>缺失数据统一显示 -- · 不推断脱敏或已清空字段 · 结算结果仅供内部工作分流</span><span>BH 逻辑只读取结果，不回写原始公式</span></footer></main>
    {showImport ? <Suspense fallback={null}><LazyImportDialog open onClose={() => setShowImport(false)} onImported={(data) => { setSnapshot(data); setFilters(EMPTY_FILTERS); setCenterNotice({ tone: "success", text: "新数据版本已发布并自动激活，旧版本仍保留在历史列表中。" }); void refreshServerData().catch((error) => setCenterNotice({ tone: "error", text: error instanceof Error ? error.message : "版本列表刷新失败" })); }} /></Suspense> : null}
  </div>;
}
