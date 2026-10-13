import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";
import { appOrigin } from "./env";

export function checkOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    !origin ||
    origin !== appOrigin() ||
    (site && site !== "same-origin" && site !== "none")
  ) {
    throw new AppError(
      "INVALID_ORIGIN",
      "This request could not be accepted.",
      403,
    );
  }
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (
    !request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .match(/^application\/json$/i)
  )
    throw new AppError("INVALID_CONTENT_TYPE", "Send a JSON request.", 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8192)
    throw new AppError("BODY_TOO_LARGE", "Request is too large.", 413);
  const reader = request.body?.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8192) {
        await reader.cancel();
        throw new AppError("BODY_TOO_LARGE", "Request is too large.", 413);
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks);
  let body: unknown;
  try {
    body = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new AppError("INVALID_JSON", "Invalid request.");
  }
  const result = schema.safeParse(body);
  if (!result.success)
    throw new AppError(
      "INVALID_INPUT",
      result.error.issues[0]?.message || "Check the form fields.",
    );
  return result.data;
}
export function json(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}
export function route(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request): Promise<NextResponse> => {
    const requestId = randomUUID();
    try {
      return json(await handler(request));
    } catch (error) {
      if (error instanceof AppError) {
        const response = json(
          { error: { code: error.code, message: error.message, requestId } },
          error.status,
        );
        if (error.retryAfter)
          response.headers.set("Retry-After", String(error.retryAfter));
        return response;
      }
      // Never log payloads, phone numbers, OTPs, upstream URLs or credentials.
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId,
          category:
            error instanceof Error &&
            error.message.startsWith("Missing configuration")
              ? "configuration"
              : "internal",
        }),
      );
      return json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "The service is unavailable. Please keep this page open and try again.",
            requestId,
          },
        },
        503,
      );
    }
  };
}
