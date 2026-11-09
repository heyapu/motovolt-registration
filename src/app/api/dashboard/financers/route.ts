import { z } from "zod";
import { route, checkOrigin, readJson } from "@/lib/server/http";
import { dashboardRpc, sessionHash } from "@/lib/server/dashboard";
import { enforce, clientIp } from "@/lib/server/limits";
export const runtime = "nodejs";
async function authorize(request: Request) {
    const hash = await sessionHash();
    await enforce([{ key: `dashboard:financers:${hash}`, max: 30, windowMs: 60000 }, { key: `dashboard:financers:ip:${clientIp(request)}`, max: 90, windowMs: 60000 }]);
    return hash;
}
export const GET = route(async (request) => ({ options: await dashboardRpc("dashboard_financers", { p_session_hash: await authorize(request) }) }));
export const POST = route(async (request) => {
    checkOrigin(request);
    const hash = await authorize(request);
    const input = await readJson(request, z.object({ id: z.enum(["bajaj_fin_ltd", "bfl_wheels_hs", "hero_fin_corp", "idfc", "lt_finance", "vpay"]), active: z.boolean() }).strict());
    return { options: await dashboardRpc("dashboard_set_financer", { p_session_hash: hash, p_id: input.id, p_active: input.active }) };
});
