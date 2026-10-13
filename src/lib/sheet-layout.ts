export const SHEET_HEADERS = ["Record ID", "Dealer name", "Contact number", "Customer name", "Vehicle name", "Test ride on", "Verified at", "Submitted at", "Staff ID", "Email", "Age", "Battery ID", "VIN number", "Payment mode"] as const;
export function headerAction(cells: unknown[]): "all" | "extra" | "none" {
  const values = cells.map(v => String(v ?? "").trim());
  if (values.every(v => !v)) return "all";
  if (SHEET_HEADERS.slice(0,9).some((v,i) => values[i] !== v)) throw new Error("SHEETS_HEADER_MISMATCH");
  if (values.slice(9,14).every(v => !v)) return "extra";
  if (SHEET_HEADERS.some((v,i) => values[i] !== v)) throw new Error("SHEETS_HEADER_MISMATCH");
  return "none";
}
export function assertFreeRow(cells: unknown[], recordId: string): void {
  if (cells.some(v => v !== "" && v !== null && v !== undefined) && cells[0] !== recordId) throw new Error("SHEETS_ROW_OCCUPIED");
}
