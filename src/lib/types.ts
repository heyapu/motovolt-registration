export type Product = { id: string; name: string };
export type Verification = {
  id: string;
  phone: string;
  status: "pending" | "sent" | "checking" | "verified" | "failed" | "locked" | "superseded" | "consumed";
  otpExpiresAt: string;
  verificationExpiresAt: string | null;
  verifiedAt: string | null;
  attemptsRemaining?: number;
};
export type RegistrationFields = {
  dealerName: string;
  customerName: string;
  email: string;
  age: string;
  productId: string;
  batteryId: string;
  vin: string;
  paymentMode: "" | "cash" | "upi" | "card" | "finance";
};
export type Receipt = {
  id: string;
  dealerName: string;
  phone: string;
  customerName: string;
  email: string;
  age: number;
  productName: string;
  batteryId: string | null;
  vin: string | null;
  paymentMode: "cash" | "upi" | "card" | "finance";
  submittedAt: string;
  sheetStatus: "pending" | "processing" | "done" | "needs_attention";
};
export type FormContext = { browserId: string; products: Product[]; demo: boolean; turnstileSiteKey: string | null };
export type SavedDraft = {
  browserId: string;
  requestId: string;
  verification: Verification;
  fields: RegistrationFields;
  queued: boolean;
  savedAt: number;
};
export type ExistingCheck = { phoneExists: boolean; batteryExists: boolean; vinExists: boolean };
export type SheetJob = { submissionId: string; row: number; values: string[] };
export const PAYMENT_LABELS = { cash: "Cash", upi: "UPI", card: "Credit Card / Debit Card", finance: "Finance" } as const;
