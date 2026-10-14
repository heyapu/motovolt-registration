import { randomUUID, timingSafeEqual } from "node:crypto";
import { route } from "@/lib/server/http";
import { demoEnabled, required } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";
import { rpc } from "@/lib/server/database";
import { deleteProofFile, deleteProofById } from "@/lib/server/uploads";
export const runtime="nodejs";
export const maxDuration=60;
export const POST=route(async request=>{
  if(demoEnabled())throw new AppError("DEMO_ONLY","External cleanup is disabled in demo mode.",403);
  const secret=required("CRON_SECRET");
  if(secret.length<32)throw new Error("Invalid cron configuration");
  const expected=`Bearer ${secret}`,supplied=request.headers.get("authorization") || "";
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new AppError("FORBIDDEN","Not authorized.",403);
  const worker=randomUUID(),rows=await rpc<{id:string;key:string|null}[]>("form_claim_orphan_proofs",{p_worker:worker});
  let deleted=0;const deadline=Date.now()+40000;
  for(const row of rows){
    if(Date.now()>deadline)break;
    let success=false;
    try{if(row.key)await deleteProofFile(row.key);else await deleteProofById(row.id);success=true;deleted++;}catch{}
    await rpc("form_finish_orphan_proof",{p_worker:worker,p_proof_id:row.id,p_success:success});
  }
  return {deleted};
});
