import { test } from "node:test";
import assert from "node:assert/strict";
import { SHEET_HEADERS, headerAction, assertFreeRow } from "../src/lib/sheet-layout";
import { createSheetWriter } from "../src/lib/server/sheets-core";
import type { SheetJob } from "../src/lib/types";
test("existing nine headers are preserved and only missing extra fields are added",()=>{
 assert.equal(headerAction([...SHEET_HEADERS.slice(0,9)]),"extra");
 assert.equal(headerAction([...SHEET_HEADERS]),"none");
 assert.equal(headerAction([]),"all");
 assert.throws(()=>headerAction([...SHEET_HEADERS.slice(0,9),"Unrelated existing data"]),/HEADER_MISMATCH/);
 assert.throws(()=>headerAction(["Wrong column"]),/HEADER_MISMATCH/);
});
test("another record or an unidentified occupied row is never overwritten",()=>{
 assert.doesNotThrow(()=>assertFreeRow([],"record-a"));
 assert.doesNotThrow(()=>assertFreeRow(["record-a","existing values"],"record-a"));
 assert.throws(()=>assertFreeRow(["record-b"],"record-a"),/ROW_OCCUPIED/);
 assert.throws(()=>assertFreeRow(["","unidentified data"],"record-a"),/ROW_OCCUPIED/);
});
test("Sheet writes use fourteen RAW cells at the fixed row, never values.append",async()=>{
 const job:SheetJob={submissionId:"record-a",row:2,values:["record-a",...Array(13).fill("text")]};
 const calls:{url:string;method:string;body?:string}[]=[];
 const transport:typeof fetch=async(input,init)=>{
  const url=String(input);calls.push({url,method:init?.method||"GET",body:init?.body as string|undefined});
  let data:unknown={};
  if(url.includes("fields=sheets.properties"))data={sheets:[{properties:{title:"Test Rides",sheetId:0,gridProperties:{rowCount:1000,columnCount:26}}}]};
  else if(url.includes("A1%3AN1"))data={values:[SHEET_HEADERS.slice(0,9)]};
  return new Response(JSON.stringify(data),{status:200});
 };
 const write=await createSheetWriter({sheetId:"sheet-id",tab:"Test Rides",accessToken:"fake"},[job],transport);await write(job);
 assert.equal(calls.some(c=>c.url.includes(":append")),false);
 const puts=calls.filter(c=>c.method==="PUT");assert.equal(puts.length,2);
 assert.ok(puts[0].url.includes("J1%3AN1"));assert.equal(JSON.parse(puts[0].body!).values[0].length,5);
 assert.ok(puts[1].url.includes("A2%3AN2"));assert.ok(puts[1].url.includes("valueInputOption=RAW"));assert.equal(JSON.parse(puts[1].body!).values[0].length,14);
});
