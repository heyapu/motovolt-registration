import { test } from "node:test";
import assert from "node:assert/strict";
import { sendWithMsg91, verifyWithMsg91, type Fetcher } from "../src/lib/server/msg91";
const cfg={authKey:"fake-secret",templateId:"a".repeat(24)};
const transport=(value:unknown,status=200)=> (async()=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}})) as Fetcher;
test("SendOTP uses the OTP endpoint, custom six-digit code and matching 10-minute expiry",async()=>{
 const fetcher:Fetcher=async(input,init)=>{
  const u=new URL(String(input));assert.equal(u.pathname,"/api/v5/otp");assert.equal(u.searchParams.get("template_id"),cfg.templateId);assert.equal(u.searchParams.get("mobile"),"919876543210");assert.equal(u.searchParams.get("otp"),"012345");assert.equal(u.searchParams.get("otp_expiry"),"10");assert.equal(u.searchParams.get("otp_length"),"6");assert.equal(u.searchParams.has("authkey"),false);assert.equal(init?.method,"POST");assert.equal(new Headers(init?.headers).get("authkey"),cfg.authKey);
  return new Response(JSON.stringify({type:"success",message:"request-id"}));
 };await sendWithMsg91(cfg,"+919876543210","012345",fetcher);
});
test("HTTP 200 provider errors, malformed responses and redirects fail closed",async()=>{
 for(const value of [{type:"error",message:"invalid_template"},{type:"success"},{message:"accepted"}])await assert.rejects(sendWithMsg91(cfg,"+919876543210","123456",transport(value)));
 await assert.rejects(sendWithMsg91(cfg,"+919876543210","123456",transport({type:"success",message:"id"},403)));
});
test("VerifyOTP does not accept arbitrary provider success or errors",async()=>{
 for(const message of ["otp_verified","OTP verified success","number_verified_successfully"]) assert.equal(await verifyWithMsg91(cfg,"+919876543210","123456",transport({type:"success",message})),true);
 for(const value of [{type:"success",message:"queued"},{type:"error",message:"otp_invalid"},{type:"success"}])assert.equal(await verifyWithMsg91(cfg,"+919876543210","123456",transport(value)),false);
});
test("a known already-verified result supports lost-response recovery only after the caller's digest check",async()=>{
 assert.equal(await verifyWithMsg91(cfg,"+919876543210","123456",transport({type:"error",message:"Mobile no. already verified"})),true);
});
