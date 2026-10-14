import { submitSchema } from "@/lib/validation";
import { requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitSubmit } from "@/lib/server/limits";
import { checkHoneypot } from "@/lib/server/bots";
import { demoEnabled, sheetsEnabled } from "@/lib/server/env";
import { rpc } from "@/lib/server/database";
import { syncSheets } from "@/lib/server/sync";
import type { Receipt } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route(async request => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const input = await readJson(request, submitSchema);
  checkHoneypot(input.website);
  await limitSubmit(request, browserId);
  const saved = await rpc<Receipt>("form_submit", {
    p_browser_id: browserId, p_attempt_id: input.attemptId, p_request_id: input.requestId,
    p_customer_name: input.customerName, p_email: input.email, p_age: Number(input.age),
    p_product_id: input.productId, p_battery_id: input.batteryId, p_vin: input.vin, p_payment_mode: input.paymentMode,
    p_dealer_id: input.dealerId, p_gender: input.gender, p_proof_id: input.proofId,
  });
  // The durable backup and retry job are committed before contacting Google.
  // Google failure NEVER rolls back or duplicates a confirmed registration.
  if (!demoEnabled() && sheetsEnabled() && saved.sheetStatus !== "done") {
    try { await syncSheets(saved.id); }
    catch { /* A scheduled worker can reclaim this job; no provider/PII logs. */ }
  }
  return { receipt: await rpc<Receipt>("form_get_submission", { p_browser_id: browserId, p_request_id: saved.id }) || saved };
});
