import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { demoEnabled, required } from "./env";
import { AppError } from "./errors";
import { signBrowser, verifyBrowser, BROWSER_TTL } from "./browser-core";
const COOKIE = "mv_public_browser";
const secret = () => demoEnabled() ? "public-local-demo-only-not-a-production-secret" : required("OTP_HMAC_SECRET");
// This is an anonymous browser binding, not an account or staff authentication.
export async function openBrowser(): Promise<string> {
  const jar = await cookies();
  const existing = verifyBrowser(jar.get(COOKIE)?.value, secret());
  const id = existing || randomUUID();
  jar.set(COOKIE, signBrowser(id, secret()), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: BROWSER_TTL });
  return id;
}
export async function requireBrowser(): Promise<string> {
  const id = verifyBrowser((await cookies()).get(COOKIE)?.value, secret());
  if (!id) throw new AppError("BROWSER_EXPIRED", "Reload the form to continue.", 401);
  return id;
}
