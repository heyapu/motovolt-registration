import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const DASHBOARD_TTL = 15 * 24 * 60 * 60;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const createSessionToken = () => randomBytes(32).toString("hex");
export async function verifyDashboardCode(
  code: string,
  encoded: string,
): Promise<boolean> {
  if (code.length < 12 || code.length > 64 || !/^[\x21-\x7e]+$/.test(code))
    return false;
  const match = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(
    encoded,
  );
  if (!match) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      code,
      Buffer.from(match[1], "hex"),
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
  return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}
