import { json, routeError } from "../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../lib/server/auth";
import { createChartTemplate, listChartTemplates, reorderChartTemplates } from "../../../lib/server/dashboard-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json({ templates: await listChartTemplates() });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const body = await request.json() as { template?: unknown };
    return json({ template: await createChartTemplate(body.template, session.u) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const body = await request.json() as { orderedIds?: unknown };
    return json({ templates: await reorderChartTemplates(body.orderedIds, session.u) });
  } catch (error) {
    return routeError(error);
  }
}
