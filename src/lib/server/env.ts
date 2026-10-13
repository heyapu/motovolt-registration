export function demoEnabled(): boolean {
  const demo = process.env.DEMO_MODE === "true";
  if (demo && process.env.NODE_ENV === "production")
    throw new Error("DEMO_MODE is forbidden in production.");
  return demo && process.env.NODE_ENV !== "production";
}
export function sheetsEnabled(): boolean { return process.env.SHEETS_ENABLED === "true"; }
export function required(name: string): string {
  const value = process.env[name];
  if (
    !value ||
    value.startsWith("YOUR_") ||
    value.startsWith("REPLACE_") ||
    value.includes("YOUR_PROJECT")
  )
    throw new Error(`Missing configuration: ${name}`);
  return value;
}
export function appOrigin(): string {
  const value =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("APP_ORIGIN must use HTTPS in production.");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("APP_ORIGIN must be an origin, without a path.");
  return url.origin;
}
export function validateConfiguration(): void {
  appOrigin();
  if (demoEnabled()) return;
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "OTP_HMAC_SECRET",
    "CRON_SECRET",
    "MSG91_AUTH_KEY",
    "MSG91_TEMPLATE_ID",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ])
    required(name);
  if (
    required("OTP_HMAC_SECRET").length < 32 ||
    required("CRON_SECRET").length < 32
  )
    throw new Error(
      "Use independent random secrets of at least 32 characters.",
    );
  if (process.env.OTP_PROVIDER && process.env.OTP_PROVIDER !== "msg91")
    throw new Error("Only MSG91 is supported outside local demo mode.");
  if (!/^[a-fA-F0-9]{24}$/.test(required("MSG91_TEMPLATE_ID")))
    throw new Error("MSG91_TEMPLATE_ID must be a SendOTP template ID (24 hex characters), not a DLT ID or SMS Flow template.");
  for (const name of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
    if (/^[123]x0+(AA|BB|FF)$/.test(required(name))) throw new Error("Turnstile test keys are not allowed outside the local demo.");
  }
  const cap = Number(process.env.OTP_DAILY_SEND_LIMIT || 1000);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100000)
    throw new Error(
      "OTP_DAILY_SEND_LIMIT must be a positive integer up to 100000.",
    );
  if (sheetsEnabled()) {
    required("GOOGLE_SHEET_ID");
    const google = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON"));
    if (google.type !== "service_account" || !google.client_email || !google.private_key?.includes("BEGIN PRIVATE KEY"))
      throw new Error("Invalid Google service-account JSON.");
  }
}

