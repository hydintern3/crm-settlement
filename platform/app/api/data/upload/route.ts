import { inspectWorkbookFiles, snapshotFromSheets } from "../../../lib/workbook-import";
import { publishVersion } from "../../../lib/server/data-store";
import { json, routeError } from "../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 105 * 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength && contentLength > MAX_REQUEST_BYTES) return json({ error: "上传内容超过 105 MB 请求上限" }, { status: 413 });
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length) return json({ error: "请选择需要发布的表格" }, { status: 400 });
    const totalFileBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalFileBytes > MAX_FILE_BYTES) return json({ error: "单次发布的表格总大小不能超过 100 MB；请拆分为多个数据版本后再整合" }, { status: 413 });
    if (files.some((file) => !/\.(csv|xls|xlsx|xlsm|xlsb|ods)$/i.test(file.name))) return json({ error: "上传中包含不支持的文件格式" }, { status: 400 });
    if (new Set(files.map((file) => file.name.toLowerCase())).size !== files.length) return json({ error: "同一次上传不能包含同名文件" }, { status: 400 });
    const businessIds = JSON.parse(String(form.get("businessIds") ?? "[]")) as string[];
    const providerId = String(form.get("providerId") ?? "") || undefined;
    const sheets = await inspectWorkbookFiles(files);
    const snapshot = snapshotFromSheets(sheets, businessIds, providerId);
    const version = await publishVersion({ files, snapshot, businessIds, providerId, label: String(form.get("label") ?? ""), actor: session.u });
    return json({ version, snapshot }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
