import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPasswordHash, createSession, readSession, verifyPassword } from "../app/lib/server/auth.ts";
import { activateVersion, composeVersions, getCurrentData, listVersions, publishVersion } from "../app/lib/server/data-store.ts";
import { buildSnapshot, toBusinessRow } from "../app/lib/data-model.ts";
import { createChartTemplate, listChartTemplates, reorderChartTemplates, updateChartTemplate } from "../app/lib/server/dashboard-store.ts";
import { defaultChartDraft, templateDraft } from "../app/lib/chart-template.ts";

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
    const composed = await composeVersions({ sourceVersionIds: [first.id, second.id], label: "测试整合版本", actor: "finance-admin" });
    assert.equal(composed.version.kind, "composed");
    assert.deepEqual(composed.version.sourceVersionIds, [first.id, second.id]);
    assert.equal(composed.snapshot.rows.length, 2);
    assert.equal((await getCurrentData())?.version.id, composed.version.id);
    assert.equal((await listVersions()).versions.length, 3);
    await activateVersion(first.id, "finance-admin", "测试回滚");
    const current = await getCurrentData();
    assert.equal(current?.version.id, first.id);
    assert.equal(current?.snapshot.rows[0].deviceCode, "D-1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dashboard templates persist independently with revision conflict protection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crm-dashboard-test-"));
  process.env.CRM_DATA_DIR = directory;
  try {
    assert.equal((await listChartTemplates()).length, 5);
    const draft = defaultChartDraft(50);
    draft.title = "测试自定义图表";
    const created = await createChartTemplate(draft, "finance-admin");
    assert.equal(created.revision, 1);
    assert.equal((await listChartTemplates()).length, 6);
    const changed = templateDraft(created);
    changed.description = "修改后的口径说明";
    const updated = await updateChartTemplate(created.id, changed, created.revision, "finance-admin");
    assert.equal(updated.revision, 2);
    assert.equal(updated.description, "修改后的口径说明");
    await assert.rejects(() => updateChartTemplate(created.id, changed, 1, "finance-admin"), (error) => error instanceof Response && error.status === 409);
    const pinned = (await listChartTemplates()).filter((template) => template.pinned && !template.archived).reverse();
    const reordered = await reorderChartTemplates(pinned.map((template) => template.id), "finance-admin");
    assert.equal(reordered.filter((template) => template.pinned && !template.archived)[0].id, pinned[0].id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
