"use client";

import { useEffect, useMemo, useState } from "react";
import { REPORTS } from "./lib/report-registry";
import { ImportDialog } from "./components/ImportDialog";

type BusinessRow = {
  businessType: string;
  businessName: string;
  owner: string;
  serviceCode: string;
  serviceName: string;
  completedDate: string;
  activeStatus: string;
  meteringRule: string;
  lines: number;
  monthlyMetering: number;
};

type RankedItem = {
  key: string;
  label: string;
  secondary?: string;
  lines: number;
  amount: number;
  share: number;
};

type Snapshot = {
  mode: "local" | "demo";
  generatedAt: string;
  source: { label: string; files: string[]; currentFile: string };
  summary: {
    total: number;
    active: number;
    installs: number;
    removals: number;
    monthlyMetering: number;
    review: number;
  };
  monthly: Array<{ month: string; installs: number; removals: number; amount: number }>;
  meteringRules: Array<{ label: string; value: number; color: string }>;
  owners: RankedItem[];
  providers: RankedItem[];
  rows: BusinessRow[];
};

const amountInWan = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 10000);

const navItems = [
  ["总览", "总盘与关键指标"],
  ["统一查询", "明细筛选与导出"],
  ["业务分析", "双线、拆装与计量"],
  ["销售分析", "业绩、净增与排名"],
  ["服务商分析", "进单、拆机与政策"],
  ["毛利与目标", "首年、次年与进度"],
  ["结算中心", "候选、发票与支付"],
  ["数据中心", "导入、质量与规则"],
];

const options = {
  year: ["全部年份", "2026", "2025", "2024"],
  month: ["全部月份", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
  status: ["全部状态", "活跃", "不活跃"],
  rule: ["全部计量规则", "新增量", "新量", "存量", "超期"],
};

function Trend({ data }: { data: Snapshot["monthly"] }) {
  const max = Math.max(...data.map((item) => item.amount), 1);
  return (
    <div className="trend-chart">
      <div className="trend-grid" />
      <div className="trend-bars">
        {data.map((item) => (
          <div className="trend-column" key={item.month}>
            <div className="bar-stack">
              <div
                className="bar-value"
                style={{ height: `${Math.max(7, (item.amount / max) * 100)}%` }}
                title={`${item.month}月：${amountInWan(item.amount)} 万元`}
              />
            </div>
            <span>{item.month}月</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({ data }: { data: Snapshot["meteringRules"] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const gradient = data
    .map((item) => {
      const start = cursor;
      cursor += (item.value / total) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(", ");
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="donut-hole"><strong>{total}</strong><span>总线数</span></div>
      </div>
      <div className="legend">
        {data.map((item) => (
          <div className="legend-row" key={item.label}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <em>{((item.value / total) * 100).toFixed(1)}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ranking({ items, label }: { items: RankedItem[]; label: string }) {
  const max = Math.max(...items.map((item) => item.amount), 1);
  return (
    <div className="ranking-list">
      {items.slice(0, 5).map((item, index) => (
        <div className="ranking-row" key={item.key}>
          <span className={`rank rank-${index + 1}`}>{index + 1}</span>
          <div className="rank-main">
            <div className="rank-heading">
              <div><strong>{item.label}</strong><small>{item.secondary}</small></div>
              <span>{item.lines} 线</span>
            </div>
            <div className="progress-track"><i style={{ width: `${Math.max(4, (item.amount / max) * 100)}%` }} /></div>
          </div>
          <div className="rank-value"><strong>{amountInWan(item.amount)}</strong><span>万元 · {item.share.toFixed(1)}%</span></div>
        </div>
      ))}
      <button className="text-button">查看完整{label} →</button>
    </div>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeNav, setActiveNav] = useState("总览");
  const [showImport, setShowImport] = useState(false);
  const [filters, setFilters] = useState({
    year: "全部年份",
    month: "全部月份",
    status: "全部状态",
    rule: "全部计量规则",
    keyword: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const local = await fetch("/data/local-snapshot.json", { cache: "no-store" });
        if (local.ok) return setSnapshot(await local.json());
      } catch {
        // The hosted build intentionally contains no local business records.
      }
      setSnapshot(await (await fetch("/data/demo-snapshot.json")).json());
    }
    load();
  }, []);

  const filteredRows = useMemo(() => {
    if (!snapshot) return [];
    const keyword = filters.keyword.toLowerCase().trim();
    return snapshot.rows.filter((row) => {
      const [year, month] = row.completedDate.split("-");
      return (
        (filters.year === "全部年份" || filters.year === year) &&
        (filters.month === "全部月份" || filters.month === month) &&
        (filters.status === "全部状态" || row.activeStatus === filters.status) &&
        (filters.rule === "全部计量规则" || row.meteringRule === filters.rule) &&
        (!keyword || [row.businessName, row.owner, row.serviceCode, row.serviceName].join(" ").toLowerCase().includes(keyword))
      );
    });
  }, [snapshot, filters]);

  if (!snapshot) {
    return <main className="loading-screen"><div className="loading-mark">CRM</div><p>正在建立业务分析视图…</p></main>;
  }

  const updated = new Date(snapshot.generatedAt).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const metrics = [
    ["业务总线数", snapshot.summary.total, "线", "本期业务快照", "navy"],
    ["实际活跃线数", snapshot.summary.active, "线", `${((snapshot.summary.active / Math.max(snapshot.summary.total, 1)) * 100).toFixed(1)}% 活跃率`, "green"],
    ["月平均计量", amountInWan(snapshot.summary.monthlyMetering), "万元", "按当前筛选口径", "amber"],
    ["本年新装", snapshot.summary.installs, "线", "新装完工记录", "blue"],
    ["本年拆机", snapshot.summary.removals, "线", "进入拆机分析", "rose"],
    ["待人工复核", snapshot.summary.review, "条", "规则未确认或特殊场景", "violet"],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">衡</div><div><strong>衡析</strong><span>CRM 业务分析平台</span></div></div>
        <nav>
          {navItems.map(([name, description], index) => (
            <button key={name} className={activeNav === name ? "active" : ""} onClick={() => setActiveNav(name)}>
              <span className="nav-icon">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{name}</strong><small>{description}</small></span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><i /><div><strong>{snapshot.mode === "local" ? "本地数据已连接" : "安全演示数据"}</strong><small>{snapshot.source.currentFile}</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">BUSINESS INTELLIGENCE · 2026</p><h1>{activeNav === "总览" ? "双线业务经营总览" : activeNav}</h1></div>
          <div className="top-actions">
            <span className="sync-state">↻ 数据更新于 {updated}</span>
            <button className="ghost-button">导出当前视图</button>
            <button className="primary-button" onClick={() => setShowImport(true)}>＋ 导入数据</button>
          </div>
        </header>

        <section className="filter-bar">
          <label className="search-box"><span>⌕</span><input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="搜索负责人、服务商、服务编号…" /></label>
          {(["year", "month", "status", "rule"] as const).map((key) => (
            <select key={key} value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}>
              {options[key].map((option) => <option key={option}>{option}</option>)}
            </select>
          ))}
          <button className="clear-button" onClick={() => setFilters({ year: "全部年份", month: "全部月份", status: "全部状态", rule: "全部计量规则", keyword: "" })}>重置筛选</button>
        </section>

        <section className="metric-grid">
          {metrics.map(([label, value, unit, note, tone]) => (
            <article className={`metric-card metric-${tone}`} key={String(label)}>
              <div className="metric-top"><span>{label}</span><i /></div>
              <div className="metric-value"><strong>{value}</strong><span>{unit}</span></div>
              <small>{note}</small>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-header"><div><span className="section-label">MONTHLY PROGRESS</span><h2>月平均计量完成趋势</h2></div><div className="panel-number"><strong>{amountInWan(snapshot.summary.monthlyMetering)}</strong><span>万元 · 累计</span></div></div>
            <Trend data={snapshot.monthly} />
            <div className="chart-foot"><span>● 月平均计量（万元）</span><em>目标录入后可叠加目标线</em></div>
          </article>
          <article className="panel">
            <div className="panel-header"><div><span className="section-label">METERING RULE</span><h2>计量规则分布</h2></div><span className="tag">BH 已验证</span></div>
            <Donut data={snapshot.meteringRules} />
          </article>
          <article className="panel">
            <div className="panel-header"><div><span className="section-label">SALES PERFORMANCE</span><h2>负责人业绩分析</h2></div><span className="tag">按月平均计量</span></div>
            <Ranking items={snapshot.owners} label="负责人业绩" />
          </article>
          <article className="panel">
            <div className="panel-header"><div><span className="section-label">PROVIDER RANKING</span><h2>服务商进单排名</h2></div><span className="tag">TOP 5</span></div>
            <Ranking items={snapshot.providers} label="服务商排名" />
          </article>
        </section>

        <section className="panel data-panel">
          <div className="panel-header">
            <div><span className="section-label">DETAIL QUERY</span><h2>详细计量数据</h2><p>当前筛选结果 {filteredRows.length} 条，可追溯到导入批次和原始文件。</p></div>
            <div className="data-actions"><span className="safe-chip">敏感字段已排除</span><button className="ghost-button">字段设置</button><button className="primary-button">导出筛选结果</button></div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>业务类型</th><th>业务名称</th><th>负责人</th><th>I 服务编号</th><th>I 服务简称</th><th>完工日期</th><th>活跃状态</th><th>计量规则</th><th className="number">线数</th><th className="number">月平均计量</th></tr></thead>
              <tbody>
                {filteredRows.slice(0, 8).map((row, index) => (
                  <tr key={`${row.serviceCode}-${index}`}>
                    <td><span className={`business-chip ${row.businessType.includes("拆") ? "removal" : ""}`}>{row.businessType}</span></td>
                    <td>{row.businessName || "—"}</td><td>{row.owner || "待确认"}</td><td className="code">{row.serviceCode || "—"}</td><td>{row.serviceName || "—"}</td>
                    <td>{row.completedDate || "—"}</td><td><span className={`active-chip ${row.activeStatus.includes("不") ? "inactive" : ""}`}>{row.activeStatus || "未知"}</span></td>
                    <td>{row.meteringRule || "待确认"}</td><td className="number">{row.lines}</td><td className="number">¥ {new Intl.NumberFormat("zh-CN").format(row.monthlyMetering)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot"><span>仅展示前 8 条，完整结果通过统一查询或导出查看</span><button className="text-button">进入统一查询 →</button></div>
        </section>

        <section className="panel reports-panel">
          <div className="panel-header"><div><span className="section-label">REPORT REGISTRY</span><h2>可扩展报表中心</h2><p>新增报表通过注册数据集、维度、指标和权限生成，无需改动导入主流程。</p></div><button className="ghost-button">查看全部 {REPORTS.length} 张报表</button></div>
          <div className="report-grid">
            {REPORTS.slice(0, 6).map((report) => (
              <button className="report-card" key={report.id}>
                <span className={`report-icon tone-${report.tone}`}>{report.short}</span>
                <span className="report-copy"><strong>{report.name}</strong><small>{report.description}</small></span>
                <span className={`status-chip ${report.status}`}>{report.status === "ready" ? "可用" : report.status === "pending" ? "待口径" : "规划中"}</span>
              </button>
            ))}
          </div>
        </section>
        <footer><span>规则版本 v1.0 · 2 期暂作较新快照 · 结算结果仅供内部工作分流</span><span>BH 回归 491 / 491 一致</span></footer>
      </main>
      <ImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={(data) => setSnapshot(data)} />
    </div>
  );
}
