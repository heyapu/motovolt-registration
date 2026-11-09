import { requireBrowser } from "@/lib/server/browser";
import { limitRead } from "@/lib/server/limits";
import { route } from "@/lib/server/http";
import { adminClient } from "@/lib/server/supabase";
import { AppError } from "@/lib/server/errors";
export const runtime = "nodejs";
export const GET = route(async (request) => {
    const browserId = await requireBrowser();
    await limitRead(request, browserId);
    const { data, error } = await adminClient().from("registration_financers").select("id,name").eq("active", true).order("sort_order");
    if (error)
        throw new AppError("FINANCERS_UNAVAILABLE", "Could not load finance options. Try again.", 503);
    return { options: data || [] };
});
