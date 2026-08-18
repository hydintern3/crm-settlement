import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPasswordHash, createSession, readSession, verifyPassword } from "../app/lib/server/auth.ts";
import { activateVersion, getCurrentData, listVersions, publishVersion } from "../app/lib/server/data-store.ts";
import { buildSnapshot, toBusinessRow } from "../app/lib/data-model.ts";

test("password hashes and signed sessions reject wrong or tampered values", () => {
  process.env.CRM_ADMIN_USERNAME = "finance-admin";
  process.env.CRM_SESSION_SECRET = "test-session-secret-that-is-longer-than-32-bytes";
  const hash = createPasswordHash("correct horse battery staple");
  process.env.CRM_ADMIN_PASSWORD_HASH = hash;
  assert.equal(verifyPassword("correct horse battery staple"), true);
  assert.equal(verifyPassword("incorrect password"), false);
  const token = createSession("finance-admin");
  assert.equal(readSession(new Request("http://localhost/crm", { headers: { cookie: `crm_admin_session=${token}` } }))?.u, "finance-admin");
  assert.equal(readSession(new Request("http://localhost/crm", { headers: { cookie: `crm_admin_session=${token}x` } })), null);
});

test("immutable versions publish, switch and persist through the active pointer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crm-version-test-"));
  process.env.CRM_DATA_DIR = directory;
  try {
    const makeSnapshot = (deviceCode) => buildSnapshot([
      toBusinessRow({ 业务属性: "新装", 业务名称: "测试业务", 设备编号: deviceCode, 计量规则: "新增量", 初始完工日期: "2026-01-01", 月平均计量: "100" }),
    ], { label: "测试", files: [`${deviceCode}.csv`], currentFile: `${deviceCode}.csv` });
    const first = await publishVersion({ files: [new File(["test-v1"], "v1.csv")], snapshot: makeSnapshot("D-1"), businessIds: ["v1.csv::Sheet1"], actor: "finance-admin" });
    const second = await publishVersion({ files: [new File(["test-v2"], "v2.csv")], snapshot: makeSnapshot("D-2"), businessIds: ["v2.csv::Sheet1"], actor: "finance-admin" });
    assert.equal((await getCurrentData())?.version.id, second.id);
    assert.equal((await listVersions()).versions.length, 2);
    await activateVersion(first.id, "finance-admin", "测试回滚");
    const current = await getCurrentData();
    assert.equal(current?.version.id, first.id);
    assert.equal(current?.snapshot.rows[0].deviceCode, "D-1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
