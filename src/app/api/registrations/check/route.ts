import { existingSchema } from "@/lib/validation";
import { requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitRead } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
import { AppError } from "@/lib/server/errors";
import type { Verification } from "@/lib/types";
export const POST = route(async request => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const input = await readJson(request, existingSchema);
  await limitRead(request, browserId);
  const verification = await rpc<Verification>("form_load_verification", {
    p_browser_id: browserId, p_attempt_id: input.attemptId,
  });
  if (verification.phone !== input.phone || verification.status !== "verified" ||
    Date.parse(verification.verificationExpiresAt || "") <= Date.now()) {
    throw new AppError("VERIFICATION_EXPIRED", "Verify this phone number first.", 410);
  }
  return rpc("form_check_existing", {
    p_browser_id: browserId, p_phone: input.phone, p_battery_id: input.batteryId,
    p_vin: input.vin, p_attempt_id: input.attemptId,
  });
});
