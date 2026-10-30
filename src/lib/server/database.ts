import "server-only";
import { adminClient } from "./supabase";
import { demoEnabled } from "./env";
import { demoRpc } from "./demo";
import { AppError } from "./errors";

const messages: Record<string, [string, number]> = {
  MONTHLY_PURCHASE_LIMIT: ["This number has reached five purchases for this calendar month. Try again next month.", 409],
  INVALID_PRODUCT_OPTIONS: ["Choose all options for the selected product.", 400],
  INVALID_DEALER: ["Choose a dealer from the list.", 400],
  PROOF_REQUIRED: ["Upload the receipt or payment confirmation first.", 400],
  PROOF_MISMATCH: ["This image belongs to a different phone or payment mode. Choose the correct image.", 409],
  PROOF_PENDING: ["This image is still uploading. Please retry shortly.", 409],
  PROOF_LIMIT: ["Too many image uploads for this number. Please try later.", 429],
  PROOF_LEASE_EXPIRED: ["Image upload was interrupted. Please retry.", 409],
  DUPLICATE_PROOF: ["This payment image is already used for another entry. Upload the correct proof.", 409],
  ATTEMPT_NOT_FOUND: [
    "This verification could not be found. Request a new OTP.",
    404,
  ],
  IDEMPOTENCY_CONFLICT: [
    "This submission is already locked with different details.",
    409,
  ],
  VERIFICATION_EXPIRED: [
    "Verify the contact number again to submit. Your details have been kept.",
    410,
  ],
  INVALID_PRODUCT: ["Select an available product.", 400],
  INVALID_INPUT: ["Check the customer details.", 400],
  DUPLICATE_PHONE: ["This phone number is already registered.", 409],
  DUPLICATE_VIN: ["This VIN number is already registered.", 409],
  DUPLICATE_BATTERY: ["This Battery ID is already registered.", 409],
  OTP_PENDING: ["Another OTP request is processing for this number. Try again shortly.", 409],
  OTP_CHECK_EXPIRED: ["Verification was interrupted. Enter the code again or request a new OTP.", 409],
};
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (demoEnabled()) return demoRpc(name, args) as T;
  const { data, error } = await adminClient().rpc(name, args);
  if (error) {
    const code = Object.keys(messages).find((value) =>
      error.message.includes(value),
    );
    if (code) throw new AppError(code, messages[code][0], messages[code][1]);
    throw new AppError(
      "DATABASE_UNAVAILABLE",
      "Could not save or retrieve this entry. Please try again.",
      503,
    );
  }
  return data as T;
}
