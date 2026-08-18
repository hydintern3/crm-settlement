import { activateVersion } from "../../../../../lib/server/data-store";
import { json, routeError } from "../../../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { reason?: string };
    return json({ version: await activateVersion(id, session.u, body.reason || "管理员回滚/切换") });
  } catch (error) {
    return routeError(error);
  }
}
