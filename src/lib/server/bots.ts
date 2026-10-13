import "server-only";
import { appOrigin, demoEnabled, required } from "./env";
import { AppError } from "./errors";
import { validateBotToken } from "./turnstile-core";
export function checkHoneypot(value: string): void {
  if (value !== "") throw new AppError("INVALID_REQUEST", "This request could not be accepted.", 400);
}
export async function requireBotCheck(token: string, browserId: string, requestId: string): Promise<void> {
  if (demoEnabled()) return;
  let accepted = false;
  try { accepted = await validateBotToken(token, required("TURNSTILE_SECRET_KEY"), new URL(appOrigin()).hostname, browserId, requestId); }
  catch { throw new AppError("BOT_CHECK_UNAVAILABLE", "The security check is unavailable. Please try again shortly.", 503); }
  if (!accepted) throw new AppError("BOT_CHECK_FAILED", "Complete the security check again before requesting an OTP.", 400);
}
