export const SHEET_HEADERS = [
  "Record ID",
  "Dealer name",
  "Contact number",
  "Customer name",
  "Vehicle name",
  "Test ride on",
  "Verified at",
  "Submitted at",
  "Staff ID",
  "Email",
  "Age",
  "Battery ID",
  "VIN number",
  "Payment mode",
  "Gender",
  "Payment proof",
  "Dealer ID",
  "Colour",
  "Connectivity",
  "Range",
  "Charger",
  "Financer name",
] as const;

export type HeaderAction = "all" | "tail" | "none";

export function headerAction(cells: unknown[]): HeaderAction {
  const values = Array.from(
    { length: SHEET_HEADERS.length },
    (_, index) => String(cells[index] ?? "").trim(),
  );

  // Existing non-empty headers must match their expected positions.
  for (let index = 0; index < SHEET_HEADERS.length; index++) {
    if (
      values[index] !== "" &&
      values[index] !== SHEET_HEADERS[index]
    ) {
      throw new Error("SHEETS_HEADER_MISMATCH");
    }
  }

  if (values.every(value => value === "")) {
    return "all";
  }

  if (values.some(value => value === "")) {
    return "tail";
  }

  return "none";
}

export function assertFreeRow(
  cells: unknown[],
  recordId: string,
): void {
  const occupied = cells.some(
    value => value !== "" && value !== null && value !== undefined,
  );

  if (occupied && cells[0] !== recordId) {
    throw new Error("SHEETS_ROW_OCCUPIED");
  }
}