import "server-only";
import { demoEnabled, required } from "./env";
import { AppError } from "./errors";
import { sendWithMsg91, verifyWithMsg91 } from "./msg91";
const config = () => ({ authKey: required("MSG91_AUTH_KEY"), templateId: required("MSG91_TEMPLATE_ID") });
export async function deliverOtp(phone: string, code: string): Promise<void> {
  if (demoEnabled()) return;
  try { await sendWithMsg91(config(), phone, code); }
  catch { throw new AppError("OTP_DELIVERY_FAILED", "Could not send the OTP. Wait a minute and request a new code.", 502); }
}
export async function confirmProviderOtp(phone: string, code: string): Promise<boolean> {
  if (demoEnabled()) return code === "123456";
  try { return await verifyWithMsg91(config(), phone, code); }
  catch { throw new AppError("OTP_PROVIDER_UNAVAILABLE", "Could not confirm the code with MSG91. Please try again shortly.", 502); }
}
