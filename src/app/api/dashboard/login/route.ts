import { cookies } from "next/headers";
import { z } from "zod";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { enforce, clientIp } from "@/lib/server/limits";
import { AppError } from "@/lib/server/errors";
import { DASHBOARD_COOKIE, dashboardRpc } from "@/lib/server/dashboard";
import {
  createSessionToken,
  tokenHash,
  verifyDashboardCode,
  DASHBOARD_TTL,
} from "@/lib/server/dashboard-crypto";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  checkOrigin(request);
  await enforce([
    {
      key: `dashboard:login:ip:${clientIp(request)}`,
      max: 8,
      windowMs: 900000,
    },
    { key: "dashboard:login:global", max: 150, windowMs: 900000 },
  ]);
  const { code } = await readJson(
    request,
    z.object({ code: z.string().min(12).max(64) }).strict(),
  );
  const access = await dashboardRpc<{ hash: string; version: number } | null>(
    "dashboard_get_access",
  );
  if (!access)
    throw new AppError(
      "DASHBOARD_NOT_CONFIGURED",
      "Ask the administrator to set the dashboard access code.",
      503,
    );
  if (!(await verifyDashboardCode(code, access.hash)))
    throw new AppError(
      "INVALID_ACCESS_CODE",
      "The access code is incorrect.",
      401,
    );
  const token = createSessionToken();
  const session = await dashboardRpc<{ expiresAt: string }>(
    "dashboard_create_session",
    { p_hash: tokenHash(token), p_version: access.version },
  );
  (await cookies()).set(DASHBOARD_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DASHBOARD_TTL,
    expires: new Date(session.expiresAt),
  });
  return { ok: true, expiresAt: session.expiresAt };
});
