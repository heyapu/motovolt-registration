import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { required } from "./env";
import { createSheetWriter } from "./sheets-core";
import type { SheetJob } from "../types";

async function accessToken(): Promise<string> {
  const account = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (
    account.type !== "service_account" ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  )
    throw new Error("GOOGLE_CONFIGURATION_ERROR");
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string")
    throw new Error("GOOGLE_AUTH_FAILED");
  return result.access_token;
}
export async function sheetWriter(jobs: SheetJob[]): Promise<(job: SheetJob) => Promise<void>> {
  return createSheetWriter({ sheetId: required("GOOGLE_SHEET_ID"), tab: process.env.GOOGLE_SHEET_TAB || "Test Rides", accessToken: await accessToken() }, jobs);
}
