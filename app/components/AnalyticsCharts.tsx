"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts/core";
import { BarChart, PieChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { RankedItem, Snapshot } from "../lib/data-model";

echarts.use([BarChart, PieChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

function Chart({ option, onSelect, height = 260 }: { option: EChartsOption; onSelect?: (name: string) => void; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
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
    grid: { left: 48, right: 18, top: 34, bottom: 42 },
    tooltip: { trigger: "axis", valueFormatter: (value) => value === null ? "--" : `¥ ${Number(value).toLocaleString("zh-CN")}` },
    xAxis: { type: "category", data: data.map((item) => `${item.month}月`), axisLine: { lineStyle: { color: "#dfe5ed" } }, axisTick: { show: false } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: { formatter: (value: number) => `${Math.round(value / 10000)}万` } },
    dataZoom: data.length > 8 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 2 }] : undefined,
    series: [{ name: "月平均计量", type: "bar", barMaxWidth: 24, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: data.map((item) => item.amount) }],
  };
  return <Chart option={option} />;
}

export function RuleChart({ data, onSelect }: { data: Snapshot["meteringRules"]; onSelect?: (name: string) => void }) {
  if (!data.length) return <EmptyChart />;
  const option: EChartsOption = {
    animationDuration: 500,
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 条 · {d}%" },
    legend: { orient: "vertical", right: 4, top: "middle", icon: "circle" },
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
    grid: { left: 82, right: 28, top: 15, bottom: 25 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => `¥ ${Number(value).toLocaleString("zh-CN")}` },
    xAxis: { type: "value", splitLine: { lineStyle: { color: "#edf1f5" } }, axisLabel: { formatter: (value: number) => `${Math.round(value / 10000)}万` } },
    yAxis: { type: "category", data: data.map((item) => item.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 68, overflow: "truncate" } },
    series: [{ type: "bar", barWidth: 12, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: data.map((item) => item.amount) }],
  };
  return <Chart option={option} onSelect={onSelect} height={300} />;
}
