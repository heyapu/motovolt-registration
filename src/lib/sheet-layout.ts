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
] as const;

export type HeaderAction =
  | "all"
  | "extra"
  | "new"
  | "variants"
  | "none";

export function headerAction(cells: unknown[]): HeaderAction {
  const values = cells.map(value => String(value ?? "").trim());

  if (values.every(value => !value)) {
    return "all";
  }

  for (const [length, action] of [
    [9, "extra"],
    [14, "new"],
    [17, "variants"],
  ] as const) {
    const prefixMatches = SHEET_HEADERS
      .slice(0, length)
      .every((header, index) => values[index] === header);

    const remainingEmpty = values
      .slice(length, SHEET_HEADERS.length)
      .every(value => !value);

    if (prefixMatches && remainingEmpty) {
      return action;
    }
  }

  if (
    SHEET_HEADERS.some(
      (header, index) => values[index] !== header,
    )
  ) {
    throw new Error("SHEETS_HEADER_MISMATCH");
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