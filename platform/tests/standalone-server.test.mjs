import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  const child = spawn(process.execPath, ["dist/standalone/server.js"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    const healthUrl = `http://127.0.0.1:${port}/api/health`;
    const health = await waitForServer(healthUrl, child);
    assert.deepEqual(await health.json(), { status: "ok", service: "crm-analysis-platform" });
    assert.equal(health.headers.get("cache-control"), "no-store");

    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(await page.text(), /CRM 业务分析与结算管理平台/);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}\n服务输出：\n${output}`);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
  }
});
