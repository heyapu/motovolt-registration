import { createHmac, timingSafeEqual } from "node:crypto";
const TTL = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function mac(value: string, secret: string): string { return createHmac("sha256", secret).update(`public-browser-v1:${value}`).digest("hex"); }
export function signBrowser(id: string, secret: string, now = Date.now()): string {
  const value = `${id}.${Math.floor(now / 1000)}`;
  return `${value}.${mac(value, secret)}`;
}
export function verifyBrowser(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || value.length > 180) return null;
  const [id, stamp, signature, extra] = value.split(".");
  if (extra || !UUID.test(id || "") || !/^\d{10}$/.test(stamp || "") || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
  const elapsed = Math.floor(now / 1000) - Number(stamp);
  if (elapsed < 0 || elapsed >= TTL) return null;
  const expected = mac(`${id}.${stamp}`, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}
