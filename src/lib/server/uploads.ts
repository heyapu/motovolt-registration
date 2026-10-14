import "server-only";
import { UTApi, UTFile } from "uploadthing/server";
import { required } from "./env";
import { AppError } from "./errors";
const client = () => new UTApi({ token: required("UPLOADTHING_TOKEN"), logLevel: "Error", fetch: (url, init) =>
  fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) }) });
export async function uploadProof(id: string, bytes: Buffer): Promise<{ key: string; url: string }> {
  try {
    const file = new UTFile([new Uint8Array(bytes)], `${id}.webp`, { type: "image/webp", customId: `motovolt-proof:${id}` });
    const result = await client().uploadFiles(file, { ...(process.env.UPLOADTHING_FILE_ACL === "public-read" ? {} : { acl: "private" as const }), contentDisposition: "inline" });
    if (!result.data || result.error || result.data.type !== "image/webp" || !result.data.key || !result.data.ufsUrl) throw new Error("Upload failed");
    const url = new URL(result.data.ufsUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".ufs.sh")) throw new Error("Unexpected file host");
    return { key: result.data.key, url: url.toString() };
  } catch { throw new AppError("UPLOAD_UNAVAILABLE", "Could not upload the image. Check UploadThing configuration and retry.", 503); }
}
export async function deleteProofFile(key: string): Promise<void> {
  if (!key) return;
  const result = await client().deleteFiles(key);
  if (!result.success) throw new Error("UPLOAD_DELETE_FAILED");
}
export async function deleteProofById(id: string): Promise<void> {
  const result=await client().deleteFiles(`motovolt-proof:${id}`,{keyType:"customId"});
  if(!result.success)throw new Error("UPLOAD_DELETE_FAILED");
}
export async function readProofFile(key: string): Promise<Buffer> {
  const { ufsUrl } = await client().generateSignedURL(key, { expiresIn: 60 });
  const url = new URL(ufsUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ufs.sh")) throw new Error("Unexpected file host");
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("PROOF_UNAVAILABLE");
  if (Number(response.headers.get("content-length")) > 1024 * 1024) throw new Error("PROOF_TOO_LARGE");
  const chunks: Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
  if(!reader)throw new Error("PROOF_UNAVAILABLE");
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024){await reader.cancel();throw new Error("PROOF_TOO_LARGE");}chunks.push(value);}
  const bytes=Buffer.concat(chunks);
  if (bytes.subarray(0,4).toString()!=="RIFF" || bytes.subarray(8,12).toString()!=="WEBP") throw new Error("PROOF_INVALID_FORMAT");
  return bytes;
}
