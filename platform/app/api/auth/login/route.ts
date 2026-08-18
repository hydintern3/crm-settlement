import { assertSameOrigin, clearLoginAttempts, consumeLoginAttempt, createSession, loginRateKey, sessionCookie, verifyAdminCredentials } from "../../../lib/server/auth";
import { json, routeError } from "../../../lib/server/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const key = loginRateKey(request, username);
    if (!consumeLoginAttempt(key)) return json({ error: "登录尝试过多，请稍后再试" }, { status: 429 });
    if (!verifyAdminCredentials(username, password)) return json({ error: "管理员账号或密码错误" }, { status: 401 });
    clearLoginAttempts(key);
    return json({ username }, { headers: { "set-cookie": sessionCookie(createSession(username)) } });
  } catch (error) {
    return routeError(error);
  }
}
