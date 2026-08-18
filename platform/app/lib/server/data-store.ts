import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Snapshot } from "../data-model";
import type { CurrentDataResponse, DataVersionManifest } from "../data-version";

const VERSION_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
let mutationQueue: Promise<unknown> = Promise.resolve();

function storeRoot() {
  return resolve(process.env.CRM_DATA_DIR || resolve(process.cwd(), "work/server-data"));
}

function paths() {
  const root = storeRoot();
  return { root, versions: resolve(root, "versions"), staging: resolve(root, "staging"), active: resolve(root, "active.json"), audit: resolve(root, "audit.jsonl") };
}

async function ensureStore() {
  const target = paths();
  await Promise.all([mkdir(target.versions, { recursive: true, mode: 0o700 }), mkdir(target.staging, { recursive: true, mode: 0o700 })]);
  return target;
}

function serialize<T>(operation: () => Promise<T>) {
  const task = mutationQueue.then(operation, operation);
  mutationQueue = task.then(() => undefined, () => undefined);
  return task;
}

function sha256(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}

function safeFileName(name: string, index: number) {
  const clean = basename(name).normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || `upload-${index}`;
  return `${String(index + 1).padStart(2, "0")}-${clean}`;
}

function versionId(date = new Date()) {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-${randomBytes(6).toString("hex")}`;
}

function versionDirectory(id: string) {
  if (!VERSION_PATTERN.test(id)) throw new Error("无效的数据版本编号");
  return resolve(paths().versions, id);
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function activateUnlocked(id: string, actor: string, reason: string) {
  const target = paths();
  const manifest = await readJson<DataVersionManifest>(resolve(versionDirectory(id), "manifest.json"));
  const snapshotBytes = await readFile(resolve(versionDirectory(id), "snapshot.json"));
  if (sha256(snapshotBytes) !== manifest.snapshotSha256) throw new Error("目标版本快照校验失败，未执行切换");
  let previous: string | null = null;
  try { previous = (await readJson<{ id: string }>(target.active)).id; } catch { previous = null; }
  await writeJsonAtomic(target.active, { id, activatedAt: new Date().toISOString(), activatedBy: actor });
  await appendFile(target.audit, `${JSON.stringify({ action: "activate", at: new Date().toISOString(), actor, previous, next: id, reason })}\n`, { encoding: "utf8", mode: 0o600 });
  return manifest;
}

export async function publishVersion(input: {
  files: File[];
  snapshot: Snapshot;
  businessIds: string[];
  providerId?: string;
  label?: string;
  actor: string;
}) {
  return serialize(async () => {
    const target = await ensureStore();
    const id = versionId();
    const stage = resolve(target.staging, id);
    const originals = resolve(stage, "originals");
    await mkdir(originals, { recursive: true, mode: 0o700 });
    try {
      const files = [];
      for (const [index, file] of input.files.entries()) {
        const data = new Uint8Array(await file.arrayBuffer());
        const storedName = safeFileName(file.name, index);
        await writeFile(resolve(originals, storedName), data, { mode: 0o600 });
        files.push({ name: file.name, storedName, size: data.byteLength, sha256: sha256(data) });
      }
      const snapshotText = `${JSON.stringify(input.snapshot)}\n`;
      const manifest: DataVersionManifest = {
        schemaVersion: 1,
        id,
        label: input.label?.trim().slice(0, 120) || `数据版本 ${id.slice(0, 15)}`,
        createdAt: new Date().toISOString(),
        createdBy: input.actor,
        files,
        selectedBusinessSheets: input.businessIds,
        selectedProviderSheet: input.providerId || null,
        rowCount: input.snapshot.rows.length,
        deduplication: input.snapshot.source.deduplication ?? null,
        snapshotSha256: sha256(snapshotText),
      };
      await writeFile(resolve(stage, "snapshot.json"), snapshotText, { encoding: "utf8", mode: 0o600 });
      await writeFile(resolve(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(stage, versionDirectory(id));
      await activateUnlocked(id, input.actor, "发布新版本");
      return manifest;
    } catch (error) {
      await rm(stage, { recursive: true, force: true });
      throw error;
    }
  });
}

export async function listVersions() {
  const target = await ensureStore();
  let activeId: string | null = null;
  try { activeId = (await readJson<{ id: string }>(target.active)).id; } catch { activeId = null; }
  const entries = await readdir(target.versions, { withFileTypes: true });
  const manifests = await Promise.all(entries.filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name)).map(async (entry) => {
    try { return await readJson<DataVersionManifest>(resolve(target.versions, entry.name, "manifest.json")); } catch { return null; }
  }));
  return { activeId, versions: manifests.filter((item): item is DataVersionManifest => Boolean(item)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) };
}

export async function getCurrentData(): Promise<CurrentDataResponse | null> {
  const target = await ensureStore();
  let id: string;
  try { id = (await readJson<{ id: string }>(target.active)).id; } catch { return null; }
  const directory = versionDirectory(id);
  const [version, snapshotText] = await Promise.all([
    readJson<DataVersionManifest>(resolve(directory, "manifest.json")),
    readFile(resolve(directory, "snapshot.json"), "utf8"),
  ]);
  if (sha256(snapshotText) !== version.snapshotSha256) throw new Error("当前数据版本校验失败");
  return { version, snapshot: JSON.parse(snapshotText) as Snapshot };
}

export function activateVersion(id: string, actor: string, reason = "管理员回滚/切换") {
  return serialize(async () => {
    await ensureStore();
    return activateUnlocked(id, actor, reason.slice(0, 200));
  });
}
