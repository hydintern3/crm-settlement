import type { NumericValue } from "./data-model.ts";

export function yuanToWan(value: NumericValue): NumericValue {
  return value === null ? null : value / 10_000;
}

export function formatWan(value: NumericValue) {
  return value === null ? "--" : new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value / 10_000);
}

export function formatChartNumber(value: unknown, unit: string) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const digits = unit === "万元" ? 6 : unit === "%" ? 1 : 2;
  const formatted = number.toLocaleString("zh-CN", { minimumFractionDigits: unit === "万元" ? 6 : 0, maximumFractionDigits: digits });
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}
