"use client";

import { useMemo, useState } from "react";
import { buildChartData } from "../lib/chart-aggregation";
import { AGGREGATION_LABELS, CHART_FIELDS, CHART_MEASURE_FIELDS, CHART_TYPE_LABELS, chartField, defaultChartDraft, measureDefinition, validateChartDraft, type Aggregation, type ChartMeasure, type ChartTemplate, type ChartTemplateDraft, type ChartType, type DimensionField, type MeasureField } from "../lib/chart-template";
import type { BusinessRow } from "../lib/data-model";
import { ConfigurableChart } from "./AnalyticsCharts";

function normalizeForType(draft: ChartTemplateDraft, chartType: ChartType): ChartTemplateDraft {
  const next = { ...draft, chartType, measures: [...draft.measures], options: { ...draft.options } };
  if (chartType === "pie" || chartType === "donut") {
    next.seriesField = undefined;
    next.measures = next.measures.slice(0, 1);
  } else if (chartType === "scatter") {
    next.seriesField = undefined;
    next.measures = [next.measures[0] ?? { field: "monthlyMetering", aggregation: "sum" }, next.measures[1] ?? { field: "lines", aggregation: "sum" }];
  } else if (chartType === "combo") {
    next.seriesField = undefined;
    next.measures = [next.measures[0] ?? { field: "monthlyMetering", aggregation: "sum" }, next.measures[1] ?? { field: "lines", aggregation: "sum" }];
  }
  return next;
}

function FieldSelect({ value, onChange, exclude }: { value: DimensionField; onChange: (value: DimensionField) => void; exclude?: DimensionField }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as DimensionField)}>{CHART_FIELDS.filter((field) => field.field !== exclude).map((field) => <option key={field.field} value={field.field}>{field.label}</option>)}</select>;
}

export function ChartBuilder({ rows, template, saving, onClose, onSave }: { rows: BusinessRow[]; template?: ChartTemplate | null; saving: boolean; onClose: () => void; onSave: (draft: ChartTemplateDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<ChartTemplateDraft>(() => template ? { title: template.title, description: template.description, chartType: template.chartType, dimension: { ...template.dimension }, seriesField: template.seriesField, measures: template.measures.map((measure) => ({ ...measure })), options: { ...template.options }, pinned: template.pinned, archived: false, order: template.order } : defaultChartDraft());
  const issues = validateChartDraft(draft);
  const data = useMemo(() => issues.length ? null : buildChartData(rows, draft), [draft, issues.length, rows]);

  function setMeasure(index: number, patch: Partial<ChartMeasure>) {
    setDraft((current) => ({ ...current, measures: current.measures.map((measure, measureIndex) => measureIndex === index ? { ...measure, ...patch } : measure) }));
  }
  function changeMeasureField(index: number, field: MeasureField) {
    const aggregation = measureDefinition(field).aggregations[0];
    setMeasure(index, { field, aggregation, label: undefined });
  }
  function removeMeasure(index: number) {
    setDraft((current) => ({ ...current, measures: current.measures.filter((_, measureIndex) => measureIndex !== index) }));
  }
  function addMeasure() {
    setDraft((current) => ({ ...current, measures: [...current.measures, { field: "lines", aggregation: "sum" }] }));
  }

  const canAddMeasure = draft.measures.length < (draft.chartType === "combo" ? 2 : 3) && !draft.seriesField && !["pie", "donut", "scatter"].includes(draft.chartType);
  return <div className="chart-builder-overlay" role="dialog" aria-modal="true" aria-label={template ? "编辑图表" : "新建图表"}>
    <section className="chart-builder">
      <header><div><span className="section-label">CHART DESIGNER</span><h2>{template ? "编辑图表模板" : "新建图表模板"}</h2><p>预览和固定图表均使用当前全局筛选后的 {rows.length.toLocaleString("zh-CN")} 条记录。</p></div><button className="clear-button" onClick={onClose}>关闭</button></header>
      <div className="chart-builder-body">
        <div className="chart-config">
          <fieldset><legend>基本信息</legend><label><span>图表标题</span><input maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>口径说明</span><textarea maxLength={240} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></fieldset>
          <fieldset><legend>图表类型</legend><div className="chart-type-grid">{(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((type) => <button type="button" key={type} className={draft.chartType === type ? "active" : ""} onClick={() => setDraft((current) => normalizeForType(current, type))}>{CHART_TYPE_LABELS[type]}</button>)}</div></fieldset>
          <fieldset><legend>维度与系列</legend><div className="config-row"><label><span>主维度</span><FieldSelect value={draft.dimension.field} exclude={draft.seriesField} onChange={(field) => setDraft({ ...draft, dimension: { field, timeGranularity: chartField(field).type === "date" ? "month" : undefined } })} /></label>{chartField(draft.dimension.field).type === "date" && <label><span>日期粒度</span><select value={draft.dimension.timeGranularity ?? "month"} onChange={(event) => setDraft({ ...draft, dimension: { ...draft.dimension, timeGranularity: event.target.value as ChartTemplateDraft["dimension"]["timeGranularity"] } })}><option value="year">年</option><option value="quarter">季度</option><option value="month">月</option><option value="day">日</option></select></label>}</div>{!["pie", "donut", "scatter", "combo"].includes(draft.chartType) && <label><span>系列拆分（可选）</span><select value={draft.seriesField ?? ""} onChange={(event) => setDraft({ ...draft, seriesField: event.target.value ? event.target.value as DimensionField : undefined, measures: event.target.value ? draft.measures.slice(0, 1) : draft.measures })}><option value="">不拆分</option>{CHART_FIELDS.filter((field) => field.field !== draft.dimension.field && field.type === "category").map((field) => <option key={field.field} value={field.field}>{field.label}</option>)}</select></label>}</fieldset>
          <fieldset><legend>指标与聚合</legend>{draft.measures.map((measure, index) => <div className="measure-row" key={`${index}-${measure.field}`}><label><span>{draft.chartType === "scatter" ? index === 0 ? "X 轴指标" : "Y 轴指标" : `指标 ${index + 1}`}</span><select value={measure.field} onChange={(event) => changeMeasureField(index, event.target.value as MeasureField)}>{CHART_MEASURE_FIELDS.map((field) => <option key={field.field} value={field.field}>{field.label}</option>)}</select></label><label><span>聚合方式</span><select value={measure.aggregation} onChange={(event) => setMeasure(index, { aggregation: event.target.value as Aggregation })}>{measureDefinition(measure.field).aggregations.map((aggregation) => <option key={aggregation} value={aggregation}>{AGGREGATION_LABELS[aggregation]}</option>)}</select></label>{draft.measures.length > 1 && draft.chartType !== "scatter" && <button type="button" className="clear-button" onClick={() => removeMeasure(index)}>移除</button>}</div>)}{canAddMeasure && <button type="button" className="ghost-button" onClick={addMeasure}>＋ 添加指标</button>}</fieldset>
          <fieldset><legend>数据与展示</legend><div className="config-grid"><label><span>初始可视类别</span><input type="number" min={3} max={50} value={draft.options.topN} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, topN: Number(event.target.value) } })} /></label><label><span>排序</span><select value={draft.options.sort} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, sort: event.target.value as ChartTemplateDraft["options"]["sort"] } })}><option value="valueDesc">指标降序</option><option value="valueAsc">指标升序</option><option value="dimensionAsc">维度升序</option><option value="dimensionDesc">维度降序</option></select></label><label><span>卡片宽度</span><select value={draft.options.size} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, size: event.target.value as ChartTemplateDraft["options"]["size"] } })}><option value="half">半宽</option><option value="wide">通栏</option></select></label><label><span>图表高度</span><input type="number" min={240} max={520} step={20} value={draft.options.height} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, height: Number(event.target.value) } })} /></label></div><div className="config-checks"><label><input type="checkbox" checked={draft.options.includeEmpty} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, includeEmpty: event.target.checked } })} />包含空值</label><label><input type="checkbox" checked={draft.options.showLabels} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, showLabels: event.target.checked } })} />显示数值标签</label><label><input type="checkbox" checked={draft.options.showLegend} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, showLegend: event.target.checked } })} />显示图例</label><label><input type="checkbox" checked={draft.options.smooth} onChange={(event) => setDraft({ ...draft, options: { ...draft.options, smooth: event.target.checked } })} />平滑曲线</label><label><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} />固定到总览</label></div></fieldset>
        </div>
        <aside className="chart-preview"><div className="preview-heading"><div><span className="section-label">LIVE PREVIEW</span><h3>{draft.title || "未命名图表"}</h3></div>{data && <small>{data.recordCount.toLocaleString("zh-CN")} 条记录 · {data.groupCount} 个分组</small>}</div>{issues.length ? <div className="chart-config-error">{issues.map((issue) => <span key={issue}>{issue}</span>)}</div> : data ? <><ConfigurableChart data={data} template={draft} />{data.warnings.map((warning) => <p className="preview-warning" key={warning}>{warning}</p>)}</> : null}</aside>
      </div>
      <footer><span>{issues.length ? "请先修正配置问题" : "模板只保存配置，统计结果随数据和筛选实时变化。"}</span><div><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving || issues.length > 0 || !draft.title.trim()} onClick={() => void onSave(draft)}>{saving ? "保存中…" : template ? "保存修改" : "创建模板"}</button></div></footer>
    </section>
  </div>;
}
