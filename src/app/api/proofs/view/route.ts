import { z } from "zod";
import { demoEnabled } from "@/lib/server/env";
import { matchesStoredProofToken } from "@/lib/server/proof-links";
import { rpc } from "@/lib/server/database";
import { readProofFile } from "@/lib/server/uploads";
import { readDemoProofImage } from "@/lib/server/demo";
import { enforce, clientIp } from "@/lib/server/limits";
import { AppError } from "@/lib/server/errors";
import { json } from "@/lib/server/http";
export const runtime="nodejs";
export async function GET(request: Request): Promise<Response> {
  try {
    const url=new URL(request.url),id=url.searchParams.get("id") || "",token=url.searchParams.get("token") || "";
    if(!z.uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(token))
      return json({error:{code:"NOT_FOUND",message:"Image unavailable."}},404);
    await enforce([{key:`proof-view:ip:${clientIp(request)}`,max:120,windowMs:60000}]);
    const proof=await rpc<{key:string;url:string}|null>("form_get_proof",{p_proof_id:id});
    if(!proof || !matchesStoredProofToken(proof.url,token))return json({error:{code:"NOT_FOUND",message:"Image unavailable."}},404);
    const bytes=demoEnabled()?readDemoProofImage(id):await readProofFile(proof.key);
    if(!bytes)return json({error:{code:"NOT_FOUND",message:"Image unavailable."}},404);
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Disposition":"inline; filename=payment-proof.webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
  } catch(error) {
    if(error instanceof AppError)return json({error:{code:error.code,message:error.message}},error.status);
    return json({error:{code:"PROOF_UNAVAILABLE",message:"Image temporarily unavailable. Please try again."}},503);
  }
}
