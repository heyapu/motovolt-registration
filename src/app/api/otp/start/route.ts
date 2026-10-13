import { startSchema } from "@/lib/validation";
import type { Verification } from "@/lib/types";
import { requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitRead, limitSend } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
import { generateOtp, otpDigest } from "@/lib/server/crypto";
import { deliverOtp } from "@/lib/server/otp";
import { demoEnabled } from "@/lib/server/env";
import { requireBotCheck, checkHoneypot } from "@/lib/server/bots";
import { AppError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const POST = route(async (request) => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const input = await readJson(request, startSchema);
  checkHoneypot(input.website);
  await limitRead(request, browserId);
  const resumed = await rpc<Verification | null>("form_resume_verification", {
    p_browser_id: browserId,
    p_phone: input.phone,
  });
  if (resumed) return { verification: resumed };
  // A lost response can be recovered without sending a second SMS.
  try {
    const existing = await rpc<Verification>("form_load_verification", {
      p_browser_id: browserId,
      p_attempt_id: input.requestId,
    });
    if (existing.phone !== input.phone)
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "This request belongs to a different number.",
        409,
      );
    if ((existing.status === "sent" && Date.parse(existing.otpExpiresAt) > Date.now()) ||
      (existing.status === "verified" && Date.parse(existing.verificationExpiresAt || "") > Date.now()))
      return { verification: existing };
    if (existing.status === "pending")
      throw new AppError(
        "OTP_PENDING",
        "The OTP request is still processing. Try again shortly.",
        409,
      );
    throw new AppError("OTP_EXPIRED", "Request a new OTP.", 410);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "ATTEMPT_NOT_FOUND")
      throw error;
  }
  await requireBotCheck(input.captchaToken, browserId, input.requestId);
  const exists = await rpc<{ phoneExists: boolean }>("form_check_existing", {
    p_browser_id: browserId, p_phone: input.phone, p_battery_id: "", p_vin: "", p_attempt_id: null,
  });
  if (exists.phoneExists) throw new AppError("DUPLICATE_PHONE", "This phone number is already registered.", 409);
  await limitSend(request, browserId, input.phone);
  const code = demoEnabled() ? "123456" : generateOtp();
  const created = await rpc<{ created: boolean; verification: Verification }>(
    "form_start_verification",
    {
      p_browser_id: browserId,
      p_attempt_id: input.requestId,
      p_phone: input.phone,
      p_otp_hash: otpDigest(input.requestId, browserId, input.phone, code),
    },
  );
  if (!created.created) return { verification: created.verification };
  try {
    await deliverOtp(input.phone, code);
  } catch (error) {
    await rpc("form_mark_otp_delivery", {
      p_browser_id: browserId,
      p_attempt_id: input.requestId,
      p_success: false,
    });
    throw error;
  }
  const verification = await rpc<Verification>("form_mark_otp_delivery", {
    p_browser_id: browserId,
    p_attempt_id: input.requestId,
    p_success: true,
  });
  return { verification };
});
