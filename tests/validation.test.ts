import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOtp, otpDigest } from "../src/lib/server/crypto";
import { demoEnabled } from "../src/lib/server/env";
import {
  fieldsSchema,
  normalizePhone,
  startSchema,
  submitSchema,
} from "../src/lib/validation";

test("normalization treats local, country-code and spaced numbers as the same phone", () => {
  for (const value of [
    "9876543210",
    "919876543210",
    "+91 98765-43210",
    "(98765) 43210",
  ])
    assert.equal(normalizePhone(value), "+919876543210");
  for (const value of [
    "1234567890",
    "+19876543210",
    "987654321000",
    "09876543210",
    "98765\n43210",
  ])
    assert.throws(() => normalizePhone(value));
});
test("payloads reject client-supplied dealer name, phone and verification claims", () => {
  const fields = {
    dealerId: "1", gender:"male", proofId:"", customerName: "Customer Name",
    email: "customer@example.com", age: "30", productId: "m7", colour:"Yellow",connectivity:"",rangeVariant:"",chargerType:"", batteryId: "BAT-001", vin: "VIN-001", paymentMode: "cash",
  };
  assert.equal(fieldsSchema.safeParse(fields).success, true);
  assert.equal(
    submitSchema.safeParse({
      ...fields,
      attemptId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      dealerName: "Forged Dealer",
      verified: true,
    }).success,
    false,
  );
  assert.equal(
    startSchema.safeParse({
      requestId: crypto.randomUUID(),
      phone: "9876543210",
      consent: false,
    }).success,
    false,
  );
  assert.equal(
    fieldsSchema.safeParse({ ...fields, customerName: "A\nB" }).success,
    false,
  );
});
test("OTP is cryptographically generated and the digest is bound to the whole challenge", () => {
  const old = process.env.OTP_HMAC_SECRET;
  process.env.OTP_HMAC_SECRET = "test-only-secret-at-least-32-characters-long";
  try {
    for (let i = 0; i < 50; i++) assert.match(generateOtp(), /^\d{6}$/);
    const base = otpDigest("attempt-a", "staff-a", "+919876543210", "012345");
    assert.equal(base.length, 64);
    assert.notEqual(
      base,
      otpDigest("attempt-b", "staff-a", "+919876543210", "012345"),
    );
    assert.notEqual(
      base,
      otpDigest("attempt-a", "staff-b", "+919876543210", "012345"),
    );
    assert.notEqual(
      base,
      otpDigest("attempt-a", "staff-a", "+919876543211", "012345"),
    );
  } finally {
    if (old === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = old;
  }
});
test("demo mode cannot activate under a production runtime", () => {
  const env = process.env as Record<string, string | undefined>;
  const oldMode = env.NODE_ENV,
    oldDemo = env.DEMO_MODE;
  env.NODE_ENV = "production";
  env.DEMO_MODE = "true";
  try {
    assert.throws(() => demoEnabled(), /forbidden/);
  } finally {
    env.NODE_ENV = oldMode;
    env.DEMO_MODE = oldDemo;
  }
});

test("customer fields normalize email/IDs and reject invalid age, product and payment", () => {
 const fields = {dealerId:"1",gender:"female",proofId:"",customerName:"Test Customer",email:" TEST@Example.com ",age:"30",productId:"urbn",colour:"Yellow",connectivity:"standard",rangeVariant:"",chargerType:"",batteryId:" bat-001 ",vin:"vin-001",paymentMode:"upi"};
 const result = fieldsSchema.parse(fields);
 // Dealer existence is checked by the database, so new IDs need no TS release.
 assert.equal(fieldsSchema.safeParse({...fields,dealerId:"266"}).success,true);
 assert.equal(result.email,"test@example.com"); assert.equal(result.batteryId,"BAT-001"); assert.equal(result.vin,"VIN-001");
 for(const bad of [{age:"30.5"},{age:"0"},{age:"121"},{email:"invalid"},{productId:"unknown"},{paymentMode:"crypto"},{vin:"bad space"},{vin:""},{batteryId:""},{gender:"other"},{dealerId:""},{dealerId:"bad id"}]) assert.equal(fieldsSchema.safeParse({...fields,...bad}).success,false);
});

test("finance requires a financer; cash needs no proof; new database Dealer IDs are accepted structurally", () => {
  const fields = { dealerId: "266", gender: "female", proofId: "", customerName: "Test Customer", email: "", age: "30", productId: "m7", colour: "Yellow", connectivity: "", rangeVariant: "", chargerType: "", batteryId: "BAT-NEW", vin: "VIN-NEW", paymentMode: "cash" };
  const ids = { attemptId: crypto.randomUUID(), requestId: crypto.randomUUID() };
  assert.equal(submitSchema.safeParse({ ...fields, ...ids }).success, true);
  assert.equal(submitSchema.safeParse({ ...fields, ...ids, paymentMode: "finance", financerName: "" }).success, false);
  assert.equal(submitSchema.safeParse({ ...fields, ...ids, paymentMode: "finance", financerName: "Bajaj Fin LTD" }).success, true);
  assert.equal(submitSchema.safeParse({ ...fields, ...ids, dealerName: "Forged" }).success, false);
});
