import { getCurrentData } from "../../../lib/server/data-store";
import { json, routeError } from "../../../lib/server/api";
import { requireAdmin } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const current = await getCurrentData();
    return current ? json(current) : json({ error: "尚未发布服务器数据版本" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
