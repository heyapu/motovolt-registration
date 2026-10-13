import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:3130";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0", "--port", "3130"], {
  env: { ...process.env, DEMO_MODE: "true", APP_ORIGIN: origin, PORTAL_API_TEST: "true", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "", checks = 0;
child.stdout.on("data", b => { output += b.toString(); });
child.stderr.on("data", b => { output += b.toString(); });
function browser() {
  let cookie = "";
  return async (path, body, headers = {}) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map(v => v.split(";")[0]).join("; ");
    let data = null;
    try { data = await response.json(); } catch {}
    return { status: response.status, data, headers: response.headers };
  };
}
function check(value, expected) { assert.equal(value, expected); checks++; }
async function main() {
  let connected = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error("Development server exited before testing.");
    try {
      if ((await fetch(origin + "/api/config", { signal: AbortSignal.timeout(1500) })).ok) { connected = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!connected) throw new Error("Local test server was not reachable.");
  const a = browser(), b = browser();
  const phone = "9876501234", attemptId = randomUUID();
  const start = { requestId: attemptId, phone, consent: true };
  check((await a("/api/otp/start", start)).status, 401);
  const form = await a("/api/form");
  check(form.status, 200); check(form.data.demo, true); check(form.data.products.length, 4);
  check(form.headers.get("cache-control"), "private, no-store, max-age=0");
  check(form.headers.getSetCookie()[0].includes("HttpOnly"), true);
  check((await a("/api/auth/login", {})).status, 404);
  check((await a("/api/otp/start", start, { Origin: "https://other.example" })).status, 403);
  check((await a("/api/otp/start", start, { Cookie: "mv_public_browser=forged" })).status, 401);
  check((await a("/api/otp/start", { ...start, website: "spam.example" })).status, 400);
  check((await a("/api/otp/start", { ...start, consent: false })).status, 400);
  const started = await a("/api/otp/start", start);
  check(started.status, 200); check(started.data.verification.status, "sent");
  check((await a("/api/otp/start", start)).data.verification.id, attemptId);
  check((await a("/api/otp/start", { ...start, requestId: randomUUID() })).status, 429);
  check((await a("/api/registrations/check", { phone })).status, 400);
  check((await a("/api/registrations/check", { phone, attemptId })).status, 410);
  check((await a("/api/otp/verify", { attemptId, code: "000000" })).status, 400);
  check((await a("/api/otp/verify", { attemptId, code: "123456" })).data.verification.status, "verified");
  check((await a("/api/otp/resume", { phone })).data.verification.id, attemptId);
  check((await a("/api/registrations/check", { phone, attemptId })).data.phoneExists, false);
  const requestId = randomUUID();
  const payload = { attemptId, requestId, dealerName: " Motovolt Kolkata ", customerName: "HTTP Smoke Test", email: "Smoke@Example.com", age: "32", productId: "m7", batteryId: "bat-smoke", vin: "vin-smoke", paymentMode: "upi" };
  check((await a("/api/submissions", { ...payload, verified: true })).status, 400);
  check((await a("/api/submissions", { ...payload, phone: "9999999999" })).status, 400);
  check((await a("/api/submissions", { ...payload, website: "spam.example" })).status, 400);
  const saved = await a("/api/submissions", payload);
  check(saved.status, 200); check(saved.data.receipt.id, requestId);
  check(saved.data.receipt.dealerName, "Motovolt Kolkata");
  check(saved.data.receipt.email, "smoke@example.com"); check(saved.data.receipt.vin, "VIN-SMOKE");
  check(saved.data.receipt.sheetStatus, "pending");
  check((await a("/api/submissions", payload)).data.receipt.id, requestId);
  check((await a("/api/submissions", { ...payload, dealerName: "Different Dealer" })).status, 409);
  check((await a("/api/submissions/status", { requestId })).data.receipt.id, requestId);
  check((await a("/api/otp/start", { ...start, requestId: randomUUID() })).status, 409);
  check((await a("/api/jobs/sheets", {})).status, 403);
  await b("/api/form");
  check((await b("/api/submissions/status", { requestId })).data.receipt, null);
  check((await b("/api/otp/resume", { phone })).data.verification, null);
  check((await b("/api/otp/verify", { attemptId, code: "123456" })).status, 404);
  check((await b("/api/otp/start", { ...start, requestId: randomUUID() })).status, 409);
  const nextPhone = "9876501235", nextAttempt = randomUUID();
  check((await b("/api/otp/start", { requestId: nextAttempt, phone: nextPhone, consent: true })).status, 200);
  check((await b("/api/otp/verify", { attemptId: nextAttempt, code: "123456" })).status, 200);
  const existing = await b("/api/registrations/check", { phone: nextPhone, attemptId: nextAttempt, vin: "vin-smoke", batteryId: "bat-smoke" });
  check(existing.data.vinExists, true); check(existing.data.batteryExists, true);
  check((await b("/api/submissions", { ...payload, requestId: randomUUID(), attemptId: nextAttempt })).status, 409);
  console.log(`Passed ${checks} HTTP checks against the isolated local demo. No external services were used.`);
}
try { await main(); }
catch (error) { console.error(error.message); if (output) console.error(output.slice(-3000)); process.exitCode = 1; }
finally { child.kill("SIGTERM"); }
