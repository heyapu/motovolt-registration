import "server-only";
import { required, appOrigin } from "./env";
export function resetMailConfig() {
  const email = required("DASHBOARD_RESET_EMAIL").trim().toLowerCase();
  const from = required("RESEND_FROM_EMAIL").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(from)) throw new Error("INVALID_RESET_CONFIG");
  return { email, from, key: required("RESEND_API_KEY"), origin: appOrigin() };
}
export async function sendResetMail(token: string, config: ReturnType<typeof resetMailConfig>) {
  // Fragment keeps the token out of HTTP request URLs/access logs. No tracking links.
  const link = `${config.origin}/reset-pass#token=${token}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `dashboard-reset-${token}` },
    body: JSON.stringify({ from: config.from, to: [config.email], subject: "Reset your Motovolt dashboard access code",
      text: `A reset was requested for the shared Motovolt dashboard access code.\n\nOpen this link within 15 minutes:\n${link}\n\nIf you did not request this, ignore this email. Your current code remains unchanged. Resetting signs everyone out.` })
  });
  if (!response.ok) throw new Error("RESET_MAIL_FAILED");
}
