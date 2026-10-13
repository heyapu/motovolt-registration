import { createHmac, randomInt } from "node:crypto";
import { demoEnabled, required } from "./env";

function secret(): string {
  return demoEnabled()
    ? "local-demo-only-never-a-production-secret"
    : required("OTP_HMAC_SECRET");
}
export function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}
export function otpDigest(
  attemptId: string,
  browserId: string,
  phone: string,
  code: string,
): string {
  return createHmac("sha256", secret())
    .update(JSON.stringify(["public-otp-v1", attemptId, browserId, phone, code]))
    .digest("hex");
}
export function privateKey(value: string): string {
  return createHmac("sha256", secret())
    .update(`rate-limit-v1:${value}`)
    .digest("hex");
}
