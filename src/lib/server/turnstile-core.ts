export type BotResult = { success?: boolean; hostname?: string; action?: string; cdata?: string };
export async function validateBotToken(token: string, secret: string, hostname: string, browserId: string, requestId: string, transport: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const response = await transport("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, idempotency_key: requestId }),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  const result = await response.json() as BotResult;
  return response.ok && result.success === true && result.hostname === hostname && result.action === "send_otp" && result.cdata === browserId;
}
