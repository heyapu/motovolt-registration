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

export async function createSheetWriter(
  config: SheetConfig,
  jobs: SheetJob[],
  transport: typeof fetch = fetch,
): Promise<(job: SheetJob) => Promise<void>> {
  const columnCount = SHEET_HEADERS.length;

  const base =
    `https://sheets.googleapis.com/v4/spreadsheets/` +
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

  const response = await request(`${base}?fields=sheets.properties`);

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

  if (
    !jobs.length ||
    jobs.some(job => !Number.isSafeInteger(job.row) || job.row < 2)
  ) {
    throw new Error("INVALID_SHEET_ROW");
  }

  const largest = Math.max(...jobs.map(job => job.row));

  if (
    largest > target.gridProperties.rowCount ||
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
                  rowCount: Math.max(
                    target.gridProperties.rowCount,
                    largest + 1000,
                  ),
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

  const headerRange = `${tab}!A1:U1`;

  const found = await request(
    `${base}/values/${encodeURIComponent(headerRange)}`,
  );

  if (!found.ok) {
    throw new Error(`SHEETS_HEADERS_${found.status}`);
  }

  const foundValues = await found.json();
  const action = headerAction(foundValues.values?.[0] || []);

  if (action !== "none") {
    const startIndex =
      action === "all" ? 0 :
        action === "variants" ? 17 :
          action === "new" ? 14 :
            9;

    const startColumn =
      action === "all" ? "A" :
        action === "variants" ? "R" :
          action === "new" ? "O" :
            "J";

    const range = `${tab}!${startColumn}1:U1`;

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
    if (
      !Number.isSafeInteger(job.row) ||
      job.row < 2 ||
      job.values.length !== columnCount ||
      job.values[0] !== job.submissionId
    ) {
      throw new Error("SHEETS_INVALID_JOB");
    }

    const range = `${tab}!A${job.row}:U${job.row}`;

    const occupied = await request(
      `${base}/values/${encodeURIComponent(range)}`,
    );

    if (!occupied.ok) {
      throw new Error(`SHEETS_READ_${occupied.status}`);
    }

    const existing = await occupied.json();

    assertFreeRow(existing.values?.[0] || [], job.submissionId);

    const write = await request(
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

    if (!write.ok) {
      throw new Error(`SHEETS_WRITE_${write.status}`);
    }
  };
}