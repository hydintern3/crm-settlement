import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://crm.example.internal/", {
      headers: { accept: "text/html", host: "crm.example.internal" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the CRM platform shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /衡析｜CRM 业务分析与结算管理平台/);
  assert.match(html, /正在建立业务分析视图/);
  assert.match(html, /https:\/\/crm\.example\.internal\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("keeps local data private and does not fall back to mock records", async () => {
  const [gitignore, registry, syncScript, sourceConfig, pageSource, importSource] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL("app/lib/report-registry.ts", root), "utf8"),
    readFile(new URL("scripts/sync-local-folder.mjs", root), "utf8"),
    readFile(new URL("config/local-source.json", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/ImportDialog.tsx", root), "utf8"),
  ]);

  assert.match(gitignore, /public\/data\/local-snapshot\.json/);
  assert.match(registry, /REPORTS/);
  assert.match(syncScript, /providersByCode/);
  assert.match(sourceConfig, /\.\.\/csv_output/);
  assert.match(sourceConfig, /\.xlsx/);
  assert.doesNotMatch(pageSource, /demo-snapshot/);
  assert.match(pageSource, /EMPTY_SNAPSHOT/);
  assert.match(importSource, /\.xlsb/);
  await assert.rejects(access(new URL("public/data/demo-snapshot.json", root)));
});
