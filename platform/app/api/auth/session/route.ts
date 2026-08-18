import { readSession } from "../../../lib/server/auth";
import { json, routeError } from "../../../lib/server/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    const session = readSession(request);
    return session ? json({ authenticated: true, username: session.u }) : json({ authenticated: false }, { status: 401 });
  } catch (error) {
    return routeError(error);
  }
}
