import { cookies } from "next/headers";
import { route, checkOrigin } from "@/lib/server/http";
import { DASHBOARD_COOKIE, dashboardRpc } from "@/lib/server/dashboard";
import { tokenHash } from "@/lib/server/dashboard-crypto";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  checkOrigin(request);
  const jar = await cookies();
  const token = jar.get(DASHBOARD_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token))
    await dashboardRpc("dashboard_revoke_session", {
      p_hash: tokenHash(token),
    });
  jar.set(DASHBOARD_COOKIE, "", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
  });
  return { ok: true };
});
