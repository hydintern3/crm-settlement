import { deleteVersion } from "../../../../lib/server/data-store";
import { json, routeError } from "../../../../lib/server/api";
import { assertSameOrigin, requireAdmin } from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAdmin(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json({ deleted: await deleteVersion(id, session.u) });
  } catch (error) {
    return routeError(error);
  }
}
