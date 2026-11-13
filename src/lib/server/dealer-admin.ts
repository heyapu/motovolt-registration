import "server-only";
import { adminClient } from "./supabase";
import { AppError } from "./errors";

const messages: Record<string, [string, number]> = {
  DASHBOARD_UNAUTHORIZED: ["Enter the dashboard access code to continue.", 401],
  DEALER_NOT_FOUND: ["This dealer no longer exists. Reload the page.", 404],
  DEALER_CHANGED: ["Someone else changed this dealer. Reopen Edit from the updated list before saving.", 409],
  DEALER_ALREADY_EXISTS: ["A dealer with this name, city and state already exists. Edit or restore that dealer instead.", 409],
  INVALID_DEALER_DETAILS: ["Check the dealer name, city, state and address.", 400],
};
export async function dealerAdminRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(name, args);
  if (error) {
    const code = Object.keys(messages).find(key => error.message.includes(key));
    if (code) throw new AppError(code, messages[code][0], messages[code][1]);
    throw new AppError("DEALERS_UNAVAILABLE", "Dealer management is unavailable. Check the dealer migration and try again.", 503);
  }
  return data as T;
}
