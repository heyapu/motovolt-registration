import { AppError } from "./errors";
import { MAX_PROOF_INPUT } from "./proof-image";
export async function readProofBody(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new AppError("INVALID_CONTENT_TYPE", "Upload an image using the form.", 415);
  const max = MAX_PROOF_INPUT + 8192;
  if (Number(request.headers.get("content-length")) > max) throw new AppError("BODY_TOO_LARGE", "The upload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_IMAGE", "Choose a payment image.", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) {await reader.cancel();throw new AppError("BODY_TOO_LARGE", "The upload is too large.", 413);}
    chunks.push(value);
  }
  let form: FormData;
  try {form=await new Response(Buffer.concat(chunks),{headers:{"content-type":type}}).formData();}
  catch {throw new AppError("INVALID_IMAGE", "Could not read this upload.", 400);}
  const allowed=["attemptId","proofId","paymentMode","website","image"];
  if ([...form.keys()].some(key=>!allowed.includes(key)) || allowed.some(key=>form.getAll(key).length>1))
    throw new AppError("INVALID_INPUT", "Invalid upload fields.",400);
  return form;
}
