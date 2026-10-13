import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";
import { demoEnabled, required } from "./env";
import { privateKey } from "./crypto";
import { AppError } from "./errors";

type Limit = { key: string; max: number; windowMs: number };
// One atomic transaction checks EVERY dimension before charging any dimension.
const script = `
local stamp = redis.call('TIME')
local now = tonumber(stamp[1]) * 1000 + math.floor(tonumber(stamp[2]) / 1000)
local wait = 0
for i, key in ipairs(KEYS) do
  local max = tonumber(ARGV[(i-1)*2+1])
  local window = tonumber(ARGV[(i-1)*2+2])
  redis.call('ZREMRANGEBYSCORE',key,'-inf',now-window)
  if redis.call('ZCARD',key) >= max then
    local oldest = redis.call('ZRANGE',key,0,0,'WITHSCORES')
    wait = math.max(wait,tonumber(oldest[2])+window-now)
  end
end
if wait > 0 then return {0,wait} end
for i, key in ipairs(KEYS) do
  local window = tonumber(ARGV[(i-1)*2+2])
  redis.call('ZADD',key,now,ARGV[#KEYS*2+1])
  redis.call('PEXPIRE',key,window)
end
return {1,0}
`;
const localLimits = new Map<string, number[]>();
export function clientIp(request: Request): string {
  // This header is trusted ONLY when the app is actually running behind Vercel.
  if (process.env.VERCEL === "1") {
    const value = request.headers
      .get("x-vercel-forwarded-for")
      ?.split(",")[0]
      .trim();
    if (value && isIP(value)) return value;
  }
  // Do not trust caller-supplied x-forwarded-for on arbitrary hosts.
  return process.env.NODE_ENV !== "production"
    ? "localhost"
    : "shared-untrusted-ingress";
}
export async function enforce(limits: Limit[]): Promise<void> {
  const keys = limits.map((v) => `{motovolt-public}:rate:${privateKey(v.key)}`);
  let result: number[];
  if (demoEnabled()) {
    const now = Date.now();
    let wait = 0;
    limits.forEach((v, i) => {
      const history = (localLimits.get(keys[i]) || []).filter(
        (t) => t > now - v.windowMs,
      );
      localLimits.set(keys[i], history);
      if (history.length >= v.max)
        wait = Math.max(wait, history[0] + v.windowMs - now);
    });
    if (!wait) keys.forEach((key) => localLimits.get(key)!.push(now));
    result = [wait ? 0 : 1, wait];
  } else {
    try {
      const redis = new Redis({
        url: required("UPSTASH_REDIS_REST_URL"),
        token: required("UPSTASH_REDIS_REST_TOKEN"),
        retry: { retries: 0 },
        signal: AbortSignal.timeout(5000),
      });
      result = await redis.eval<(number | string)[], number[]>(script, keys, [
        ...limits.flatMap((v) => [v.max, v.windowMs]),
        randomUUID(),
      ]);
      if (!Array.isArray(result) || result.length !== 2)
        throw new Error("Unexpected limiter response");
    } catch {
      throw new AppError(
        "RATE_LIMIT_UNAVAILABLE",
        "Temporarily unable to accept requests. Please try again shortly.",
        503,
      );
    }
  }
  if (!result[0])
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait before trying again.",
      429,
      Math.max(1, Math.ceil(result[1] / 1000)),
    );
}
export async function limitRead(
  request: Request,
  browserId: string,
): Promise<void> {
  await enforce([
    { key: `read:browser:${browserId}`, max: 100, windowMs: 60000 },
    { key: `read:ip:${clientIp(request)}`, max: 300, windowMs: 60000 },
  ]);
}
export async function limitSend(
  request: Request,
  browserId: string,
  phone: string,
): Promise<void> {
  const daily = Number(process.env.OTP_DAILY_SEND_LIMIT || 1000);
  if (!Number.isInteger(daily) || daily < 1)
    throw new AppError(
      "CONFIGURATION_ERROR",
      "OTP sending is unavailable.",
      503,
    );
  await enforce([
    { key: `sms:cooldown:${phone}`, max: 1, windowMs: 60000 },
    { key: `sms:phone:${phone}`, max: 3, windowMs: 900000 },
    { key: `sms:browser:${browserId}`, max: 5, windowMs: 900000 },
    { key: `sms:ip:${clientIp(request)}`, max: 10, windowMs: 900000 },
    { key: "sms:global", max: daily, windowMs: 86400000 },
  ]);
}
export async function limitVerify(
  request: Request,
  browserId: string,
): Promise<void> {
  await enforce([
    { key: `verify:browser:${browserId}`, max: 30, windowMs: 900000 },
    { key: `verify:ip:${clientIp(request)}`, max: 120, windowMs: 900000 },
  ]);
}
export async function limitSubmit(
  request: Request,
  browserId: string,
): Promise<void> {
  await enforce([
    { key: `submit:browser:${browserId}`, max: 30, windowMs: 60000 },
    { key: `submit:ip:${clientIp(request)}`, max: 120, windowMs: 60000 },
  ]);
}
