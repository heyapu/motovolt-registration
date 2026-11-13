import { randomBytes, scrypt } from "node:crypto";
export async function hashResetAccessCode(code: string): Promise<string> {
  if (!/^[\x21-\x7e]{12,64}$/.test(code)) throw new Error("INVALID_ACCESS_CODE");
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(code, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => error ? reject(error) : resolve(value));
  });
  return `scrypt$32768$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
