import "server-only";
import { demoEnabled, required } from "./env";
import { AppError } from "./errors";
import { sendWithMsg91, verifyWithMsg91 } from "./msg91";
const config = () => ({ authKey: required("MSG91_AUTH_KEY"), templateId: required("MSG91_TEMPLATE_ID") });
export async function deliverOtp(phone: string, code: string): Promise<void> {
  if (demoEnabled()) return;
  try { await sendWithMsg91(config(), phone, code); }
  catch (error) {
    // Never log the raw error, URL, provider body, phone, OTP or auth key.
    const name = error instanceof Error ? error.name : "";
    const reason = error instanceof Error && error.message === "MSG91_SEND_REJECTED" ? "provider_rejected"
      : ["TimeoutError", "AbortError"].includes(name) ? "timeout"
      : name === "SyntaxError" ? "invalid_provider_json" : "transport_failure";
    console.error(JSON.stringify({ event: "msg91_send_failed", reason }));
    throw new AppError("OTP_DELIVERY_FAILED", reason === "timeout"
      ? "MSG91 did not confirm the request in time. An SMS may still arrive. Wait a minute, then request a fresh code."
      : "Could not confirm the OTP request with MSG91. Wait a minute and request a fresh code.", 502);
  }
}
export async function confirmProviderOtp(phone: string, code: string): Promise<boolean> {
  if (demoEnabled()) return code === "123456";
  try { return await verifyWithMsg91(config(), phone, code); }
  catch { throw new AppError("OTP_PROVIDER_UNAVAILABLE", "Could not confirm the code with MSG91. Please try again shortly.", 502); }
}
