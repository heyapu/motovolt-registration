export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    const multipart = body instanceof FormData;
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined || multipart ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body),
      signal: AbortSignal.timeout(path === "/api/proofs" ? 55000 : 30000),
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Connection interrupted. Your entry has not yet been confirmed.",
      0,
    );
  }
  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "INVALID_RESPONSE",
      "Could not confirm this request. Please try again.",
      response.status,
    );
  }
  if (!response.ok) {
    const error = data.error as { code?: string; message?: string } | undefined;
    throw new ApiError(
      error?.code || "REQUEST_FAILED",
      error?.message || "Could not complete this request.",
      response.status,
      Number(response.headers.get("retry-after") || 0),
    );
  }
  return data as T;
}
