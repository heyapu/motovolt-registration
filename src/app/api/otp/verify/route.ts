import { randomUUID } from "node:crypto";
import { verifySchema } from "@/lib/validation";
import type { Verification } from "@/lib/types";
import { openBrowser, requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitVerify } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
import { otpDigest } from "@/lib/server/crypto";
import { confirmProviderOtp } from "@/lib/server/otp";
import { AppError } from "@/lib/server/errors";
export const runtime = "nodejs";
function failed(code: string, remaining?: number): never {
  const message = code === "OTP_LOCKED" ? "Too many attempts. Request a new OTP." : code === "OTP_EXPIRED" ? "This OTP expired. Request a new code." : code === "OTP_PENDING" ? "Verification is processing. Please try again shortly." : `Incorrect OTP. ${remaining ?? 0} attempts remaining.`;
  throw new AppError(code, message, code === "OTP_INCORRECT" ? 400 : code === "OTP_PENDING" ? 409 : 410);
}
export const POST = route(async request => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const input = await readJson(request, verifySchema);
  await limitVerify(request, browserId);
  const attempt = await rpc<Verification>("form_load_verification", { p_browser_id: browserId, p_attempt_id: input.attemptId });
  const token = randomUUID();
  const reserved = await rpc<{ ok: boolean; providerCheck?: boolean; code?: string; attemptsRemaining?: number; verification?: Verification }>("form_reserve_otp_check", {
    p_browser_id: browserId, p_attempt_id: input.attemptId,
    p_otp_hash: otpDigest(input.attemptId, browserId, attempt.phone, input.code), p_check_token: token,
  });
  if (!reserved.ok) failed(reserved.code || "OTP_INCORRECT", reserved.attemptsRemaining);
  if (!reserved.providerCheck) return { verification: reserved.verification };
  let success = false;
  let providerError: unknown;
  try { success = await confirmProviderOtp(attempt.phone, input.code); }
  catch (error) { providerError = error; }
  const finished = await rpc<{ ok: boolean; code?: string; verification?: Verification }>("form_finish_otp_check", {
    p_browser_id: browserId, p_attempt_id: input.attemptId, p_check_token: token, p_success: success,
  });
  if (providerError) throw providerError;
  if (!finished.ok) {
    if (finished.code === "OTP_EXPIRED") failed("OTP_EXPIRED");
    throw new AppError("OTP_PROVIDER_FAILED", "MSG91 could not verify this code. Request a fresh OTP if the issue persists.", 502);
  }
  await openBrowser();
  return { verification: finished.verification };
});
