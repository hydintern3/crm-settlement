import { listVersions } from "../../../lib/server/data-store";
import { json, routeError } from "../../../lib/server/api";
import { requireAdmin } from "../../../lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json(await listVersions());
  } catch (error) {
    return routeError(error);
  }
}
