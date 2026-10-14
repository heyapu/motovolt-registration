import { createHmac, timingSafeEqual } from "node:crypto";
export function proofSignature(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`motovolt-proof-view-v1:${id}`).digest("hex");
}
export function validProofSignature(id: string, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(proofSignature(id, secret)));
}
export function proofLink(origin: string, id: string, secret: string): string {
  const url = new URL("/api/proofs/view", origin);
  url.search = new URLSearchParams({ id, token: proofSignature(id, secret) }).toString();
  return url.toString();
}
export function matchesStoredProofToken(url: string, token: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  try {
    const expected = new URL(url).searchParams.get("token") || "";
    return /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(token),Buffer.from(expected));
  } catch {return false;}
}
