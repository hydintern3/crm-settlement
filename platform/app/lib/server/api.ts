export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "服务器处理失败";
  console.error("CRM API error:", message);
  const internal = (typeof error === "object" && error !== null && "code" in error) || /服务器缺少必需配置|CRM_SESSION_SECRET/.test(message);
  return json({ error: internal ? "服务器内部配置或存储错误" : message }, { status: internal ? 500 : 400 });
}
