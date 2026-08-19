import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPasswordHash } from "../app/lib/server/auth.ts";
import { defaultChartDraft } from "../app/lib/chart-template.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`standalone 服务提前退出，退出码 ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The server may still be binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("standalone 服务未在预期时间内就绪");
}

test("standalone server exposes the health endpoint and CRM page", { timeout: 20_000 }, async () => {
  const port = await reservePort();
  const dataDirectory = await mkdtemp(join(tmpdir(), "crm-standalone-data-"));
  const password = "standalone integration password";
  const child = spawn(process.execPath, ["dist/standalone/server.js"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), CRM_DATA_DIR: dataDirectory, CRM_ADMIN_USERNAME: "admin", CRM_ADMIN_PASSWORD_HASH: createPasswordHash(password), CRM_SESSION_SECRET: "standalone-session-secret-that-is-at-least-32-bytes" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    const healthUrl = `http://127.0.0.1:${port}/crm/api/health`;
    const health = await waitForServer(healthUrl, child);
    assert.deepEqual(await health.json(), { status: "ok", service: "crm-analysis-platform" });
    assert.equal(health.headers.get("cache-control"), "no-store");

    const page = await fetch(`http://127.0.0.1:${port}/crm/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await page.text();
    assert.match(html, /CRM 业务分析与结算管理平台/);
    assert.match(html, /\/crm\/assets\//);
    assert.match(html, /\/crm\/og\.png/);

    const origin = `http://127.0.0.1:${port}`;
    const unauthorized = await fetch(`${origin}/crm/api/data/current`);
    assert.equal(unauthorized.status, 401);
    const login = await fetch(`${origin}/crm/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ username: "admin", password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const defaultTemplatesResponse = await fetch(`${origin}/crm/api/dashboard/templates`, { headers: { cookie } });
    const defaultTemplates = await defaultTemplatesResponse.json();
    assert.equal(defaultTemplatesResponse.status, 200);
    assert.equal(defaultTemplates.templates.length, 5);
    const chartDraft = defaultChartDraft(50);
    chartDraft.title = "集成测试图表";
    const chartCreateResponse = await fetch(`${origin}/crm/api/dashboard/templates`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ template: chartDraft }) });
    const chartCreate = await chartCreateResponse.json();
    assert.equal(chartCreateResponse.status, 201, JSON.stringify(chartCreate));
    assert.equal(chartCreate.template.revision, 1);
    chartDraft.description = "已修改";
    const chartUpdateResponse = await fetch(`${origin}/crm/api/dashboard/templates/${chartCreate.template.id}`, { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ template: chartDraft, revision: 1 }) });
    const chartUpdate = await chartUpdateResponse.json();
    assert.equal(chartUpdateResponse.status, 200, JSON.stringify(chartUpdate));
    assert.equal(chartUpdate.template.revision, 2);
    const chartConflict = await fetch(`${origin}/crm/api/dashboard/templates/${chartCreate.template.id}`, { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ template: chartDraft, revision: 1 }) });
    assert.equal(chartConflict.status, 409);

    async function upload(name, device) {
      const csv = `业务属性,业务名称,计量规则,月平均计量,设备编号,初始完工日期\n新装,测试业务,新增量,100,${device},2026-01-01\n`;
      const form = new FormData();
      form.append("files", new File([csv], name, { type: "text/csv" }));
      form.set("businessIds", JSON.stringify([`${name}::Sheet1`]));
      form.set("providerId", "");
      form.set("label", `测试版本 ${device}`);
      return fetch(`${origin}/crm/api/data/upload`, { method: "POST", headers: { cookie, origin }, body: form });
    }
    const firstUpload = await upload("v1.csv", "D-1");
    const firstUploadBody = await firstUpload.json();
    assert.equal(firstUpload.status, 201, JSON.stringify(firstUploadBody));
    const firstVersion = firstUploadBody.version.id;
    const secondUpload = await upload("v2.csv", "D-2");
    const secondUploadBody = await secondUpload.json();
    assert.equal(secondUpload.status, 201, JSON.stringify(secondUploadBody));
    const secondVersion = secondUploadBody.version.id;
    const versionsV2 = await fetch(`${origin}/crm/api/data/versions`, { headers: { cookie } });
    const historyV2 = await versionsV2.json();
    assert.equal(historyV2.activeId, secondVersion);
    assert.equal(historyV2.versions.length, 2);
    assert.deepEqual(new Set(historyV2.versions.map((version) => version.id)), new Set([firstVersion, secondVersion]));
    const currentV2 = await fetch(`${origin}/crm/api/data/current`, { headers: { cookie } });
    assert.equal((await currentV2.json()).snapshot.rows[0].deviceCode, "D-2");
    const compose = await fetch(`${origin}/crm/api/data/compose`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ sourceVersionIds: [firstVersion, secondVersion], label: "集成测试整合版" }) });
    const composeBody = await compose.json();
    assert.equal(compose.status, 201, JSON.stringify(composeBody));
    assert.equal(composeBody.version.kind, "composed");
    assert.equal(composeBody.snapshot.rows.length, 2);
    assert.deepEqual(composeBody.version.sourceVersionIds, [firstVersion, secondVersion]);
    const activate = await fetch(`${origin}/crm/api/data/versions/${firstVersion}/activate`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ reason: "集成测试回滚" }) });
    assert.equal(activate.status, 200, await activate.text());
    const currentV1 = await fetch(`${origin}/crm/api/data/current`, { headers: { cookie } });
    assert.equal((await currentV1.json()).snapshot.rows[0].deviceCode, "D-1");
    const historyV1 = await (await fetch(`${origin}/crm/api/data/versions`, { headers: { cookie } })).json();
    assert.equal(historyV1.activeId, firstVersion);
    assert.equal(historyV1.versions.length, 3);

    const rootPage = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootPage.status, 404);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}\n服务输出：\n${output}`);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
