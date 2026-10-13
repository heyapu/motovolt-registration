// Server-side transport, kept independent of Next so its request/response handling is testable.
// Never log request URLs: MSG91's SendOTP/Verify APIs put mobile/OTP parameters in the query.
export type Msg91Config = { authKey: string; templateId: string };
export type Fetcher = typeof fetch;
export async function sendWithMsg91(config: Msg91Config, phone: string, code: string, transport: Fetcher = fetch): Promise<void> {
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.search = new URLSearchParams({ template_id: config.templateId, mobile: phone.slice(1), otp: code, otp_length: "6", otp_expiry: "10" }).toString();
  const response = await transport(url, {
    method: "POST", headers: { authkey: config.authKey, "Content-Type": "application/json" },
    body: "{}", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || result?.type !== "success" || typeof result.message !== "string" || !result.message)
    throw new Error("MSG91_SEND_REJECTED");
}
export async function verifyWithMsg91(config: Msg91Config, phone: string, code: string, transport: Fetcher = fetch): Promise<boolean> {
  const url = new URL("https://control.msg91.com/api/v5/otp/verify");
  url.search = new URLSearchParams({ mobile: phone.slice(1), otp: code }).toString();
  const response = await transport(url, {
    method: "GET", headers: { authkey: config.authKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || typeof result?.message !== "string") return false;
  const message = result.message.trim().toLowerCase();
  if (result.type === "success" && ["otp_verified", "mobile_number_verified", "mobile number verified successfully", "otp verified success", "number_verified_successfully"].includes(message)) return true;
  // Recovery after a lost successful provider response. ONLY safe because the caller
  // has atomically matched the code's keyed digest to its own unexpired challenge first.
  // An "already verified" response alone NEVER grants portal verification.
  return ["success", "error"].includes(result.type) && ["mobile no. already verified", "mobile number already verified", "already_verified", "mobile_number_already_verified"].includes(message);
}
