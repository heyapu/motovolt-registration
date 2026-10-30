import type { Receipt, Verification, PaymentProof } from "../types";
import { AppError } from "./errors";
import { demoEnabled } from "./env";
import { otpDigest } from "./crypto";
import { getDealer } from "../dealers";
import { PRODUCT_CATALOG, validProductChoices } from "../product-catalog";
import { purchasePeriod } from "../purchase-period";
const products = PRODUCT_CATALOG;
function monthlyStatus(phone: string, now = Date.now()) {
 const period=purchasePeriod(now);
 const count=[...store.entries.values()].filter(r=>r.phone===phone && Date.parse(r.submittedAt)>=Date.parse(period.startsAt) && Date.parse(r.submittedAt)<Date.parse(period.resetsAt)).length;
 return {count,limit:5,remaining:Math.max(0,5-count),resetsAt:period.resetsAt};
}
type DemoAttempt = Verification & { browserId: string; hash: string | null; tries: number; checkToken?: string; checkUntil?: number };
type DemoEntry = Receipt & { browserId: string; attemptId: string; productId: string };
type DemoProof = PaymentProof & { browserId:string; phone:string; paymentMode:string; digest:string; status:string; lease:string; fileKey?:string };
type DemoStore = { attempts: Map<string, DemoAttempt>; entries: Map<string, DemoEntry>; proofs:Map<string,DemoProof>; images:Map<string,Buffer> };
const globalDemo = globalThis as typeof globalThis & { motovoltPublicDemo?: DemoStore };
const store = (globalDemo.motovoltPublicDemo ||= { attempts: new Map(), entries: new Map(), proofs:new Map(), images:new Map() });
store.proofs ||= new Map();store.images ||= new Map();
function assertDemo() { if (!demoEnabled()) throw new Error("Local demo disabled"); }
const cleanAttempt = (a?: DemoAttempt): Verification | null => a ? { id: a.id, phone: a.phone, status: a.status, otpExpiresAt: a.otpExpiresAt, verificationExpiresAt: a.verificationExpiresAt, verifiedAt: a.verifiedAt, attemptsRemaining: 5 - a.tries } : null;
const receipt = (r: DemoEntry): Receipt => { const { browserId: _b, attemptId: _a, productId: _p, ...value } = r; return {...value,purchaseStatus:monthlyStatus(r.phone)}; };
const isVerified = (a?: DemoAttempt) => a?.status === "verified" && Date.parse(a.verificationExpiresAt || "") > Date.now();
export function demoRpc(name: string, args: Record<string, unknown>): unknown {
  assertDemo();
  const browserId = String(args.p_browser_id || "");
  const id = String(args.p_attempt_id || "");
  const candidate = store.attempts.get(id);
  const a = candidate?.browserId === browserId ? candidate : undefined;
  const entries = [...store.entries.values()];
  const ids = () => ({ battery: String(args.p_battery_id || "").trim().toUpperCase(), vin: String(args.p_vin || "").trim().toUpperCase() });
  switch (name) {
    case "form_load_verification":
      if (!a) throw new AppError("ATTEMPT_NOT_FOUND", "Request a new OTP.", 404);
      return cleanAttempt(a);
    case "form_resume_verification": return cleanAttempt([...store.attempts.values()].find(v => v.browserId === browserId && v.phone === args.p_phone && isVerified(v)));
    case "form_check_existing": {
      const values = ids();
      if ((values.battery || values.vin) && (!isVerified(a) || a?.phone !== args.p_phone)) throw new AppError("VERIFICATION_EXPIRED", "Verify the phone number first.", 410);
      return { purchaseStatus: monthlyStatus(String(args.p_phone)), phoneExists: entries.some(r => r.phone === args.p_phone), batteryExists: Boolean(values.battery) && entries.some(r => r.batteryId === values.battery), vinExists: Boolean(values.vin) && entries.some(r => r.vin === values.vin) };
    }
    case "form_start_verification": {
      if (candidate) {
        if (!a || a.phone !== args.p_phone) throw new AppError("IDEMPOTENCY_CONFLICT", "Request already used.", 409);
        return { created: false, verification: cleanAttempt(a) };
      }
      const resumed = [...store.attempts.values()].find(v => v.browserId === browserId && v.phone === args.p_phone && isVerified(v));
      if (resumed) return { created: false, verification: cleanAttempt(resumed) };
      for (const old of store.attempts.values()) if (old.phone === args.p_phone && (["pending", "sent", "checking"].includes(old.status) || old.browserId === browserId && old.status === "verified")) { old.status = "superseded"; old.hash = null; }
      const next: DemoAttempt = { id, browserId, phone: String(args.p_phone), status: "pending", otpExpiresAt: new Date(Date.now() + 600000).toISOString(), verifiedAt: null, verificationExpiresAt: null, hash: otpDigest(id, browserId, String(args.p_phone), "123456"), tries: 0 };
      store.attempts.set(id, next); return { created: true, verification: cleanAttempt(next) };
    }
    case "form_mark_otp_delivery":
      if (!a) throw new AppError("ATTEMPT_NOT_FOUND", "Request a new OTP.", 404);
      if (a.status === "pending") { a.status = args.p_success ? "sent" : "failed"; if (!args.p_success) a.hash = null; }
      return cleanAttempt(a);
    case "form_reserve_otp_check": {
      if (!a) throw new AppError("ATTEMPT_NOT_FOUND", "Request a new OTP.", 404);
      if (isVerified(a)) return { ok: true, providerCheck: false, verification: cleanAttempt(a) };
      if (a.status === "checking" && (a.checkUntil || 0) > Date.now()) return { ok: false, code: "OTP_PENDING" };
      if (a.tries >= 5 || a.status === "locked") return { ok: false, code: "OTP_LOCKED" };
      if (!["sent", "checking"].includes(a.status) || Date.parse(a.otpExpiresAt) <= Date.now()) return { ok: false, code: "OTP_EXPIRED" };
      a.tries++;
      if (a.hash !== args.p_otp_hash) { a.status = a.tries >= 5 ? "locked" : "sent"; if (a.tries >= 5) a.hash = null; return { ok: false, code: a.tries >= 5 ? "OTP_LOCKED" : "OTP_INCORRECT", attemptsRemaining: 5 - a.tries }; }
      a.status = "checking"; a.checkToken = String(args.p_check_token); a.checkUntil = Date.now() + 45000;
      return { ok: true, providerCheck: true };
    }
    case "form_finish_otp_check": {
      if (!a) throw new AppError("ATTEMPT_NOT_FOUND", "Request a new OTP.", 404);
      if (isVerified(a)) return { ok: true, verification: cleanAttempt(a) };
      if (a.status !== "checking" || a.checkToken !== args.p_check_token || (a.checkUntil || 0) <= Date.now()) throw new AppError("OTP_CHECK_EXPIRED", "Enter the OTP again.", 409);
      if (Date.parse(a.otpExpiresAt) <= Date.now()) { a.status = "failed"; a.hash = null; return { ok: false, code: "OTP_EXPIRED" }; }
      if (!args.p_success) { a.status = a.tries >= 5 ? "locked" : "sent"; return { ok: false, code: "OTP_PROVIDER_FAILED" }; }
      a.status = "verified"; a.verifiedAt = new Date().toISOString(); a.verificationExpiresAt = new Date(Date.now() + 30*86400000).toISOString(); a.hash = null;
      return { ok: true, verification: cleanAttempt(a) };
    }
    case "form_reserve_proof": {
      if(!a || !isVerified(a))throw new AppError("VERIFICATION_EXPIRED","Verify the number first.",410);
      if(monthlyStatus(a.phone).remaining<=0)throw new AppError("MONTHLY_PURCHASE_LIMIT","This number has reached five purchases for this month.",409);
      const pid=String(args.p_proof_id),old=store.proofs.get(pid);
      if(old) {
        if(old.browserId!==browserId || old.phone!==a.phone || old.digest!==args.p_digest || old.paymentMode!==args.p_payment_mode)throw new AppError("PROOF_MISMATCH","This image belongs to another entry.",409);
        if(old.status==="ready")return {ready:true,proof:{id:old.id,url:old.url,width:old.width,height:old.height,byteSize:old.byteSize}};
        if(old.status==="uploading")throw new AppError("PROOF_PENDING","Image upload is processing.",409);
      }
      const duplicate=[...store.proofs.values()].find(p=>p.digest===args.p_digest && ["uploading","ready","consumed"].includes(p.status));
      if(duplicate) {
        if(duplicate.status==="ready" && duplicate.browserId===browserId && duplicate.phone===a.phone && duplicate.paymentMode===args.p_payment_mode)
          return {ready:true,proof:{id:duplicate.id,url:duplicate.url,width:duplicate.width,height:duplicate.height,byteSize:duplicate.byteSize}};
        throw new AppError("DUPLICATE_PROOF","This payment image is already used.",409);
      }
      store.proofs.set(pid,{id:pid,url:"",width:0,height:0,byteSize:0,browserId,phone:a.phone,paymentMode:String(args.p_payment_mode),digest:String(args.p_digest),status:"uploading",lease:String(args.p_lease)});
      return {ready:false,id:pid};
    }
    case "form_finish_proof": {
      const proof=store.proofs.get(String(args.p_proof_id));
      if(!proof || proof.browserId!==browserId || proof.status!=="uploading" || proof.lease!==args.p_lease)throw new AppError("PROOF_LEASE_EXPIRED","Retry the image upload.",409);
      proof.status="ready";proof.url=String(args.p_view_url);proof.fileKey=String(args.p_file_key);proof.width=Number(args.p_width);proof.height=Number(args.p_height);proof.byteSize=Number(args.p_byte_size);
      return {id:proof.id,url:proof.url,width:proof.width,height:proof.height,byteSize:proof.byteSize};
    }
    case "form_fail_proof": {
      const proof=store.proofs.get(String(args.p_proof_id));
      if(proof?.browserId===browserId && proof.lease===args.p_lease && proof.status==="uploading")proof.status="failed";
      return null;
    }
    case "form_get_proof": {
      const proof=store.proofs.get(String(args.p_proof_id));
      return proof && ["ready","consumed"].includes(proof.status) ? {key:proof.fileKey,url:proof.url} : null;
    }
    case "form_submit": {
      const values = ids();
      const existing = store.entries.get(String(args.p_request_id));
      if (existing) {
        if (existing.browserId !== browserId || existing.dealerId !== args.p_dealer_id || existing.gender !== args.p_gender || existing.paymentProofUrl !== store.proofs.get(String(args.p_proof_id))?.url || existing.customerName !== args.p_customer_name || existing.email !== (args.p_email || null) || existing.age !== args.p_age || existing.productId !== args.p_product_id || existing.colour !== args.p_colour || existing.connectivity !== (args.p_connectivity || null) || existing.rangeVariant !== (args.p_range_variant || null) || existing.chargerType !== (args.p_charger_type || null) || existing.batteryId !== (values.battery || null) || existing.vin !== (values.vin || null) || existing.paymentMode !== args.p_payment_mode || (existing.attemptId !== id && a?.phone !== existing.phone)) throw new AppError("IDEMPOTENCY_CONFLICT", "This record is locked.", 409);
        return receipt(existing);
      }
      if (!a || !isVerified(a)) throw new AppError("VERIFICATION_EXPIRED", "Verify the number again; your details have been kept.", 410);
      if (monthlyStatus(a.phone).remaining<=0)throw new AppError("MONTHLY_PURCHASE_LIMIT","This number has reached five purchases for this month.",409);
      if (values.battery && entries.some(r => r.batteryId === values.battery)) throw new AppError("DUPLICATE_BATTERY", "This Battery ID is already registered.", 409);
      if (values.vin && entries.some(r => r.vin === values.vin)) throw new AppError("DUPLICATE_VIN", "This VIN number is already registered.", 409);
      const dealer=getDealer(String(args.p_dealer_id));
      if(!dealer)throw new AppError("INVALID_DEALER","Choose a dealer from the list.");
      if(!values.battery || !values.vin || !["male","female","non_binary"].includes(String(args.p_gender)))throw new AppError("INVALID_INPUT","Complete the required details.");
      const proof=store.proofs.get(String(args.p_proof_id));
      if(!proof || proof.status!=="ready")throw new AppError("PROOF_REQUIRED","Upload the payment proof first.");
      if(proof.browserId!==browserId || proof.phone!==a.phone || proof.paymentMode!==args.p_payment_mode)throw new AppError("PROOF_MISMATCH","This payment proof belongs to another entry.",409);
      const product = products.find(p => p.id === args.p_product_id);
      if (!product) throw new AppError("INVALID_PRODUCT", "Select a product.");
      if (!validProductChoices({productId:product.id,colour:String(args.p_colour || ""),connectivity:String(args.p_connectivity || ""),rangeVariant:String(args.p_range_variant || ""),chargerType:String(args.p_charger_type || "")}))throw new AppError("INVALID_PRODUCT_OPTIONS","Choose all product options.");
      const entry: DemoEntry = { id: String(args.p_request_id), browserId, attemptId: id, dealerName: dealer.name, dealerId:dealer.id, gender:args.p_gender as Receipt["gender"], paymentProofUrl:proof.url, phone: a.phone, customerName: String(args.p_customer_name), email: args.p_email ? String(args.p_email) : null, age: Number(args.p_age), productId: product.id, productName: product.name, colour:String(args.p_colour), connectivity:(args.p_connectivity || null) as Receipt["connectivity"], rangeVariant:(args.p_range_variant || null) as Receipt["rangeVariant"], chargerType:(args.p_charger_type || null) as Receipt["chargerType"], purchaseStatus:monthlyStatus(a.phone), batteryId: values.battery || null, vin: values.vin || null, paymentMode: args.p_payment_mode as Receipt["paymentMode"], submittedAt: new Date().toISOString(), sheetStatus: "pending" };
      store.entries.set(entry.id, entry); proof.status="consumed"; return receipt(entry);
    }
    case "form_get_submission": { const r = store.entries.get(String(args.p_request_id)); return r?.browserId === browserId ? receipt(r) : null; }
    case "form_monthly_purchase_status": return monthlyStatus(String(args.p_phone),args.p_at?Date.parse(String(args.p_at)):Date.now());
    case "form_claim_sheet_jobs": return [];
    case "form_release_sheet_worker": case "form_cleanup_verification_state": return null;
    default: throw new Error(`Unknown demo operation: ${name}`);
  }
}

export function saveDemoProofImage(id:string,bytes:Buffer):void {assertDemo();store.images.set(id,bytes);}
export function readDemoProofImage(id:string):Buffer | undefined {assertDemo();return store.images.get(id);}
