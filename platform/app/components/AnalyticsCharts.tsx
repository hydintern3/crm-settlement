"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { RankedItem, Snapshot } from "../lib/data-model";

echarts.use([BarChart, PieChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const CHART_FONT = '"Microsoft YaHei", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
const axisText = { color: "#526176", fontFamily: CHART_FONT, fontSize: 12 };

function Chart({ option, onSelect, height = 260 }: { option: EChartsOption; onSelect?: (name: string) => void; height?: number }) {
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

export function MonthlyChart({ data }: { data: Snapshot["monthly"] }) {
  if (!data.length || data.every((item) => item.amount === null)) return <EmptyChart />;
  const option: EChartsOption = {
    animationDuration: 500,
    color: ["#2764e7", "#cb5a69"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    grid: { left: 48, right: 18, top: 34, bottom: 42 },
    tooltip: { trigger: "axis", textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, valueFormatter: (value) => value === null ? "--" : `¥ ${Number(value).toLocaleString("zh-CN")}` },
    xAxis: { type: "category", data: data.map((item) => item.month.includes("-") ? item.month : `${item.month}月`), axisLine: { lineStyle: { color: "#dfe5ed" } }, axisTick: { show: false }, axisLabel: { ...axisText, rotate: data.length > 8 ? 30 : 0 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: { ...axisText, formatter: (value: number) => `${Math.round(value / 10000)}万` } },
    dataZoom: data.length > 8 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 2 }] : undefined,
    series: [{ name: "月平均计量", type: "bar", barMaxWidth: 24, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: data.map((item) => item.amount) }],
  };
  return <Chart option={option} />;
}

export function RuleChart({ data, onSelect }: { data: Snapshot["meteringRules"]; onSelect?: (name: string) => void }) {
  if (!data.length) return <EmptyChart />;
  const option: EChartsOption = {
    animationDuration: 500,
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 条 · {d}%", textStyle: { fontFamily: CHART_FONT, fontSize: 12 } },
    legend: { orient: "vertical", right: 4, top: "middle", icon: "circle", textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" }, itemGap: 12 },
    series: [{ type: "pie", radius: [55, 88], center: ["36%", "52%"], label: { show: false }, itemStyle: { borderColor: "#fff", borderWidth: 3 }, data: data.map((item) => ({ name: item.label, value: item.value, itemStyle: { color: item.color } })) }],
  };
  return <Chart option={option} onSelect={onSelect} />;
}

export function RankingChart({ items, onSelect }: { items: RankedItem[]; onSelect?: (name: string) => void }) {
  const data = items.filter((item) => item.amount !== null).slice(0, 10).reverse();
  if (!data.length) return <EmptyChart />;
  const option: EChartsOption = {
    animationDuration: 500,
    color: ["#183b68"],
    textStyle: { fontFamily: CHART_FONT, fontSize: 12, color: "#526176" },
    grid: { left: 82, right: 28, top: 15, bottom: 25 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, textStyle: { fontFamily: CHART_FONT, fontSize: 12 }, valueFormatter: (value) => `¥ ${Number(value).toLocaleString("zh-CN")}` },
    xAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: { ...axisText, formatter: (value: number) => `${Math.round(value / 10000)}万` } },
    yAxis: { type: "category", data: data.map((item) => item.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisText, width: 76, overflow: "truncate" } },
    series: [{ type: "bar", barWidth: 12, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: data.map((item) => item.amount) }],
  };
  return <Chart option={option} onSelect={onSelect} height={300} />;
}
