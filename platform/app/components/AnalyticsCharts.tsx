"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { RankedItem, Snapshot } from "../lib/data-model";
import type { AggregatedChartData } from "../lib/chart-aggregation";
import type { ChartTemplateDraft } from "../lib/chart-template";
import { formatChartNumber } from "../lib/formatting";

echarts.use([BarChart, LineChart, PieChart, ScatterChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const CHART_FONT = '"Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
const axisText = { color: "#526176", fontFamily: CHART_FONT, fontSize: 12 };

function Chart({ option, onSelect, height = 260 }: { option: EChartsCoreOption; onSelect?: (name: string) => void; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.setOption(option);
    if (onSelect) chart.on("click", (event) => onSelect(String(event.name ?? "")));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, onSelect]);
  return <div className="echart" style={{ height }} ref={ref} />;
}

function EmptyChart() {
  return <div className="chart-empty"><strong>--</strong><span>暂无可绘制数据</span></div>;
}

function formatValue(value: unknown, unit: string) {
  return formatChartNumber(value, unit);
}

function formatDataValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) : "--";
}

export function ConfigurableChart({ data, template, onSelect }: { data: AggregatedChartData; template: ChartTemplateDraft; onSelect?: (name: string) => void }) {
  if (!data.categories.length || !data.series.length || data.series.every((series) => series.values.every((value) => value === null))) return <EmptyChart />;
  const base: EChartsCoreOption = {
    animationDuration: 450,
    color: ["#2764e7", "#2a91a8", "#cb5a69", "#e3a33c", "#7657d5", "#4b7b55", "#8b6a4f"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    tooltip: { trigger: template.chartType === "pie" || template.chartType === "donut" ? "item" : "axis", textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, valueFormatter: (value: unknown) => formatValue(value, data.unit) },
    legend: template.options.showLegend ? { type: "scroll", top: 2, textStyle: axisText } : undefined,
  };
  let option: EChartsCoreOption;
  if (template.chartType === "pie" || template.chartType === "donut") {
    const crowded = data.categories.length > template.options.topN;
    option = {
      ...base,
      tooltip: { trigger: "item", formatter: (params: unknown) => {
        const item = params as { name?: string; value?: unknown; percent?: number };
        return `${item.name ?? "--"}<br/>${formatValue(item.value, data.unit)} · ${item.percent ?? 0}%`;
      } },
      legend: template.options.showLegend ? { type: "scroll", orient: "vertical", right: 4, top: "middle", textStyle: axisText } : undefined,
      series: [{ type: "pie", radius: template.chartType === "donut" ? ["42%", "68%"] : [0, "70%"], center: [template.options.showLegend ? "40%" : "50%", "54%"], avoidLabelOverlap: true, label: { show: template.options.showLabels && !crowded, formatter: (params: unknown) => { const item = params as { name?: string; value?: unknown; percent?: number }; return `${item.name ?? "--"}\n${formatDataValue(item.value)} · ${item.percent ?? 0}%`; } }, itemStyle: { borderColor: "#fff", borderWidth: 2 }, data: data.categories.map((name, index) => ({ name, value: data.series[0].values[index] })) }],
    };
  } else if (template.chartType === "scatter") {
    const x = data.series[0];
    const y = data.series[1];
    option = {
      ...base,
      grid: { left: 62, right: 28, top: 42, bottom: 48 },
      xAxis: { type: "value", name: x.name, nameLocation: "middle", nameGap: 32, splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText },
      yAxis: { type: "value", name: y.name, nameLocation: "middle", nameGap: 48, splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText },
      series: [{ name: `${x.name} / ${y.name}`, type: "scatter", symbolSize: 12, label: { show: template.options.showLabels, position: "top", formatter: (params: unknown) => { const item = params as { name?: string; value?: unknown[] }; return `${item.name ?? ""}: ${formatDataValue(item.value?.[0])} / ${formatDataValue(item.value?.[1])}`; } }, data: data.categories.map((name, index) => ({ name, value: [x.values[index], y.values[index]] })) }],
    };
  } else {
    const horizontal = template.options.orientation === "horizontal" && (template.chartType === "bar" || template.chartType === "stackedBar");
    const categoryAxis = { type: "category" as const, data: data.categories, axisTick: { show: false }, axisLine: { lineStyle: { color: "#dfe5ed" } }, axisLabel: { ...axisText, rotate: horizontal ? 0 : data.categories.length > 10 ? 30 : 0, width: horizontal ? 90 : undefined, overflow: "truncate" as const } };
    const valueAxis = { type: "value" as const, splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText };
    const isLine = template.chartType === "line" || template.chartType === "area";
    const hasOverflow = data.categories.length > template.options.topN;
    const zoom = hasOverflow
      ? horizontal
        ? [{ type: "inside", yAxisIndex: 0 }, { type: "slider", yAxisIndex: 0, orient: "vertical", width: 14, right: 2, top: template.options.showLegend ? 48 : 24, bottom: 34, startValue: 0, endValue: template.options.topN - 1 }]
        : [{ type: "inside", xAxisIndex: 0 }, { type: "slider", xAxisIndex: 0, height: 14, bottom: 2, startValue: 0, endValue: template.options.topN - 1 }]
      : undefined;
    option = {
      ...base,
      grid: { left: horizontal ? 105 : 58, right: horizontal && hasOverflow ? 38 : 26, top: template.options.showLegend ? 48 : 24, bottom: hasOverflow || (data.categories.length > 10 && !horizontal) ? 66 : 42 },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      dataZoom: zoom,
      series: data.series.map((series) => isLine ? ({ name: series.name, type: "line", smooth: template.options.smooth, connectNulls: false, areaStyle: template.chartType === "area" ? { opacity: .14 } : undefined, label: { show: template.options.showLabels, formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, labelLayout: { hideOverlap: false }, data: series.values }) : ({ name: series.name, type: "bar", stack: template.chartType === "stackedBar" ? "total" : undefined, barMaxWidth: 30, label: { show: template.options.showLabels, position: horizontal ? "right" : "top", formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, labelLayout: { hideOverlap: false }, itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }, data: series.values })),
    };
  }
  return <Chart option={option} onSelect={onSelect} height={template.options.height} />;
}

export function MonthlyChart({ data }: { data: Snapshot["monthly"] }) {
  if (!data.length || data.every((item) => item.amount === null)) return <EmptyChart />;
  const option: EChartsCoreOption = {
    animationDuration: 500,
    color: ["#2764e7", "#cb5a69"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    grid: { left: 48, right: 18, top: 34, bottom: 42 },
    tooltip: { trigger: "axis", textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, formatter: (params: unknown) => (Array.isArray(params) ? params.map((item) => { const point = item as { seriesName?: string; value?: unknown; axisValue?: string }; const unit = point.seriesName === "线路数" ? "线" : "元"; return `${point.seriesName ?? "--"}: ${formatValue(point.value, unit)}`; }).join("<br/>") : "--") },
    xAxis: { type: "category", data: data.map((item) => item.month.includes("-") ? item.month : `${item.month}月`), axisLine: { lineStyle: { color: "#dfe5ed" } }, axisTick: { show: false }, axisLabel: { ...axisText, rotate: data.length > 8 ? 30 : 0 } },
    yAxis: [{ type: "value", name: "元", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText }, { type: "value", name: "线路数", splitLine: { show: false }, axisLabel: axisText }],
    dataZoom: data.length > 8 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 2 }] : undefined,
    series: [{ name: "月平均计量", type: "line", yAxisIndex: 0, smooth: true, symbolSize: 7, label: { show: true, formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, data: data.map((item) => item.amount) }, { name: "月平均资费", type: "line", yAxisIndex: 0, smooth: true, symbolSize: 7, label: { show: true, formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, data: data.map((item) => item.tariff) }, { name: "线路数", type: "bar", yAxisIndex: 1, barMaxWidth: 18, label: { show: true, position: "top", formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, labelLayout: { hideOverlap: false }, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: data.map((item) => item.lines) }],
  };
  return <Chart option={option} />;
}

export function RuleChart({ data, onSelect }: { data: Snapshot["meteringRules"]; onSelect?: (name: string) => void }) {
  if (!data.length) return <EmptyChart />;
  const option: EChartsCoreOption = {
    animationDuration: 500,
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 条 · {d}%", textStyle: { fontFamily: CHART_FONT, fontSize: 12 } },
    legend: { orient: "vertical", right: 4, top: "middle", icon: "circle", textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" }, itemGap: 12 },
    series: [{ type: "pie", radius: [55, 88], center: ["36%", "52%"], avoidLabelOverlap: true, label: { show: true, formatter: "{b}\n{c} 条 · {d}%" }, itemStyle: { borderColor: "#fff", borderWidth: 3 }, data: data.map((item) => ({ name: item.label, value: item.value, itemStyle: { color: item.color } })) }],
  };
  return <Chart option={option} onSelect={onSelect} />;
}

export function RankingChart({ items, onSelect }: { items: RankedItem[]; onSelect?: (name: string) => void }) {
  const data = items.filter((item) => item.amount !== null).slice(0, 10).reverse();
  if (!data.length) return <EmptyChart />;
  const option: EChartsCoreOption = {
    animationDuration: 500,
    color: ["#183b68"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    grid: { left: 82, right: 28, top: 15, bottom: 25 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, valueFormatter: (value: unknown) => formatValue(value, "元") },
    xAxis: { type: "value", name: "元", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText },
    yAxis: { type: "category", data: data.map((item) => item.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisText, width: 76, overflow: "truncate" } },
    series: [{ type: "bar", barWidth: 12, label: { show: true, position: "right", formatter: (params: unknown) => formatValue((params as { value?: unknown }).value, "元") }, labelLayout: { hideOverlap: false }, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: data.map((item) => item.amount) }],
  };
  return <Chart option={option} onSelect={onSelect} height={300} />;
}

export function DistributionChart({ items, onSelect }: { items: RankedItem[]; onSelect?: (name: string) => void }) {
  const data = items.filter((item) => item.amount !== null || item.lines > 0).slice(0, 12);
  if (!data.length) return <EmptyChart />;
  const option: EChartsCoreOption = {
    animationDuration: 500,
    color: ["#2764e7", "#cb5a69"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    grid: { left: 52, right: 58, top: 40, bottom: data.length > 8 ? 66 : 42 },
    legend: { top: 0, textStyle: axisText },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, formatter: (params: unknown) => {
      if (!Array.isArray(params)) return "--";
      const first = params[0] as { axisValue?: string };
      return [`${first.axisValue ?? "--"}`, ...params.map((item) => { const point = item as { seriesName?: string; value?: unknown }; return `${point.seriesName ?? "--"}: ${formatValue(point.value, point.seriesName === "线路数" ? "线" : "元")}`; })].join("<br/>");
    } },
    xAxis: { type: "category", data: data.map((item) => item.label), axisTick: { show: false }, axisLine: { lineStyle: { color: "#dfe5ed" } }, axisLabel: { ...axisText, rotate: data.length > 8 ? 30 : 0, width: 90, overflow: "truncate" } },
    yAxis: [{ type: "value", name: "线路数", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: axisText }, { type: "value", name: "元", splitLine: { show: false }, axisLabel: axisText }],
    dataZoom: data.length > 10 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 2 }] : undefined,
    series: [
      { name: "线路数", type: "bar", yAxisIndex: 0, barMaxWidth: 26, label: { show: true, position: "top", formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, data: data.map((item) => item.lines), itemStyle: { borderRadius: [4, 4, 0, 0] } },
      { name: "月平均计量", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 7, label: { show: true, formatter: (params: unknown) => formatDataValue((params as { value?: unknown }).value) }, data: data.map((item) => item.amount) },
    ],
  };
  return <Chart option={option} onSelect={onSelect} height={340} />;
}
