import { json, routeError } from "../../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../../lib/server/auth";
import { updateChartTemplate } from "../../../../lib/server/dashboard-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await request.json() as { template?: unknown; revision?: unknown };
    return json({ template: await updateChartTemplate(id, body.template, body.revision, session.u) });
  } catch (error) {
    return routeError(error);
  }
}
