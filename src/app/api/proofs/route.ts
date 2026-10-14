import { randomUUID } from "node:crypto";
import { proofSchema } from "@/lib/validation";
import type { PaymentProof, Verification } from "@/lib/types";
import { checkOrigin, route } from "@/lib/server/http";
import { requireBrowser } from "@/lib/server/browser";
import { checkHoneypot } from "@/lib/server/bots";
import { limitProofUpload, limitRead } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
import { appOrigin, demoEnabled, required } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";
import { readProofBody } from "@/lib/server/proof-body";
import { processProofImage } from "@/lib/server/proof-image";
import { proofLink } from "@/lib/server/proof-links";
import { uploadProof } from "@/lib/server/uploads";
import { saveDemoProofImage } from "@/lib/server/demo";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route(async request => {
  checkOrigin(request);
  const browserId=await requireBrowser();await limitRead(request,browserId);
  const form=await readProofBody(request);
  const parsed=proofSchema.safeParse({attemptId:form.get("attemptId"),proofId:form.get("proofId"),paymentMode:form.get("paymentMode"),website:form.get("website") || ""});
  if(!parsed.success)throw new AppError("INVALID_INPUT","Invalid upload fields.",400);
  const input=parsed.data;checkHoneypot(input.website);
  const verification=await rpc<Verification>("form_load_verification",{p_browser_id:browserId,p_attempt_id:input.attemptId});
  if(verification.status!=="verified" || Date.parse(verification.verificationExpiresAt || "")<=Date.now())
    throw new AppError("VERIFICATION_EXPIRED","Verify the phone before uploading.",410);
  await limitProofUpload(request,browserId,verification.phone);
  const file=form.get("image");
  if(!(file instanceof File))throw new AppError("INVALID_IMAGE","Choose a payment image.",400);
  const image=await processProofImage(Buffer.from(await file.arrayBuffer()));
  const lease=randomUUID();
  const reserved=await rpc<{ready:boolean;proof?:PaymentProof}>("form_reserve_proof",{p_browser_id:browserId,p_attempt_id:input.attemptId,p_proof_id:input.proofId,p_digest:image.digest,p_payment_mode:input.paymentMode,p_lease:lease});
  const cleanProof=(p:PaymentProof):PaymentProof=>({id:p.id,url:p.url,width:p.width,height:p.height,byteSize:p.byteSize});
  if(reserved.ready && reserved.proof)return {proof:cleanProof(reserved.proof)};
  let fileKey="";
  try {
    const uploaded=demoEnabled()?{key:input.proofId,url:`https://demo.ufs.sh/f/${input.proofId}`} : await uploadProof(input.proofId,image.data);
    fileKey=uploaded.key;
    const url=proofLink(appOrigin(),input.proofId,demoEnabled()?"local-demo-proof-links-only-not-production":required("OTP_HMAC_SECRET"));
    const proof=await rpc<PaymentProof>("form_finish_proof",{p_browser_id:browserId,p_proof_id:input.proofId,p_lease:lease,p_file_key:uploaded.key,p_file_url:uploaded.url,p_view_url:url,p_width:image.width,p_height:image.height,p_byte_size:image.byteSize});
    if(demoEnabled())saveDemoProofImage(input.proofId,image.data);
    return {proof:cleanProof(proof)};
  } catch(error) {
    // Never delete a possibly committed asset after a lost database response.
    // The orphan-cleanup job reconciles unclaimed assets later.
    if(!fileKey) {try{await rpc("form_fail_proof",{p_browser_id:browserId,p_proof_id:input.proofId,p_lease:lease});}catch{}}
    throw error;
  }
});
