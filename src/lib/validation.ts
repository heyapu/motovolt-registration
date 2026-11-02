import { z } from "zod";
import { PRODUCT_IDS, validProductChoices } from "./product-catalog";
import { getDealer } from "./dealers";

export function normalizePhone(value: string): string {
  const cleaned = value.trim().replace(/[ ()-]/g, "");

  const local = cleaned.startsWith("+91")
    ? cleaned.slice(3)
    : cleaned.startsWith("91") && cleaned.length === 12
      ? cleaned.slice(2)
      : cleaned;

  if (!/^[6-9]\d{9}$/.test(local)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }

  return `+91${local}`;
}

const phoneSchema = z.string().max(24).transform((value, ctx) => {
  try {
    return normalizePhone(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid Indian mobile number.",
    });

    return z.NEVER;
  }
});

const identifier = z
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")
  .transform(value => value.toUpperCase())
  .refine(
    value => !value || /^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(value),
    "IDs can contain letters, numbers, dots, underscores, slashes and hyphens.",
  );

export const startSchema = z
  .object({
    requestId: z.uuid(),
    phone: phoneSchema,
    captchaToken: z.string().max(2048).default(""),
    website: z.string().max(200).default(""),
    consent: z.literal(true, {
      error: "Confirm that the customer agrees to receive an OTP.",
    }),
  })
  .strict();

export const verifySchema = z
  .object({
    attemptId: z.uuid(),
    code: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP."),
  })
  .strict();

export const fieldsSchema = z
  .object({
    dealerId: z
      .string()
      .max(64)
      .refine(
        value => Boolean(getDealer(value)),
        "Choose a dealer from the list.",
      ),

    gender: z.enum(["male", "female", "non_binary"], {
      error: "Select a gender.",
    }),

    // Retained for compatibility with existing drafts.
    // An uploaded proof is no longer required.
    proofId: z.string().max(36).default(""),

    customerName: z
      .string()
      .trim()
      .min(2, "Enter the customer’s name.")
      .max(100)
      .refine(
        value => !/[\u0000-\u001f\u007f]/.test(value),
        "Name contains invalid characters.",
      ),

    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        value => value === "" || z.email().safeParse(value).success,
        "Enter a valid email address or leave it blank.",
      )
      .transform(value => value.toLowerCase())
      .default(""),

    age: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Enter age in whole years.")
      .refine(
        value => Number(value) >= 1 && Number(value) <= 120,
        "Age must be between 1 and 120.",
      ),

    productId: z.enum(PRODUCT_IDS, {
      error: "Select a product.",
    }),

    colour: z.string().max(40),

    connectivity: z.enum(["", "standard", "smart_plus"]),

    rangeVariant: z.enum(["", "normal", "long"]),

    chargerType: z.enum(["", "normal", "fast"]),

    batteryId: identifier.refine(
      value => Boolean(value),
      "Battery ID is required.",
    ),

    vin: identifier.refine(
      value => Boolean(value),
      "VIN number is required.",
    ),

    paymentMode: z.enum(["cash", "upi", "card", "finance"], {
      error: "Select a payment mode.",
    }),

    financerName: z
      .string()
      .trim()
      .max(120, "Use at most 120 characters.")
      .refine(
        value => !/[\u0000-\u001f\u007f]/.test(value),
        "Financer name contains invalid characters.",
      )
      .default(""),
  })
  .strict()
  .refine(validProductChoices, {
    message: "Choose all options for the selected product.",
    path: ["colour"],
  })
  .refine(
    value =>
      value.paymentMode !== "finance" ||
      value.financerName.length >= 2,
    {
      message: "Enter the financer name.",
      path: ["financerName"],
    },
  );

export const submitSchema = fieldsSchema
  .safeExtend({
    attemptId: z.uuid(),
    requestId: z.uuid(),
    website: z.string().max(200).default(""),
  })
  .strict();

// Retained so existing imports continue to compile.
// This schema does not make proof mandatory for registration.
export const proofSchema = z
  .object({
    attemptId: z.uuid(),
    proofId: z.uuid(),
    paymentMode: z.enum(["cash", "upi", "card", "finance"]),
    website: z.string().max(200).default(""),
  })
  .strict();

export const resumeSchema = z
  .object({
    phone: phoneSchema,
  })
  .strict();

export const existingSchema = z
  .object({
    phone: phoneSchema,
    batteryId: identifier.default(""),
    vin: identifier.default(""),
    attemptId: z.uuid(),
  })
  .strict();