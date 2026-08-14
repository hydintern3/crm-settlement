import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDirectory = resolve("dist/client/assets");
const assets = await readdir(assetsDirectory);
const pageChunks = assets.filter((name) => /^page-.*\.js$/.test(name));

if (!pageChunks.length) {
  throw new Error("未找到生产构建的 page JavaScript 包，无法执行首屏包体检查。");
}

const chunks = await Promise.all(pageChunks.map(async (name) => ({ name, bytes: (await stat(resolve(assetsDirectory, name))).size })));
const largest = chunks.sort((left, right) => right.bytes - left.bytes)[0];
const limitBytes = 350 * 1024;

if (largest.bytes > limitBytes) {
  throw new Error(`首屏包体 ${largest.name} 为 ${(largest.bytes / 1024).toFixed(1)} KB，超过 350 KB 预算。`);
}

const lazyBudgets = [
  { pattern: /^AnalyticsCharts-.*\.js$/, label: "图表按需包", limitBytes: 600 * 1024 },
  { pattern: /^ImportDialog-.*\.js$/, label: "导入按需包", limitBytes: 450 * 1024 },
];

for (const budget of lazyBudgets) {
  const name = assets.find((asset) => budget.pattern.test(asset));
  if (!name) throw new Error(`未找到${budget.label}，无法执行包体检查。`);
  const bytes = (await stat(resolve(assetsDirectory, name))).size;
  if (bytes > budget.limitBytes) {
    throw new Error(`${budget.label} ${name} 为 ${(bytes / 1024).toFixed(1)} KB，超过 ${(budget.limitBytes / 1024).toFixed(0)} KB 预算。`);
  }
  console.log(`${budget.label}检查通过：${name} ${(bytes / 1024).toFixed(1)} KB / ${(budget.limitBytes / 1024).toFixed(0)} KB。`);
}

console.log(`首屏包体检查通过：${largest.name} ${(largest.bytes / 1024).toFixed(1)} KB / 350 KB。`);
