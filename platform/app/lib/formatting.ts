import type { NumericValue } from "./data-model.ts";

export function yuanToWan(value: NumericValue): NumericValue {
  return value;
}

export function formatWan(value: NumericValue) {
  return value === null ? "--" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatChartNumber(value: unknown, unit: string) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const digits = unit === "%" ? 1 : 2;
  const formatted = number.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}
