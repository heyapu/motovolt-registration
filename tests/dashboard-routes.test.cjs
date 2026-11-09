const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { randomBytes, scryptSync, createHash } = require("node:crypto");
process.env.NODE_ENV = "production";
process.env.APP_ORIGIN = "https://dealers.motovolt.co";
const code = "test-dashboard-access-code",
  salt = randomBytes(16);
const hash = `scrypt$32768$8$1$${salt.toString("hex")}$${scryptSync(code, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const jar = new Map(),
  sessions = new Map(),
  writes = [],
  limitCalls = [];
let version = 1,
  denyRate = false;
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers")
    return {
      cookies: async () => ({
        get: (name) => (jar.has(name) ? { value: jar.get(name) } : undefined),
        set: (name, value, options) => {
          writes.push({ name, value, options });
          if (options.maxAge === 0) jar.delete(name);
          else jar.set(name, value);
        },
      }),
    };
  if (request.includes("server/limits") || request === "./limits")
    return {
      clientIp: () => "test-ingress",
      enforce: async (limits) => {
        limitCalls.push(limits);
        if (denyRate) {
          const { AppError } = require("../src/lib/server/errors.ts");
          throw new AppError("RATE_LIMITED", "Too many attempts.", 429, 60);
        }
      },
    };
  if (request === "./supabase")
    return {
      adminClient: () => ({
        rpc: async (name, args = {}) => {
          if (name === "dashboard_get_access")
            return { data: { hash, version }, error: null };
          if (name === "dashboard_create_session") {
            if (args.p_version !== version)
              return { error: { message: "DASHBOARD_UNAUTHORIZED" } };
            const data = {
              expiresAt: new Date(Date.now() + 1296000000).toISOString(),
            };
            sessions.set(args.p_hash, data);
            return { data, error: null };
          }
          if (name === "dashboard_validate_session")
            return { data: sessions.get(args.p_hash) || null, error: null };
          if (name === "dashboard_revoke_session") {
            sessions.delete(args.p_hash);
            return { data: null, error: null };
          }
          if (name === "dashboard_analytics") {
            if (!sessions.has(args.p_session_hash))
              return { error: { message: "DASHBOARD_UNAUTHORIZED" } };
            return {
              data: { generatedAt: "test", summary: { purchases: 4 } },
              error: null,
            };
          }
          throw new Error("Unexpected dashboard operation");
        },
      }),
    };
  return original.call(this, request, parent, isMain);
};
const login = require("../src/app/api/dashboard/login/route.ts");
const session = require("../src/app/api/dashboard/session/route.ts");
const analytics = require("../src/app/api/dashboard/analytics/route.ts");
const logout = require("../src/app/api/dashboard/logout/route.ts");
Module._load = original;
function post(path, body, origin = "https://dealers.motovolt.co") {
  return new Request("https://dealers.motovolt.co" + path, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
test("actual route handlers protect metrics and create/revoke a fixed secure cookie", async () => {
  let response = await analytics.GET(
    new Request("https://dealers.motovolt.co/api/dashboard/analytics"),
  );
  assert.equal(response.status, 401);
  response = await login.POST(
    post("/api/dashboard/login", { code }, "https://other.example"),
  );
  assert.equal(response.status, 403);
  assert.equal(sessions.size, 0);
  response = await login.POST(
    post("/api/dashboard/login", { code: "incorrect-long-code" }),
  );
  assert.equal(response.status, 401);
  assert.equal(sessions.size, 0);
  response = await login.POST(post("/api/dashboard/login", { code }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const cookie = writes.at(-1);
  assert.equal(cookie.name, "__Host-mv_dashboard");
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, "strict");
  assert.equal(cookie.options.path, "/");
  assert.equal(cookie.options.maxAge, 1296000);
  assert.equal(
    sessions.has(createHash("sha256").update(cookie.value).digest("hex")),
    true,
  );
  assert.equal(sessions.has(cookie.value), false);
  response = await session.GET(
    new Request("https://dealers.motovolt.co/api/dashboard/session"),
  );
  assert.equal((await response.json()).authenticated, true);
  response = await analytics.GET(
    new Request(
      "https://dealers.motovolt.co/api/dashboard/analytics?from=2026-11-01&to=2026-11-02",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).summary.purchases, 4);
  response = await analytics.GET(
    new Request(
      "https://dealers.motovolt.co/api/dashboard/analytics?from=2026-02-30&to=2026-11-02",
    ),
  );
  assert.equal(response.status, 400);
  response = await logout.POST(post("/api/dashboard/logout", {}));
  assert.equal(response.status, 200);
  assert.equal(sessions.size, 0);
  assert.equal(jar.size, 0);
  jar.set("__Host-mv_dashboard", cookie.value);
  response = await analytics.GET(
    new Request("https://dealers.motovolt.co/api/dashboard/analytics"),
  );
  assert.equal(response.status, 401);
  jar.clear();
  denyRate = true;
  response = await login.POST(post("/api/dashboard/login", { code }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.ok(
    limitCalls.some((limits) =>
      limits.some((l) => l.max === 8 && l.windowMs === 900000),
    ),
  );
});
