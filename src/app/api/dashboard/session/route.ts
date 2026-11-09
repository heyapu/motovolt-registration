import { route } from "@/lib/server/http";
import { DASHBOARD_COOKIE, dashboardRpc } from "@/lib/server/dashboard";
import { cookies } from "next/headers";
import { tokenHash } from "@/lib/server/dashboard-crypto";
import { enforce, clientIp } from "@/lib/server/limits";
export const runtime = "nodejs";
export const GET = route(async (request) => {
  await enforce([
    {
      key: `dashboard:session:ip:${clientIp(request)}`,
      max: 120,
      windowMs: 60000,
    },
  ]);
  const token = (await cookies()).get(DASHBOARD_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { authenticated: false };
  const session = await dashboardRpc<{ expiresAt: string } | null>(
    "dashboard_validate_session",
    { p_hash: tokenHash(token) },
  );
  return session
    ? { authenticated: true, expiresAt: session.expiresAt }
    : { authenticated: false };
});
