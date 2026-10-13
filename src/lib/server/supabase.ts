import "server-only";
import { createClient } from "@supabase/supabase-js";
import { required } from "./env";
export function adminClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: init?.signal || AbortSignal.timeout(10000) }) },
  });
}
