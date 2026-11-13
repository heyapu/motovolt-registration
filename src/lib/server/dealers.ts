import "server-only";
import type { Dealer, DealerDirectory } from "../dealers";
import { adminClient } from "./supabase";
import { AppError } from "./errors";

export async function dealerDirectory(): Promise<DealerDirectory> {
  const { data, error } = await adminClient()
    .from("form_dealer_directory")
    .select("revision,data,initialized")
    .eq("id", true)
    .single();
  if (error || !data?.initialized || !Array.isArray(data.data)) {
    throw new AppError("DEALERS_UNAVAILABLE", "Could not load the dealer list. Please try again shortly.", 503);
  }
  return { revision: data.revision, dealers: data.data as Dealer[] };
}

// Include archived dealers here so existing form_submit retries can return their
// saved receipt. The BEFORE INSERT database trigger rejects NEW archived sales.
export async function submissionDealer(id: string): Promise<Dealer> {
  const { data, error } = await adminClient()
    .from("form_dealers")
    .select("id,name,city,state,address")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError("DEALERS_UNAVAILABLE", "Could not check the dealer. Please try again.", 503);
  if (!data) throw new AppError("INVALID_DEALER", "Select an available dealer from the list.", 400);
  return data as Dealer;
}
