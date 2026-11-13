import { route } from "@/lib/server/http";
import { requireBrowser } from "@/lib/server/browser";
import { limitRead } from "@/lib/server/limits";
import { dealerDirectory } from "@/lib/server/dealers";
export const runtime = "nodejs";
export const GET = route(async request => {
  await limitRead(request, await requireBrowser());
  return dealerDirectory();
});
