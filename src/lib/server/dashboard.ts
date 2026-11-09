import "server-only";
import { cookies } from "next/headers";
import { adminClient } from "./supabase";
import { AppError } from "./errors";
import { tokenHash } from "./dashboard-crypto";
export const DASHBOARD_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-mv_dashboard"
    : "mv_dashboard_dev";
export async function dashboardRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await adminClient().rpc(name, args);
  if (error) {
    if (error.message.includes("DASHBOARD_UNAUTHORIZED"))
      throw new AppError(
        "DASHBOARD_UNAUTHORIZED",
        "Enter the access code to continue.",
        401,
      );
    if (error.message.includes("DASHBOARD_BUSY"))
      throw new AppError(
        "DASHBOARD_BUSY",
        "Analytics are updating. Try again in a few seconds.",
        503,
        5,
      );
    throw new AppError(
      "DASHBOARD_UNAVAILABLE",
      "Dashboard unavailable. Check the dashboard migration and configuration.",
      503,
    );
  }
  return data as T;
}
export async function sessionHash(): Promise<string> {
  const value = (await cookies()).get(DASHBOARD_COOKIE)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new AppError(
      "DASHBOARD_UNAUTHORIZED",
      "Enter the access code to continue.",
      401,
    );
  return tokenHash(value);
}
export const dashboardPreview = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.DASHBOARD_PREVIEW === "true";
