import { SHEET_HEADERS, headerAction, assertFreeRow } from "../sheet-layout";
import type { SheetJob } from "../types";
export async function createSheetWriter(config: { sheetId: string; tab: string; accessToken: string }, jobs: SheetJob[], transport: typeof fetch = fetch): Promise<(job: SheetJob) => Promise<void>> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.sheetId)}`;
  const tab = `'${config.tab.replace(/'/g,"''")}'`;
  const headers = { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" };
  const request = (url: string, init: RequestInit = {}) => transport(url, { ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  const response = await request(`${base}?fields=sheets.properties`);
  if (!response.ok) throw new Error(`SHEETS_METADATA_${response.status}`);
  const metadata = await response.json();
  const target = metadata.sheets?.find((s: { properties: { title: string } }) => s.properties.title === config.tab)?.properties;
  if (!target?.gridProperties) throw new Error("SHEETS_TAB_NOT_FOUND");
  const largest = Math.max(...jobs.map(j => j.row));
  if (!Number.isSafeInteger(largest) || largest < 2) throw new Error("INVALID_SHEET_ROW");
  if (largest > target.gridProperties.rowCount || target.gridProperties.columnCount < 14) {
    const grown = await request(`${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: {
      properties: { sheetId: target.sheetId, gridProperties: { rowCount: Math.max(target.gridProperties.rowCount,largest+1000), columnCount: Math.max(target.gridProperties.columnCount,14) } }, fields: "gridProperties.rowCount,gridProperties.columnCount",
    } }] }) });
    if (!grown.ok) throw new Error(`SHEETS_RESIZE_${grown.status}`);
  }
  const headerRange = `${tab}!A1:N1`;
  const found = await request(`${base}/values/${encodeURIComponent(headerRange)}`);
  if (!found.ok) throw new Error(`SHEETS_HEADERS_${found.status}`);
  const foundValues = await found.json();
  const action = headerAction(foundValues.values?.[0] || []);
  if (action !== "none") {
    const range = action === "all" ? headerRange : `${tab}!J1:N1`;
    const saved = await request(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values: [action === "all" ? SHEET_HEADERS : SHEET_HEADERS.slice(9)] }) });
    if (!saved.ok) throw new Error(`SHEETS_HEADERS_${saved.status}`);
  }
  return async job => {
    if (!Number.isSafeInteger(job.row) || job.row < 2 || job.values.length !== 14 || job.values[0] !== job.submissionId) throw new Error("SHEETS_INVALID_JOB");
    const range = `${tab}!A${job.row}:N${job.row}`;
    const occupied = await request(`${base}/values/${encodeURIComponent(range)}`);
    if (!occupied.ok) throw new Error(`SHEETS_READ_${occupied.status}`);
    const existing = await occupied.json();
    assertFreeRow(existing.values?.[0] || [],job.submissionId);
    const write = await request(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values: [job.values] }) });
    if (!write.ok) throw new Error(`SHEETS_WRITE_${write.status}`);
  };
}
