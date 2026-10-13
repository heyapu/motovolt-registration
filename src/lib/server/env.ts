import { AppError } from "./errors";

function configError(message: string): never {
  throw new AppError("CONFIGURATION_ERROR", message, 503);
}

export function demoEnabled(): boolean {
  const demo = process.env.DEMO_MODE === "true";
  if (demo && process.env.NODE_ENV === "production")
    configError("DEMO_MODE=true is forbidden in production. Set DEMO_MODE=false.");
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
    configError(`Set ${name} in the hosting environment, then redeploy.`);
  return value;
}
export function appOrigin(): string {
  const value =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  let url: URL;
  try { url = new URL(value); }
  catch { configError("Set APP_ORIGIN to the full application origin, including https://."); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol))
    configError("APP_ORIGIN must be an HTTP(S) origin without credentials.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    configError("APP_ORIGIN must use HTTPS in production.");
  if (url.pathname !== "/" || url.search || url.hash)
    configError("APP_ORIGIN must be an origin without a path, query or fragment.");
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
  for (const name of ["OTP_HMAC_SECRET", "CRON_SECRET"]) {
    if (required(name).length < 32)
      configError(`${name} must contain at least 32 characters. Generate a new random secret.`);
  }
  if (required("OTP_HMAC_SECRET") === required("CRON_SECRET"))
    configError("OTP_HMAC_SECRET and CRON_SECRET must be different random values.");
  if (process.env.OTP_PROVIDER && process.env.OTP_PROVIDER !== "msg91")
    configError("Set OTP_PROVIDER=msg91 for real-service mode.");
  if (!/^[a-fA-F0-9]{24}$/.test(required("MSG91_TEMPLATE_ID")))
    configError("MSG91_TEMPLATE_ID must contain the 24-character SendOTP template ID on one line.");
  for (const name of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
    if (/^[123]x0+(AA|BB|FF)$/.test(required(name))) configError(`${name} contains a Turnstile test key. Use the key from your real widget.`);
  }
  const cap = Number(process.env.OTP_DAILY_SEND_LIMIT || 1000);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100000)
    configError("OTP_DAILY_SEND_LIMIT must be a positive integer up to 100000.");
  if (sheetsEnabled()) {
    required("GOOGLE_SHEET_ID");
    let google: unknown;
    try { google = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON")); }
    catch (error) {
      if (error instanceof AppError) throw error;
      configError("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON. In Vercel paste the complete JSON object without wrapping it in extra quotes.");
    }
    if (!google || typeof google !== "object")
      configError("GOOGLE_SERVICE_ACCOUNT_JSON must be a service-account JSON object.");
    const account = google as Record<string, unknown>;
    if (account.type !== "service_account" || typeof account.client_email !== "string" || !account.client_email ||
      typeof account.private_key !== "string" || !account.private_key.includes("BEGIN PRIVATE KEY"))
      configError("GOOGLE_SERVICE_ACCOUNT_JSON must include type=service_account, client_email and the complete private_key.");
  }
}

