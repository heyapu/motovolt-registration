import { route } from "@/lib/server/http";
import { enforce, clientIp } from "@/lib/server/limits";
import { AppError } from "@/lib/server/errors";
import { dashboardRpc, sessionHash } from "@/lib/server/dashboard";
import { parseFilters } from "@/lib/dashboard/filters";
import type { DashboardData } from "@/lib/dashboard/types";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = route(async (request) => {
  const hash = await sessionHash();
  await enforce([
    { key: `dashboard:data:session:${hash}`, max: 60, windowMs: 60000 },
    {
      key: `dashboard:data:ip:${clientIp(request)}`,
      max: 180,
      windowMs: 60000,
    },
  ]);
  let filters;
  try {
    filters = parseFilters(new URL(request.url).searchParams);
  } catch (error) {
    throw new AppError(
      "INVALID_FILTER",
      error instanceof Error ? error.message : "Invalid filters.",
      400,
    );
  }
  return dashboardRpc<DashboardData>("dashboard_analytics", {
    p_session_hash: hash,
    p_from: filters.from || null,
    p_to: filters.to,
    p_product: filters.product || null,
    p_state: filters.state || null,
    p_city: filters.city || null,
    p_dealer_id: filters.dealer || null,
  });
});
