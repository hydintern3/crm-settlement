import { assertSameOrigin, clearSessionCookie } from "../../../lib/server/auth";
import { json, routeError } from "../../../lib/server/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  } catch (error) {
    return routeError(error);
  }
}
