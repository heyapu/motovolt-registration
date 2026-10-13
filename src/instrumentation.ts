export function register() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true")
    throw new Error("DEMO_MODE must never be enabled in production.");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.OTP_PROVIDER &&
    process.env.OTP_PROVIDER !== "msg91"
  )
    throw new Error("A mock OTP provider is forbidden in production.");
}
