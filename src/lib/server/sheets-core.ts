import {
  SHEET_HEADERS,
  headerAction,
  assertFreeRow,
} from "../sheet-layout";
import type { SheetJob } from "../types";

type SheetConfig = {
  sheetId: string;
  tab: string;
  accessToken: string;
};

type SheetProperties = {
  sheetId: number;
  title: string;
  gridProperties?: {
    rowCount: number;
    columnCount: number;
  };
};

type SheetValues = {
  values?: unknown[][];
};

export async function createSheetWriter(
  config: SheetConfig,
  jobs: SheetJob[],
  transport: typeof fetch = fetch,
): Promise<(job: SheetJob) => Promise<void>> {
  const columnCount = SHEET_HEADERS.length;

  // Convert a column number to its A1 label: 1 → A, 22 → V.
  const columnLabel = (number: number): string => {
    let label = "";

    while (number > 0) {
      number--;
      label =
        String.fromCharCode(65 + (number % 26)) + label;
      number = Math.floor(number / 26);
    }

    return label;
  };

  const lastColumn = columnLabel(columnCount);

  const validateJob = (job: SheetJob): void => {
    if (
      !Number.isSafeInteger(job.row) ||
      job.row < 2 ||
      !Array.isArray(job.values) ||
      job.values.length !== columnCount ||
      job.values[0] !== job.submissionId
    ) {
      throw new Error("SHEETS_INVALID_JOB");
    }
  };

  if (!jobs.length) {
    throw new Error("SHEETS_INVALID_JOB");
  }

  jobs.forEach(validateJob);

  const base =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(config.sheetId);

  const tab = `'${config.tab.replace(/'/g, "''")}'`;

  const headers = {
    Authorization: `Bearer ${config.accessToken}`,
    "Content-Type": "application/json",
  };

  const request = (url: string, init: RequestInit = {}) =>
    transport(url, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });

  const response = await request(
    `${base}?fields=sheets.properties`,
  );

  if (!response.ok) {
    throw new Error(`SHEETS_METADATA_${response.status}`);
  }

  const metadata = (await response.json()) as {
    sheets?: Array<{ properties: SheetProperties }>;
  };

  const target = metadata.sheets?.find(
    sheet => sheet.properties.title === config.tab,
  )?.properties;

  if (!target?.gridProperties) {
    throw new Error("SHEETS_TAB_NOT_FOUND");
  }

  const largestRow = Math.max(...jobs.map(job => job.row));

  if (
    largestRow > target.gridProperties.rowCount ||
    target.gridProperties.columnCount < columnCount
  ) {
    const grown = await request(`${base}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: target.sheetId,
                gridProperties: {
                  rowCount:
                    largestRow > target.gridProperties.rowCount
                      ? largestRow + 1000
                      : target.gridProperties.rowCount,
                  columnCount: Math.max(
                    target.gridProperties.columnCount,
                    columnCount,
                  ),
                },
              },
              fields:
                "gridProperties.rowCount,gridProperties.columnCount",
            },
          },
        ],
      }),
    });

    if (!grown.ok) {
      throw new Error(`SHEETS_RESIZE_${grown.status}`);
    }
  }

  const headerRange = `${tab}!A1:${lastColumn}1`;

  const found = await request(
    `${base}/values/${encodeURIComponent(headerRange)}`,
  );

  if (!found.ok) {
    throw new Error(`SHEETS_HEADERS_${found.status}`);
  }

  const foundValues = (await found.json()) as SheetValues;
  const currentHeaders = foundValues.values?.[0] || [];
  const action = headerAction(currentHeaders);

  if (action !== "none") {
    const startIndex = SHEET_HEADERS.findIndex(
      (_, index) =>
        String(currentHeaders[index] ?? "").trim() === "",
    );

    if (startIndex < 0) {
      throw new Error("SHEETS_HEADER_MISMATCH");
    }

    const startColumn = columnLabel(startIndex + 1);
    const range = `${tab}!${startColumn}1:${lastColumn}1`;

    const saved = await request(
      `${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({
          range,
          majorDimension: "ROWS",
          values: [SHEET_HEADERS.slice(startIndex)],
        }),
      },
    );

    if (!saved.ok) {
      throw new Error(`SHEETS_HEADERS_${saved.status}`);
    }
  }

  return async job => {
    validateJob(job);

    const range =
      `${tab}!A${job.row}:${lastColumn}${job.row}`;

    const occupied = await request(
      `${base}/values/${encodeURIComponent(range)}`,
    );

    if (!occupied.ok) {
      throw new Error(`SHEETS_READ_${occupied.status}`);
    }

    const existing = (await occupied.json()) as SheetValues;

    // Prevent overwriting a row belonging to another registration.
    assertFreeRow(
      existing.values?.[0] || [],
      job.submissionId,
    );

    const written = await request(
      `${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({
          range,
          majorDimension: "ROWS",
          values: [job.values],
        }),
      },
    );

    if (!written.ok) {
      throw new Error(`SHEETS_WRITE_${written.status}`);
    }
  };
}