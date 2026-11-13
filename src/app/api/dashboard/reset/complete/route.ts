import { cookies } from "next/headers";
import { z } from "zod";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { clientIp, enforce } from "@/lib/server/limits";
import { tokenHash } from "@/lib/server/dashboard-crypto";
import { hashResetAccessCode } from "@/lib/server/reset-crypto";
import { DASHBOARD_COOKIE, dashboardRpc } from "@/lib/server/dashboard";
import { AppError } from "@/lib/server/errors";
export const runtime = "nodejs";
export const POST = route(async request => {
  checkOrigin(request);
  await enforce([{ key: `dashboard-reset:complete:${clientIp(request)}`, max: 8, windowMs: 900000 },
    { key: "dashboard-reset:complete:global", max: 100, windowMs: 900000 }]);
  const input = await readJson(request, z.object({ token: z.string().regex(/^[a-f0-9]{64}$/),
    code: z.string().regex(/^[\x21-\x7e]{12,64}$/, "Use 12–64 characters without spaces.") }).strict());
  const success = await dashboardRpc<boolean>("dashboard_complete_reset", {
    p_token_hash: tokenHash(input.token), p_access_hash: await hashResetAccessCode(input.code)
  });
  if (!success) throw new AppError("RESET_EXPIRED", "This link is invalid, expired or already used. Request another link.", 400);
  (await cookies()).set(DASHBOARD_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0, expires: new Date(0) });
  return { ok: true };
});
