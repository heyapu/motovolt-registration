import { getDealer } from "@/lib/dealers";
import { cachePurchaseStatus } from "@/lib/server/purchases";
import { AppError } from "@/lib/server/errors";
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

  const dealer = getDealer(input.dealerId);

  if (!dealer) {
    throw new AppError(
      "INVALID_DEALER",
      "Select a dealer from the dropdown.",
      400,
    );
  }

  const saved = await rpc<Receipt>("form_submit", {
    p_browser_id: browserId,
    p_attempt_id: input.attemptId,
    p_request_id: input.requestId,

    p_customer_name: input.customerName,
    p_email: input.email,
    p_age: Number(input.age),
    p_gender: input.gender,

    p_dealer_id: dealer.id,
    p_dealer_name: dealer.name,

    p_product_id: input.productId,
    p_colour: input.colour,
    p_connectivity: input.connectivity,
    p_range_variant: input.rangeVariant,
    p_charger_type: input.chargerType,
    p_battery_id: input.batteryId,
    p_vin: input.vin,

    p_payment_mode: input.paymentMode,
    p_financer_name:
      input.paymentMode === "finance"
        ? input.financerName.trim()
        : null,

    // New registrations no longer require an uploaded proof.
    p_proof_id: null,
  });

  // Cache failures must not interrupt a confirmed registration.
  try {
    await cachePurchaseStatus(saved.phone, saved.purchaseStatus);
  } catch {
    // Supabase remains authoritative for monthly purchase limits.
  }

  // The registration and retry job are committed before contacting Google.
  if (
    !demoEnabled() &&
    sheetsEnabled() &&
    saved.sheetStatus !== "done"
  ) {
    try {
      await syncSheets(saved.id);
    } catch {
      // The scheduled worker can retry the pending job.
    }
  }

  // A status refresh failure must not hide a successful submission.
  let receipt = saved;

  try {
    receipt =
      (await rpc<Receipt | null>("form_get_submission", {
        p_browser_id: browserId,
        p_request_id: saved.id,
      })) || saved;
  } catch {
    // Return the receipt already confirmed by form_submit.
  }

  return { receipt };
});