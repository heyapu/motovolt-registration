import { randomBytes } from "node:crypto";
import { z } from "zod";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { clientIp, enforce } from "@/lib/server/limits";
import { tokenHash } from "@/lib/server/dashboard-crypto";
import { dashboardRpc } from "@/lib/server/dashboard";
import { resetMailConfig, sendResetMail } from "@/lib/server/reset-mail";
export const runtime = "nodejs";
export const POST = route(async request => {
  checkOrigin(request);
  await enforce([{ key: `dashboard-reset:request:${clientIp(request)}`, max: 4, windowMs: 3600000 },
    { key: "dashboard-reset:request:global", max: 40, windowMs: 3600000 }]);
  const { email } = await readJson(request, z.object({ email: z.email().max(254) }).strict());
  const start = Date.now();
  try {
    const config = resetMailConfig();
    if (email.trim().toLowerCase() === config.email) {
      await enforce([{ key: "dashboard-reset:mailbox", max: 3, windowMs: 3600000 }]);
      const token = randomBytes(32).toString("hex");
      await dashboardRpc("dashboard_issue_reset", { p_hash: tokenHash(token) });
      await sendResetMail(token, config);
    }
  } catch {
    // Same public response on mismatch/provider failure; no addresses, tokens or API responses logged.
    console.error({ event: "dashboard_reset_delivery_failed" });
  }
  // Reduce the common fast mismatch timing signal. This is not a constant-time email service.
  const remaining = 1200 - (Date.now() - start);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  return { message: "If the email is authorized, a reset link will be sent. Check your inbox and spam folder." };
});
