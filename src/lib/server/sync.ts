import "server-only";
import { randomUUID } from "node:crypto";
import { rpc } from "./database";
import { sheetWriter } from "./sheets";
import type { SheetJob } from "../types";
export async function syncSheets(submissionId: string | null = null): Promise<{ synced: number; failed: number }> {
  const worker = randomUUID(), deadline = Date.now() + 45000;
  const jobs = await rpc<SheetJob[]>("form_claim_sheet_jobs", { p_worker_id: worker, p_limit: submissionId ? 1 : 5, p_submission_id: submissionId });
  let synced = 0, failed = 0;
  try {
    if (!jobs.length) return { synced, failed };
    let write: (job: SheetJob) => Promise<void>;
    try { write = await sheetWriter(jobs); }
    catch {
      for (const job of jobs) await rpc("form_finish_sheet_job", { p_worker_id: worker, p_submission_id: job.submissionId, p_success: false, p_error: "GOOGLE_SETUP_OR_CONNECTION" });
      return { synced, failed: jobs.length };
    }
    for (const job of jobs) {
      if (Date.now() > deadline) break;
      let success = false, errorCode: string | null = null;
      try { await write(job); success = true; }
      catch (error) { errorCode = error instanceof Error && /^SHEETS_[A-Z_0-9]+$/.test(error.message) ? error.message : "SHEETS_UNAVAILABLE"; }
      await rpc("form_finish_sheet_job", { p_worker_id: worker, p_submission_id: job.submissionId, p_success: success, p_error: errorCode });
      if (success) synced++; else failed++;
    }
    return { synced, failed };
  } finally { await rpc("form_release_sheet_worker", { p_worker_id: worker }); }
}
