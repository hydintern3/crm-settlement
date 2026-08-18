import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "crm_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS = 8;

type SessionPayload = { u: string; iat: number; exp: number };
const attempts = new Map<string, { count: number; resetAt: number }>();

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`服务器缺少必需配置 ${name}`);
  return value;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  const secret = env("CRM_SESSION_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("CRM_SESSION_SECRET 长度不足");
  return encode(createHmac("sha256", secret).update(value).digest());
}

function parseCookies(header: string | null) {
  return Object.fromEntries((header ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

export function createPasswordHash(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${encode(salt)}$${encode(hash)}`;
}

export function verifyPassword(password: string, encoded = env("CRM_ADMIN_PASSWORD_HASH")) {
  const [algorithm, n, r, p, salt, expected] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  try {
    const expectedBytes = Buffer.from(expected, "base64url");
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expectedBytes.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expectedBytes.length === actual.length && timingSafeEqual(expectedBytes, actual);
  } catch {
    return false;
  }
}

export function verifyAdminCredentials(username: string, password: string) {
  const expectedUser = env("CRM_ADMIN_USERNAME");
  const left = Buffer.from(username);
  const right = Buffer.from(expectedUser);
  const userMatches = left.length === right.length && timingSafeEqual(left, right);
  const passwordMatches = verifyPassword(password);
  return userMatches && passwordMatches;
}

export function createSession(username: string) {
  const now = Math.floor(Date.now() / 1000);
  const body = encode(JSON.stringify({ u: username, iat: now, exp: now + SESSION_SECONDS } satisfies SessionPayload));
  return `${body}.${sign(body)}`;
}

export function readSession(request: Request): SessionPayload | null {
  const token = parseCookies(request.headers.get("cookie"))[COOKIE_NAME];
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(body));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.u !== env("CRM_ADMIN_USERNAME") || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAdmin(request: Request) {
  const session = readSession(request);
  if (!session) throw new Response(JSON.stringify({ error: "请先登录管理员账号" }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return session;
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/crm; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/crm; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new Response(JSON.stringify({ error: "请求来源校验失败" }), { status: 403, headers: { "content-type": "application/json" } });
  const originHost = new URL(origin).host;
  if (originHost !== host) throw new Response(JSON.stringify({ error: "拒绝跨站请求" }), { status: 403, headers: { "content-type": "application/json" } });
}

export function loginRateKey(request: Request, username: string) {
  return `${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}:${username.toLowerCase()}`;
}

export function consumeLoginAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}
