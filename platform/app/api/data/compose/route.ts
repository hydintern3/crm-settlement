import { json, routeError } from "../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../lib/server/auth";
import { composeVersions } from "../../../lib/server/data-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const body = await request.json() as { sourceVersionIds?: unknown; label?: unknown };
    if (!Array.isArray(body.sourceVersionIds) || !body.sourceVersionIds.every((id) => typeof id === "string")) {
      return json({ error: "请选择有效的数据源版本" }, { status: 400 });
    }
    const result = await composeVersions({
      sourceVersionIds: body.sourceVersionIds,
      label: typeof body.label === "string" ? body.label : "",
      actor: session.u,
    });
    return json(result, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
