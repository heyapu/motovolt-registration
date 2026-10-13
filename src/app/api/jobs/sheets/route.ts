import { timingSafeEqual } from "node:crypto";
import { route } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { required, demoEnabled, sheetsEnabled } from "@/lib/server/env";
import { syncSheets } from "@/lib/server/sync";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route(async request => {
  if (demoEnabled()) throw new AppError("DEMO_ONLY", "Google Sheets is disabled in the local demo.", 403);
  const expected = required("CRON_SECRET");
  if (expected.length < 32) throw new Error("Invalid cron secret");
  const supplied = request.headers.get("authorization") || "", valid = `Bearer ${expected}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(valid) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(valid))) throw new AppError("FORBIDDEN", "Not authorized.", 403);
  if (!sheetsEnabled()) throw new AppError("SHEETS_DISABLED", "Google Sheets sync is not configured yet.", 503);
  return syncSheets();
});
