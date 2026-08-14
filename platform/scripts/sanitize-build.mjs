import { access, readdir, rm } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve("dist");
const forbiddenNames = new Set(["local-snapshot.json"]);
const forbiddenExtensions = new Set([".csv", ".tsv", ".xls", ".xlsx", ".xlsm", ".xlsb", ".ods"]);

await Promise.all([
  rm(resolve(root, "client/data/local-snapshot.json"), { force: true }),
  rm(resolve(root, "standalone/dist/client/data/local-snapshot.json"), { force: true }),
  rm(resolve(root, "standalone/public/data/local-snapshot.json"), { force: true }),
]);

async function findForbidden(directory) {
  try {
    await access(directory);
  } catch {
    return [];
  }

  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findForbidden(path));
    } else if (forbiddenNames.has(entry.name) || forbiddenExtensions.has(extname(entry.name).toLowerCase())) {
      found.push(path);
    }
  }
  return found;
}

const forbiddenFiles = await findForbidden(root);
if (forbiddenFiles.length) {
  throw new Error(`发布产物包含禁止的数据文件：\n${forbiddenFiles.join("\n")}`);
}

console.log("发布数据检查通过：构建产物不包含本地快照或业务表格。");
