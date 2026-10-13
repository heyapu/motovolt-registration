import { z } from "zod";

export function normalizePhone(value: string): string {
  const cleaned = value.trim().replace(/[ ()-]/g, "");
  const local = cleaned.startsWith("+91") ? cleaned.slice(3) : cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
  if (!/^[6-9]\d{9}$/.test(local)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  return `+91${local}`;
}
const phoneSchema = z.string().max(24).transform((value, ctx) => {
  try { return normalizePhone(value); }
  catch { ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number." }); return z.NEVER; }
});
const identifier = z.string().trim().max(64, "Use at most 64 characters.").transform(v => v.toUpperCase()).refine(
  v => !v || /^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(v),
  "IDs can contain letters, numbers, dots, underscores, slashes and hyphens.",
);
export const startSchema = z.object({
  requestId: z.uuid(), phone: phoneSchema,
  captchaToken: z.string().max(2048).default(""),
  website: z.string().max(200).default(""),
  consent: z.literal(true, { error: "Confirm that the customer agrees to receive an OTP." }),
}).strict();
export const verifySchema = z.object({ attemptId: z.uuid(), code: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP.") }).strict();
export const fieldsSchema = z.object({
  dealerName: z.string().trim().min(2,"Enter the dealer or store name.").max(120).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Dealer name contains invalid characters."),
  customerName: z.string().trim().min(2, "Enter the customer’s name.").max(100).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Name contains invalid characters."),
  email: z.string().trim().max(254).pipe(z.email({ error: "Enter a valid email address." })).transform(v => v.toLowerCase()),
  age: z.string().trim().regex(/^\d{1,3}$/, "Enter age in whole years.").refine(v => Number(v) >= 1 && Number(v) <= 120, "Age must be between 1 and 120."),
  productId: z.enum(["urbn", "hum", "kivo", "m7"], { error: "Select a product." }),
  batteryId: identifier,
  vin: identifier,
  paymentMode: z.enum(["cash", "upi", "card", "finance"], { error: "Select a payment mode." }),
}).strict();
export const submitSchema = fieldsSchema.extend({ attemptId: z.uuid(), requestId: z.uuid(), website: z.string().max(200).default("") }).strict();
export const resumeSchema = z.object({ phone: phoneSchema }).strict();
export const existingSchema = z.object({
  phone: phoneSchema, batteryId: identifier.default(""), vin: identifier.default(""), attemptId: z.uuid(),
}).strict();
