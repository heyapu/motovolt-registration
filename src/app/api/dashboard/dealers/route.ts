import { z } from "zod";
import { route, checkOrigin, readJson } from "@/lib/server/http";
import { sessionHash } from "@/lib/server/dashboard";
import { dealerAdminRpc } from "@/lib/server/dealer-admin";
import { enforce, clientIp } from "@/lib/server/limits";

export const runtime = "nodejs";
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const text = (max: number, min = 1) => z.string().trim().min(min).max(max)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Remove invalid characters.");
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"), id: id.nullable(), version: z.number().int().positive().nullable(),
    name: text(120, 2), city: text(100), state: text(100), address: text(1000, 0),
  }).strict(),
  z.object({
    action: z.literal("archive"), id, version: z.number().int().positive(), archived: z.boolean(),
  }).strict(),
]);
async function authorize(request: Request, writing = false) {
  const hash = await sessionHash();
  await enforce([
    { key: `dealer-admin:${writing ? "write" : "read"}:${hash}`, max: writing ? 30 : 120, windowMs: 60000 },
    { key: `dealer-admin:ip:${clientIp(request)}`, max: 180, windowMs: 60000 },
  ]);
  return hash;
}
export const GET = route(async request => ({
  dealers: await dealerAdminRpc("dealer_admin_list", { p_session_hash: await authorize(request) }),
}));
export const POST = route(async request => {
  checkOrigin(request);
  const hash = await authorize(request, true);
  const input = await readJson(request, schema);
  if (input.action === "archive") {
    await dealerAdminRpc("dealer_admin_archive", {
      p_session_hash: hash, p_id: input.id, p_version: input.version, p_archived: input.archived,
    });
  } else {
    await dealerAdminRpc("dealer_admin_save", {
      p_session_hash: hash, p_id: input.id, p_version: input.version,
      p_name: input.name, p_city: input.city, p_state: input.state, p_address: input.address,
    });
  }
  return { ok: true };
});
