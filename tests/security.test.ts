import { test } from "node:test";
import assert from "node:assert/strict";
import { signBrowser, verifyBrowser } from "../src/lib/server/browser-core";
import { validateBotToken } from "../src/lib/server/turnstile-core";
const key="test-only-secret-at-least-32-characters";
test("anonymous cookie requires a valid signature and expires after a day",()=>{
 const id=crypto.randomUUID(),now=Date.now(),signed=signBrowser(id,key,now);
 assert.equal(verifyBrowser(signed,key,now),id);
 assert.equal(verifyBrowser(signed+"a",key,now),null);
 assert.equal(verifyBrowser(signed,"another secret",now),null);
 assert.equal(verifyBrowser(signed,key,now+86400000),null);
 assert.equal(verifyBrowser(signed,key,now-2000),null);
 assert.equal(verifyBrowser(signBrowser("not-a-uuid",key,now),key,now),null);
});
test("Turnstile must validate success, hostname, action and browser binding",async()=>{
 const browser=crypto.randomUUID(),id=crypto.randomUUID();
 const pass={success:true,hostname:"rides.example.com",action:"send_otp",cdata:browser};
 const transport=(value:unknown,status=200)=> (async()=>new Response(JSON.stringify(value),{status})) as typeof fetch;
 assert.equal(await validateBotToken("token","secret","rides.example.com",browser,id,transport(pass)),true);
 for(const bad of [{...pass,success:false},{...pass,hostname:"attacker.example"},{...pass,action:"other"},{...pass,cdata:crypto.randomUUID()}])assert.equal(await validateBotToken("token","secret","rides.example.com",browser,id,transport(bad)),false);
 assert.equal(await validateBotToken("token","secret","rides.example.com",browser,id,transport(pass,403)),false);
 assert.equal(await validateBotToken("","secret","rides.example.com",browser,id,transport(pass)),false);
});
