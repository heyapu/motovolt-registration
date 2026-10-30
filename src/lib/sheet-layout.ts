export const SHEET_HEADERS = ["Record ID", "Dealer name", "Contact number", "Customer name", "Vehicle name", "Test ride on", "Verified at", "Submitted at", "Staff ID", "Email", "Age", "Battery ID", "VIN number", "Payment mode", "Gender", "Payment proof", "Dealer ID", "Colour", "Connectivity", "Range", "Charger"] as const;
export type HeaderAction = "all" | "extra" | "new" | "variants" | "none";
export function headerAction(cells: unknown[]): HeaderAction {
  const values = cells.map(v => String(v ?? "").trim());
  if (values.every(v => !v)) return "all";
  for (const [length,action] of [[9,"extra"],[14,"new"],[17,"variants"]] as const) {
    if (SHEET_HEADERS.slice(0,length).every((v,i)=>values[i]===v) && values.slice(length,21).every(v=>!v)) return action;
  }
  if (SHEET_HEADERS.some((v,i) => values[i] !== v)) throw new Error("SHEETS_HEADER_MISMATCH");
  return "none";
}
export function assertFreeRow(cells: unknown[], recordId: string): void {
  if (cells.some(v => v !== "" && v !== null && v !== undefined) && cells[0] !== recordId) throw new Error("SHEETS_ROW_OCCUPIED");
}
