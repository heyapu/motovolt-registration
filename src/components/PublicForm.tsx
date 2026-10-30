"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Receipt,
  RegistrationFields,
  SavedDraft,
  FormContext,
  Verification,
  PurchaseStatus,
  PaymentProof as UploadedProof,
} from "@/lib/types";
import { CHARGER_LABELS, CONNECTIVITY_LABELS, RANGE_LABELS } from "@/lib/product-catalog";
import { ProductOptions } from "./ProductOptions";
import { fieldsSchema, normalizePhone } from "@/lib/validation";
import { api, ApiError } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/client/drafts";
import { PAYMENT_LABELS, GENDER_LABELS } from "@/lib/types";
import { DealerSelect } from "./DealerSelect";
import { PaymentProof } from "./PaymentProof";
import { getDealer } from "@/lib/dealers";
import { BotCheck } from "./BotCheck";
import { Icon } from "./Icon";
import styles from "./PublicForm.module.scss";

const emptyFields = (): RegistrationFields => ({
  dealerId: "", gender: "", proofId: "", customerName: "", email: "", age: "", productId: "", colour: "", connectivity: "", rangeVariant: "", chargerType: "", batteryId: "", vin: "", paymentMode: "",
});
const alive = (v: Verification | null) =>
  v?.status === "verified" &&
  Boolean(v.verificationExpiresAt) &&
  Date.parse(v.verificationExpiresAt!) > Date.now();
export default function PublicForm() {
  const [context, setContext] = useState<FormContext | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [fields, setFields] = useState<RegistrationFields>(emptyFields);
  const [requestId, setRequestId] = useState("");
  const [queued, setQueued] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [expired, setExpired] = useState(false);
  const [attention, setAttention] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaGeneration, setCaptchaGeneration] = useState(0);
  const [proofImage, setProofImage] = useState<Blob | null>(null);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofProcessing, setProofProcessing] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatus | null>(null);
  const [website, setWebsite] = useState("");
  const working = useRef(false);
  const sendId = useRef("");
  const submitRetryAt = useRef(0);

  const restore = useCallback(async (data: FormContext) => {
    setContext(data);
    setDemo(data.demo);
    setRequestId(crypto.randomUUID());
    let draft: SavedDraft | null = null;
    try {
      draft = await loadDraft(data.browserId);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    if (!draft) return;
    // Check for a committed submission before asking for another OTP.
    try {
      const status = await api<{ receipt: Receipt | null }>(
        "/api/submissions/status",
        { requestId: draft.requestId },
      );
      if (status.receipt) {
        setReceipt(status.receipt);
        await clearDraft(data.browserId);
        return;
      }
    } catch {
      /* Retain the draft and let the normal retry flow reconcile it. */
    }
    const restored = emptyFields();
    for (const key of Object.keys(restored) as (keyof RegistrationFields)[]) {
      if (typeof draft.fields[key] === "string") Object.assign(restored, { [key]: draft.fields[key] });
    }
    setFields(restored);
    setProofImage(draft.proofImage instanceof Blob ? draft.proofImage : null);
    setProofUploaded(Boolean(draft.proofUploaded));
    setPhone(draft.verification.phone.slice(3));
    setRequestId(draft.requestId);
    setQueued(draft.queued);
    setConsent(true);
    try {
      const result = await api<{ verification: Verification | null }>(
        "/api/otp/resume",
        { phone: draft.verification.phone },
      );
      if (result.verification) {
        setVerification(result.verification);
        setExpired(false);
        setNotice("Your saved entry is ready to continue.");
      } else {
        setVerification(draft.verification);
        setExpired(true);
        setAttention(true);
        setNotice(
          "Your details were restored. Verify the number again to continue.",
        );
      }
    } catch {
      setVerification(draft.verification);
      setExpired(!alive(draft.verification));
      setNotice(
        "Your saved draft was restored. Reconnect to confirm verification.",
      );
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    let active = true;
    void api<FormContext>("/api/form")
      .then((v) => {
        if (active) return restore(v);
      })
      .catch((e) => {
        if (active && (!(e instanceof ApiError) || e.status !== 401))
          setError(
            e instanceof Error
              ? e.message
              : "Could not connect. Please try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => { });
    return () => {
      active = false;
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [restore]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldown((v) => Math.max(0, v - 1));
      if (
        verification?.status === "verified" &&
        !alive(verification) &&
        !receipt
      ) {
        setExpired(true);
        setAttention(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [verification, receipt]);

  useEffect(() => {
    if (!verification || !alive(verification) || receipt || !online) return;
    let active = true;
    void api<{ purchaseStatus: PurchaseStatus }>("/api/purchases/status", { attemptId: verification.id })
      .then(v => { if (active) setPurchaseStatus(v.purchaseStatus); })
      .catch(() => { });
    return () => { active = false; };
  }, [verification?.id, receipt, online]);

  useEffect(() => {
    if (expired) sendId.current = "";
  }, [expired]);

  useEffect(() => {
    if (!context || !verification || receipt || !requestId) return;
    const timer = setTimeout(() => {
      void saveDraft({
        browserId: context.browserId,
        requestId,
        verification,
        fields,
        proofImage: proofImage || undefined, proofUploaded,
        queued,
        savedAt: Date.now(),
      })
        .then(() => setStorageAvailable(true))
        .catch(() => setStorageAvailable(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [context, verification, fields, queued, receipt, requestId, proofImage, proofUploaded]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (context && verification && !receipt) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [context, verification, receipt]);

  const complete = useCallback(
    async (result: Receipt) => {
      setReceipt(result);
      setPurchaseStatus(result.purchaseStatus);
      setQueued(false);
      setAttention(false);
      setError("");
      setNotice("");
      if (context)
        try {
          await clearDraft(context.browserId);
        } catch {
          setStorageAvailable(false);
        }
    },
    [context],
  );

  const sync = useCallback(async () => {
    if (
      !context ||
      !verification ||
      working.current ||
      !navigator.onLine ||
      Date.now() < submitRetryAt.current
    )
      return;
    working.current = true;
    setBusy("submit");
    setError("");
    try {
      // Reconcile a lost response before uploading or requesting verification again.
      const status = await api<{ receipt: Receipt | null }>("/api/submissions/status", { requestId });
      if (status.receipt) { await complete(status.receipt); return; }
      let submissionFields = fields;
      if (!proofUploaded) {
        if (!proofImage) throw new ApiError("PROOF_REQUIRED", "Choose the payment proof image.", 400);
        const proofId = fields.proofId || crypto.randomUUID();
        const next = { ...fields, proofId };
        setFields(next);
        try { await saveDraft({ browserId: context.browserId, requestId, verification, fields: next, queued: true, savedAt: Date.now(), proofImage, proofUploaded: false }); } catch { setStorageAvailable(false); }
        const form = new FormData();
        form.set("attemptId", verification.id); form.set("proofId", proofId); form.set("paymentMode", fields.paymentMode); form.set("website", website); form.set("image", proofImage, proofImage.type === "image/png" ? "payment-proof.png" : proofImage.type === "image/webp" ? "payment-proof.webp" : "payment-proof.jpg");
        const { proof } = await api<{ proof: UploadedProof }>("/api/proofs", form);
        submissionFields = { ...next, proofId: proof.id };
        setFields(submissionFields); setProofUploaded(true);
        try { await saveDraft({ browserId: context.browserId, requestId, verification, fields: submissionFields, queued: true, savedAt: Date.now(), proofImage, proofUploaded: true }); } catch { setStorageAvailable(false); }
      }
      const { receipt: result } = await api<{ receipt: Receipt }>(
        "/api/submissions",
        { ...submissionFields, attemptId: verification.id, requestId, website },
      );
      await complete(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not confirm this entry.",
      );
      if (e instanceof ApiError) {
        submitRetryAt.current = Date.now() + Math.max(30, e.retryAfter) * 1000;
        if (["DUPLICATE_PHONE", "DUPLICATE_VIN", "DUPLICATE_BATTERY", "INVALID_INPUT", "INVALID_PRODUCT", "INVALID_PRODUCT_OPTIONS", "MONTHLY_PURCHASE_LIMIT", "INVALID_DEALER", "PROOF_REQUIRED", "PROOF_MISMATCH", "DUPLICATE_PROOF", "INVALID_IMAGE"].includes(e.code)) {
          // Rejected before commit: keep the details editable for correction.
          setQueued(false);
          if (["PROOF_REQUIRED", "PROOF_MISMATCH", "DUPLICATE_PROOF"].includes(e.code)) setProofUploaded(false);
          setAttention(false);
          return;
        }
        if (
          e.code === "VERIFICATION_EXPIRED" ||
          e.code === "ATTEMPT_NOT_FOUND"
        ) {
          setExpired(true);
          setAttention(true);
        } else if (e.status === 401) {
          setContext(null);
          setNotice("Reload the form to sync your saved entry.");
        } else if (e.status >= 400 && e.status < 500 && e.status !== 429)
          setAttention(true);
      }
    } finally {
      working.current = false;
      setBusy("");
    }
  }, [context, verification, fields, requestId, complete, website, proofImage, proofUploaded]);

  useEffect(() => {
    if (!queued || !online || attention || expired || !context || receipt)
      return;
    const soon = setTimeout(() => void sync(), 1000);
    const interval = setInterval(() => void sync(), 30000);
    const focus = () => void sync();
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(soon);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [queued, online, attention, expired, context, receipt, sync]);

  async function send(event?: FormEvent, resend = false) {
    event?.preventDefault();
    if (!context || working.current) return;
    setError("");
    setNotice("");
    let normalized: string;
    try {
      normalized = normalizePhone(phone);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!consent) {
      setError("Confirm that the customer agrees to receive an OTP.");
      return;
    }
    if (!navigator.onLine) {
      setError("Reconnect to request an OTP.");
      return;
    }
    if (website) { setError("This request could not be accepted."); return; }
    if (resend || !sendId.current) sendId.current = crypto.randomUUID();
    working.current = true;
    setBusy("send");
    try {
      const result = await api<{ verification: Verification }>(
        "/api/otp/start",
        { phone: normalized, requestId: sendId.current, consent: true, captchaToken, website },
      );
      setVerification(result.verification);
      setCode("");
      setExpired(false);
      setAttention(false);
      setPhone(normalized.slice(3));
      setCooldown(60);
      setNotice(
        result.verification.status === "verified"
          ? "Your verified number is ready. Continue with the customer details."
          : "OTP sent. Ask the customer for the six-digit code.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the OTP.");
      if (e instanceof ApiError && e.retryAfter) setCooldown(e.retryAfter);
      if (
        e instanceof ApiError &&
        ["OTP_EXPIRED", "OTP_DELIVERY_FAILED"].includes(e.code)
      )
        sendId.current = "";
    } finally {
      setCaptchaGeneration(v => v + 1);
      working.current = false;
      setBusy("");
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!verification || working.current) return;
    if (!navigator.onLine) {
      setError("Reconnect to verify the OTP.");
      return;
    }
    working.current = true;
    setBusy("verify");
    setError("");
    try {
      const result = await api<{ verification: Verification }>(
        "/api/otp/verify",
        { attemptId: verification.id, code },
      );
      setVerification(result.verification);
      setExpired(false);
      setAttention(false);
      setNotice("");
      setCode("");
      submitRetryAt.current = 0;
      // Persist server-confirmed verification before the customer details are entered.
      if (context)
        try {
          await saveDraft({
            browserId: context.browserId,
            requestId,
            verification: result.verification,
            fields,
            proofImage: proofImage || undefined, proofUploaded,
            queued,
            savedAt: Date.now(),
          });
          setStorageAvailable(true);
        } catch {
          setStorageAvailable(false);
        }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context || !verification || working.current || proofProcessing) return;
    if (!proofImage && !proofUploaded) { setError("Choose the receipt or payment confirmation image."); return; }
    const parsed = fieldsSchema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (navigator.onLine) {
      working.current = true;
      setBusy("check");
      setError("");
      try {
        const existing = await api<{ phoneExists: boolean; batteryExists: boolean; vinExists: boolean; purchaseStatus: PurchaseStatus }>("/api/registrations/check", {
          phone: verification.phone, batteryId: parsed.data.batteryId, vin: parsed.data.vin, attemptId: verification.id,
        });
        setPurchaseStatus(existing.purchaseStatus);
        if (existing.purchaseStatus.remaining <= 0) { setError("This number has reached five purchases for this calendar month."); return; }
        if (existing.batteryExists || existing.vinExists) {
          setError(existing.vinExists ? "This VIN number is already registered." : "This Battery ID is already registered.");
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not check existing registrations. Please try again.");
        return;
      } finally { working.current = false; setBusy(""); }
    }
    const draft: SavedDraft = {
      browserId: context.browserId,
      requestId,
      verification,
      fields: parsed.data,
      proofImage: proofImage || undefined, proofUploaded,
      queued: true,
      savedAt: Date.now(),
    };
    try {
      await saveDraft(draft);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
      if (!navigator.onLine) {
        setError(
          "This browser cannot save offline drafts. Reconnect before submitting.",
        );
        return;
      }
    }
    setFields(parsed.data);
    setQueued(true);
    setAttention(false);
    setError("");
    setNotice("");
    submitRetryAt.current = 0;
    if (navigator.onLine) await sync();
  }
  useEffect(() => {
    if (!receipt || demo || receipt.sheetStatus === "done" || receipt.sheetStatus === "needs_attention" || !online) return;
    let active = true;
    const id = receipt.id;
    const timer = setInterval(() => {
      void api<{ receipt: Receipt | null }>("/api/submissions/status", { requestId: id }).then(data => {
        if (active && data.receipt) setReceipt(current => current?.id === data.receipt!.id ? data.receipt : current);
      }).catch(() => { });
    }, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [receipt?.id, receipt?.sheetStatus, demo, online]);

  async function reset(samePhone = false) {
    if (proofProcessing || working.current) return;
    if (
      verification &&
      !receipt &&
      !window.confirm("Discard this unfinished entry and start a new customer?")
    )
      return;
    if (context)
      try {
        await clearDraft(context.browserId);
      } catch { }
    const reuse = samePhone && alive(verification);
    setVerification(reuse ? verification : null);
    setFields(reuse ? { ...emptyFields(), dealerId: fields.dealerId, customerName: fields.customerName, email: fields.email, age: fields.age, gender: fields.gender } : emptyFields());
    setProofImage(null); setProofUploaded(false); setProofProcessing(false);
    setPhone(reuse ? verification!.phone.slice(3) : "");
    setCode("");
    setConsent(Boolean(reuse));
    if (!reuse) setPurchaseStatus(null);
    setQueued(false);
    setReceipt(null);
    setExpired(false);
    setAttention(false);
    setError("");
    setNotice("");
    setCooldown(0);
    setRequestId(crypto.randomUUID());
    sendId.current = "";
    submitRetryAt.current = 0;
  }
  const ready = verification?.status === "verified" && !expired;
  const step = receipt ? 3 : ready ? 2 : verification && !expired ? 1 : 0;
  const locked = queued || Boolean(receipt);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <svg height="24" viewBox="0 0 436 67" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M187.235 22.4029C186.371 21.6147 185.201 21.0326 183.777 20.681C182.425 20.3535 180.707 20.1838 178.674 20.1838H156.995C154.985 20.1838 153.293 20.3535 151.929 20.681C150.504 21.0326 149.346 21.6147 148.47 22.4029C147.581 23.2032 146.947 24.2704 146.595 25.5557C146.253 26.7684 146.083 28.2478 146.083 29.9574V38.1793C146.083 39.9131 146.253 41.3929 146.595 42.5931C146.96 43.8663 147.593 44.9213 148.47 45.7218C149.346 46.5103 150.504 47.08 151.929 47.4314C153.28 47.7713 154.985 47.9409 156.995 47.9409H178.674C180.707 47.9409 182.425 47.7713 183.777 47.4314C185.201 47.08 186.358 46.4981 187.235 45.7218C188.112 44.9213 188.745 43.8663 189.111 42.5931C189.452 41.3929 189.635 39.9131 189.635 38.1793V29.9574C189.635 28.2599 189.464 26.7805 189.111 25.5557C188.745 24.2704 188.112 23.2032 187.223 22.4029M153.694 39.0161C153.585 38.5188 153.536 37.8639 153.536 37.076V31.0851C153.536 30.3214 153.585 29.6909 153.694 29.2179C153.779 28.8177 153.938 28.5146 154.169 28.2841C154.401 28.0659 154.742 27.8961 155.168 27.7991C155.692 27.6779 156.411 27.6293 157.275 27.6293H178.454C179.258 27.6293 179.928 27.6899 180.451 27.7991C180.89 27.8961 181.219 28.0538 181.45 28.2841C181.694 28.5267 181.864 28.8298 181.974 29.2422C182.096 29.715 182.168 30.3333 182.168 31.0851V37.076C182.168 37.8517 182.108 38.4947 181.974 38.9797C181.864 39.3798 181.694 39.7071 181.475 39.9253C181.243 40.1435 180.914 40.289 180.476 40.374C179.952 40.4834 179.27 40.5317 178.466 40.5317H157.287C156.411 40.5317 155.692 40.4834 155.156 40.374C154.717 40.289 154.389 40.1313 154.158 39.9253C153.938 39.7071 153.779 39.4161 153.694 39.0161Z" fill="white" />
          <path d="M193.757 20.4506V27.4595L207.203 27.3746V47.9287H214.716V27.3019L227.006 26.8169V20.1838L193.757 20.4506Z" fill="white" />
          <path d="M297.723 39.3434L285.569 20.1838H276.557L292.572 45.1276C293.12 45.9886 293.754 46.668 294.46 47.1527C295.215 47.6741 296.262 47.929 297.602 47.929C298.942 47.929 299.989 47.6619 300.744 47.1527C301.45 46.668 302.084 45.9886 302.632 45.1276L318.732 20.1838H309.841L297.723 39.3434Z" fill="white" />
          <path d="M380.26 40.2652C379.787 40.1435 379.407 39.9498 379.14 39.7071C378.886 39.4647 378.703 39.1493 378.593 38.7493C378.471 38.2884 378.397 37.7062 378.397 37.0033L378.616 20.1838H371.175V38.1671C371.175 39.9012 371.345 41.3807 371.686 42.5812C372.053 43.8541 372.687 44.9094 373.576 45.7095C374.451 46.4981 375.61 47.08 377.032 47.4314C378.387 47.7713 380.09 47.9409 382.101 47.9409H403.707L403.485 40.4712H382.391C381.528 40.4712 380.811 40.4107 380.26 40.2652Z" fill="white" />
          <path d="M120.967 47.4697C119.152 47.4697 118.117 46.6207 117.568 45.9174L107.083 33.3789V47.8212H99.6164V22.7561C99.6164 21.204 100.384 20.3793 101.029 19.9549C101.797 19.4578 102.734 19.2031 103.818 19.2031C104.659 19.2031 105.341 19.3366 105.901 19.6033C106.461 19.8822 106.973 20.3066 107.412 20.8887L121.039 37.8655L133.827 20.8887C134.254 20.3187 134.729 19.8943 135.24 19.6276C135.764 19.3486 136.434 19.2031 137.274 19.2031C138.357 19.2031 139.296 19.4578 140.063 19.9549C140.721 20.3793 141.488 21.2161 141.488 22.7683V47.9425H133.949V33.3789L124.365 45.9174C123.804 46.6451 122.769 47.4938 120.955 47.4938" fill="white" />
          <path d="M401.8 20.4506V27.4595L415.247 27.3746V47.9287H422.759V27.3019L435.047 26.8169V20.1838L401.8 20.4506Z" fill="white" />
          <path d="M272.084 22.4029C271.22 21.6147 270.051 21.0326 268.625 20.681C267.273 20.3535 265.557 20.1838 263.523 20.1838H241.844C239.847 20.1838 238.142 20.3535 236.778 20.681C235.353 21.0326 234.196 21.6147 233.319 22.4029C232.43 23.2032 231.797 24.2704 231.443 25.5557C231.09 26.7684 230.92 28.2478 230.92 29.9574V38.1793C230.92 39.9131 231.09 41.3929 231.443 42.5931C231.797 43.8663 232.442 44.9213 233.319 45.7218C234.196 46.5103 235.353 47.08 236.778 47.4314C238.13 47.7713 239.835 47.9409 241.844 47.9409H263.523C265.557 47.9409 267.273 47.7713 268.625 47.4314C270.051 47.08 271.207 46.4981 272.084 45.7218C272.961 44.9213 273.595 43.8663 273.96 42.5931C274.301 41.3929 274.483 39.9131 274.483 38.1793V29.9574C274.483 28.2599 274.301 26.7805 273.96 25.5557C273.595 24.2704 272.961 23.2032 272.072 22.4029M238.531 39.0161C238.422 38.5188 238.373 37.8639 238.373 37.076V31.0851C238.373 30.3214 238.422 29.6909 238.531 29.2179C238.616 28.8177 238.775 28.5146 239.007 28.2841C239.238 28.0659 239.579 27.8961 240.005 27.7991C240.529 27.6779 241.248 27.6293 242.112 27.6293H263.291C264.083 27.6293 264.753 27.6899 265.289 27.7991C265.727 27.8961 266.056 28.0538 266.287 28.2841C266.531 28.5267 266.701 28.8298 266.811 29.2422C266.933 29.715 267.006 30.3333 267.006 31.0851V37.076C267.006 37.8517 266.945 38.4947 266.811 38.9797C266.701 39.3798 266.531 39.7071 266.312 39.9253C266.08 40.1435 265.751 40.289 265.313 40.374C264.789 40.4834 264.107 40.5317 263.304 40.5317H242.125C241.248 40.5317 240.529 40.4834 239.993 40.374C239.554 40.289 239.226 40.1313 238.994 39.9253C238.775 39.7071 238.616 39.4161 238.531 39.0161Z" fill="white" />
          <path d="M362.806 22.4029C361.94 21.6147 360.772 21.0326 359.346 20.681C357.994 20.3535 356.279 20.1838 354.245 20.1838H332.565C330.57 20.1838 328.864 20.3535 327.512 20.681C326.086 21.0326 324.931 21.6147 324.052 22.4029C323.164 23.2032 322.53 24.2704 322.177 25.5557C321.836 26.7684 321.666 28.2478 321.666 29.9574V38.1793C321.666 39.9131 321.836 41.3929 322.177 42.5931C322.543 43.8663 323.177 44.9213 324.052 45.7218C324.931 46.5103 326.086 47.08 327.512 47.4314C328.864 47.7713 330.57 47.9409 332.565 47.9409H354.245C356.279 47.9409 357.994 47.7713 359.346 47.4314C360.772 47.08 361.931 46.4981 362.806 45.7218C363.681 44.9213 364.315 43.8663 364.682 42.5931C365.023 41.3929 365.194 39.9131 365.194 38.1793V29.9574C365.194 28.2599 365.023 26.7805 364.682 25.5557C364.315 24.2704 363.681 23.2032 362.793 22.4029M329.266 39.0161C329.157 38.5188 329.105 37.8639 329.105 37.076V31.0851C329.105 30.3214 329.157 29.6909 329.266 29.2179C329.35 28.8177 329.508 28.5146 329.739 28.2841C329.971 28.0659 330.312 27.8961 330.74 27.7991C331.262 27.6779 331.983 27.6293 332.845 27.6293H354.026C354.827 27.6293 355.5 27.6899 356.021 27.7991C356.459 27.8961 356.791 28.0538 357.022 28.2841C357.264 28.5267 357.434 28.8298 357.544 29.2422C357.666 29.715 357.74 30.3333 357.74 31.0851V37.076C357.74 37.8517 357.679 38.4947 357.544 38.9797C357.434 39.3798 357.264 39.7071 357.045 39.9253C356.813 40.1435 356.485 40.289 356.047 40.374C355.51 40.4834 354.84 40.5317 354.036 40.5317H332.858C331.983 40.5317 331.262 40.4834 330.727 40.374C330.29 40.289 329.958 40.1313 329.727 39.9253C329.508 39.7071 329.35 39.4161 329.266 39.0161Z" fill="white" />
          <path d="M26.1208 0.775012C38.5408 -0.582136 90.0829 -1.70954 88.6349 11.6551C88.6105 13.2305 88.513 14.8932 88.3545 16.6745C87.5733 31.64 78.6655 46.6432 64.6242 56.7737C63.4036 57.5744 62.1633 58.4703 60.89 59.3901C56.054 62.8834 50.7402 66.7218 44.212 67C35.8689 66.5751 26.0128 58.4196 19.725 53.2167C19.7247 53.2165 19.7243 53.2162 19.724 53.2159C19.1899 52.7739 18.6817 52.3534 18.2022 51.9606C7.25929 42.254 1.30385 29.5677 0.315432 16.6745C0.289817 16.4133 0.260561 16.1418 0.230429 15.8623C-0.112574 12.6803 -0.568988 8.44614 2.94129 6.12905C8.36652 2.95801 14.9651 2.15216 22.1652 1.27284C23.4652 1.11408 24.7849 0.95292 26.1208 0.775012Z" fill="#F04E23" />
          <path d="M51.9734 26.0986V23.0456L44.3163 18.0052L36.6589 23.0456V26.0986L44.3163 21.0581L51.9734 26.0986ZM21.7639 25.0929C21.7639 25.0211 21.7268 24.9492 21.6652 24.9133L19.4211 23.4406C19.2484 23.3329 19.0142 23.4406 19.0142 23.6202V34.2398C19.0142 34.3115 19.0511 34.3833 19.1128 34.4195L27.2262 39.7711C27.3989 39.8787 27.6331 39.7711 27.6331 39.5915V37.1132C27.6331 37.0415 27.5962 36.9694 27.5345 36.9336L21.7639 33.1264V25.0929ZM19.4087 38.0708C19.2361 37.9632 19.0018 38.0708 19.0018 38.2505V40.729C19.0018 40.8008 19.0388 40.8725 19.1005 40.9084L27.2138 46.26C27.3865 46.3679 27.6208 46.26 27.6208 46.0807V43.6024C27.6208 43.5304 27.5838 43.4587 27.5221 43.4228L19.4087 38.0708ZM69.236 38.0708L61.1225 43.4228C61.0609 43.4704 61.024 43.5304 61.024 43.6024V46.0807C61.024 46.2721 61.2705 46.38 61.4433 46.26L69.5565 40.9084C69.6182 40.8604 69.6674 40.8008 69.6674 40.729V38.2505C69.6674 38.0591 69.4209 37.9515 69.2484 38.0708M69.6429 19.6813L55.1298 10.1153V26.2182L49.4824 29.9416C49.3223 30.0495 49.2239 30.2171 49.2239 30.3964V42.6087C49.2239 42.788 49.1251 42.9556 48.9647 43.0635L44.6736 45.901C44.4764 46.0328 44.1931 46.0328 43.9955 45.901L39.7048 43.0635C39.5443 42.9556 39.4455 42.788 39.4455 42.6087V30.3964C39.4455 30.2171 39.3468 30.0495 39.1867 29.9416L33.5393 26.2182V10.1153L19.3101 19.4898C19.1622 19.5855 19.1622 19.7771 19.3101 19.8729L24.9081 23.5724V31.4385C24.9081 31.6178 25.0067 31.7854 25.167 31.893L30.5307 35.425C30.691 35.5329 30.7897 35.7005 30.7897 35.8798V48.3076C30.7897 48.4872 30.8885 48.6545 31.0487 48.7624L44.0079 57.3106C44.2054 57.4423 44.4888 57.4423 44.686 57.3106L57.6456 48.7624C57.8056 48.6545 57.9041 48.4872 57.9041 48.3076V35.8798C57.9041 35.7005 58.0029 35.5329 58.1633 35.425L63.527 31.893C63.6875 31.7854 63.7859 31.6178 63.7859 31.4385V23.5724L69.6674 19.6933L69.6429 19.6813ZM61.0116 22.3392V30.205C61.0116 30.3847 60.9132 30.5523 60.7527 30.6602L55.389 34.1919C55.2286 34.2995 55.1298 34.4671 55.1298 34.647V47.0741C55.1298 47.2538 55.0314 47.4217 54.8713 47.529L44.6616 54.2578C44.464 54.3896 44.1807 54.3896 43.9831 54.2578L33.7734 47.529C33.6133 47.4217 33.5148 47.2538 33.5148 47.0741V34.647C33.5148 34.4671 33.416 34.2995 33.256 34.1919L27.8921 30.6602C27.7318 30.5523 27.6331 30.3847 27.6331 30.205V22.3392L23.897 19.8848C23.749 19.7891 23.749 19.5975 23.897 19.5017L30.7526 14.9881V29.5944C30.7526 29.7743 30.8513 29.9416 31.0116 30.0495L36.4 33.6053C36.5601 33.7129 36.6589 33.8805 36.6589 34.0605V45.6976C36.6589 45.8769 36.7577 46.0445 36.9181 46.1524L43.971 50.7979C44.1683 50.9293 44.4516 50.9293 44.6492 50.7979L51.7021 46.1524C51.8625 46.0445 51.961 45.8769 51.961 45.6976V34.0605C51.961 33.8805 52.0598 33.7129 52.2199 33.6053L57.6084 30.0495C57.7685 29.9416 57.8673 29.7743 57.8673 29.5944V14.9881L65.0066 19.6933L60.9872 22.3392H61.0116ZM51.9734 19.5855V16.5445L44.3163 11.5041L36.6589 16.5445V19.5855L44.3163 14.5451L51.9734 19.5855ZM69.236 23.4287L66.9919 24.9013C66.9303 24.9492 66.8807 25.0091 66.8807 25.0809V33.1022L61.1101 36.9098C61.0488 36.9574 61.0116 37.0174 61.0116 37.0891V39.5673C61.0116 39.7591 61.2581 39.8667 61.4309 39.7473L69.5442 34.3953C69.6058 34.3477 69.6553 34.2877 69.6553 34.216V23.5963C69.6553 23.4048 69.4089 23.297 69.236 23.4167" fill-rule="evenodd" clip-rule="evenodd" fill="white" />
        </svg>

        <span className={styles.portalLabel}>Customer registration</span></header>

      <main className={styles.main}>
        {demo && <div className={styles.demoBanner}>Local demo · no SMS or external writes. OTP: <strong>123456</strong></div>}
        {!online && <div className={styles.offlineBanner} role="status"><Icon name="offline" /><span>Offline. You can finish your verified draft and sync when you reconnect.</span></div>}
        <div className={styles.pageTitle}><div><p className={styles.eyebrow}>MOTOVOLT</p><h1>Register your vehicle</h1><p>Verify your number, fill in the details and submit.</p></div><span className={`${styles.connection} ${!online ? styles.connectionOffline : ""}`}>{online ? "Online" : "Offline"}</span></div>
        {loading ? <div className={styles.loading} role="status"><span className={styles.spinner} />Opening form…</div> : !context ? <section className={styles.card}><div className={styles.cardBody}><p role="alert">{error || "Reconnect and reload the form to continue."}</p><button className={styles.primary} onClick={() => window.location.reload()}>Reload form</button></div></section> : (
          <section className={styles.card}>
            <ol className={styles.steps} aria-label="Submission progress">
              {["Contact number", "Verify OTP", "Customer details"].map(
                (label, index) => (
                  <li
                    key={label}
                    className={step >= index ? styles.activeStep : ""}
                    aria-current={step === index ? "step" : undefined}
                  >
                    <span className={styles.stepCircle}>
                      {step > index ? <Icon name="check" /> : index + 1}
                    </span>
                    <span>{label}</span>
                  </li>
                ),
              )}
            </ol>
            <div className={styles.cardBody}>
              <label className={styles.honeypot} aria-hidden="true">Website<input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
              {!ready && !receipt && context.turnstileSiteKey && <><BotCheck siteKey={context.turnstileSiteKey} browserId={context.browserId} generation={captchaGeneration} onToken={setCaptchaToken} /><button type="button" className={styles.textButton} onClick={() => setCaptchaGeneration(v => v + 1)}>Refresh security check</button></>}
              {error && (
                <div className={styles.error} role="alert">
                  {error}
                </div>
              )}
              {notice && !receipt && (
                <p className={styles.notice} role="status">
                  {notice}
                </p>
              )}
              {!storageAvailable && !receipt && (
                <div className={styles.warning} role="status">
                  Offline saving is unavailable in this browser. Keep this
                  page open and connected until submission is confirmed.
                </div>
              )}
              {receipt ? (
                <div className={styles.success}>
                  <span className={styles.successMark}>
                    <Icon name="check" />
                  </span>
                  <h2>Customer registered.</h2>
                  <p>This entry is submitted and locked.</p>
                  <p className={styles.notice}>{demo ? "Demo entry only — no external data was saved." : receipt.sheetStatus === "done" ? "Added to Google Sheets and backed up in Supabase." : receipt.sheetStatus === "needs_attention" ? "Backup saved. Google Sheets sync needs review." : "Backup saved. Google Sheets sync is pending."}</p>
                  <dl className={styles.receipt}>
                    {[
                      ["Dealer", receipt.dealerName],
                      ["Customer", receipt.customerName],
                      ["Contact number", receipt.phone],
                      ["Email", receipt.email || "—"],
                      ["Age", String(receipt.age)],
                      ["Gender", receipt.gender ? GENDER_LABELS[receipt.gender] : "—"],
                      ["Product", receipt.productName],
                      ["Colour", receipt.colour || "—"],
                      ["Connectivity", receipt.connectivity ? CONNECTIVITY_LABELS[receipt.connectivity] : "—"],
                      ["Range", receipt.rangeVariant ? RANGE_LABELS[receipt.rangeVariant] : "—"],
                      ["Charger", receipt.chargerType ? CHARGER_LABELS[receipt.chargerType] : "—"],
                      ["Battery ID", receipt.batteryId || "—"],
                      ["VIN number", receipt.vin || "—"],
                      ["Payment mode", PAYMENT_LABELS[receipt.paymentMode]],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {receipt.paymentProofUrl && <a href={receipt.paymentProofUrl} target="_blank" rel="noopener noreferrer">View payment proof</a>}
                  <p className={styles.reference}>Reference · {receipt.id}</p>
                  <p>{receipt.purchaseStatus.count} of 5 purchases this month for this number.</p>
                  {alive(verification) && receipt.purchaseStatus.remaining > 0 && <button className={styles.primary} onClick={() => void reset(true)}>Register another purchase for this number</button>}
                  <button
                    className={styles.primary}
                    onClick={() => void reset()}
                  >
                    Record another customer
                  </button>
                </div>
              ) : queued && ready ? (
                <div className={styles.pending}>
                  <span className={styles.pendingMark}>
                    {busy === "submit" ? (
                      <span className={styles.spinner} />
                    ) : (
                      <Icon name="lock" />
                    )}
                  </span>
                  <h2>
                    {busy === "submit"
                      ? "Submitting your entry…"
                      : attention
                        ? "This entry needs attention"
                        : "Waiting to sync"}
                  </h2>
                  <p>
                    {attention
                      ? "Submission has not been confirmed. Check the message above before continuing."
                      : storageAvailable
                        ? "Your details are saved on this device. We’ll confirm when the entry reaches Motovolt."
                        : "Keep this page open and connected until submission is confirmed."}
                  </p>
                  <dl className={styles.receipt}>
                    {[
                      ["Dealer", getDealer(fields.dealerId)?.name || ""],
                      ["Customer", fields.customerName],
                      ["Contact number", verification?.phone || ""],
                      [
                        "Product",
                        context.products.find(
                          (v) => v.id === fields.productId,
                        )?.name || fields.productId,
                      ],
                      ["Email", fields.email],
                      ["Age", fields.age],
                      ["Gender", fields.gender ? GENDER_LABELS[fields.gender] : ""],
                      ["Battery ID", fields.batteryId || "—"],
                      ["VIN number", fields.vin || "—"],
                      ["Payment mode", fields.paymentMode ? PAYMENT_LABELS[fields.paymentMode] : ""],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className={styles.primary}
                    disabled={Boolean(busy) || !online}
                    onClick={() => {
                      setAttention(false);
                      submitRetryAt.current = 0;
                      void sync();
                    }}
                  >
                    Retry submission
                  </button>
                  <button
                    className={styles.textButton}
                    disabled={Boolean(busy)}
                    onClick={() => void reset()}
                  >
                    Discard unfinished entry
                  </button>
                </div>
              ) : ready ? (
                <form onSubmit={submit} className={styles.detailsForm}>
                  <div className={styles.verifiedBanner}>
                    <span>
                      <Icon name="check" />
                      <strong>{verification.phone}</strong>
                    </span>
                    <span>Verified</span>
                  </div>
                  {purchaseStatus && <p className={styles.notice}>{purchaseStatus.count} of 5 purchases this month. {purchaseStatus.remaining} remaining.</p>}
                  <div className={styles.sectionHeading}>
                    <h2>Customer details</h2>
                    <p>Check the details before submitting.</p>
                  </div>
                  <DealerSelect value={fields.dealerId} onChange={dealerId => setFields(v => ({ ...v, dealerId }))} disabled={locked} />
                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      Name
                      <input value={fields.customerName} onChange={e => setFields(v => ({ ...v, customerName: e.target.value }))} placeholder="Customer’s full name" autoComplete="off" required minLength={2} maxLength={100} disabled={locked} />
                    </label>
                    <label className={styles.field}>
                      Phone number
                      <input value={verification.phone} readOnly />
                    </label>
                    <label className={styles.field}>
                      Email (optional)
                      <input type="email" value={fields.email} onChange={e => setFields(v => ({ ...v, email: e.target.value }))} placeholder="customer@example.com" autoComplete="off" maxLength={254} disabled={locked} />
                    </label>
                    <label className={styles.field}>
                      Age
                      <input type="number" inputMode="numeric" value={fields.age} onChange={e => setFields(v => ({ ...v, age: e.target.value }))} placeholder="Age in years" required min={1} max={120} step={1} disabled={locked} />
                    </label>
                    <label className={styles.field}>
                      Gender
                      <select value={fields.gender} onChange={e => setFields(v => ({ ...v, gender: e.target.value as RegistrationFields["gender"] }))} required disabled={locked}>
                        <option value="" disabled>Select gender</option>
                        {Object.entries(GENDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      Product
                      <select value={fields.productId} onChange={e => setFields(v => ({ ...v, productId: e.target.value, colour: "", connectivity: "", rangeVariant: "", chargerType: "" }))} required disabled={locked}>
                        <option value="" disabled>Select a product</option>
                        {context.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <ProductOptions fields={fields} disabled={locked || Boolean(busy)} onChange={choices => setFields(v => ({ ...v, ...choices }))} />
                    <label className={styles.field}>
                      Battery ID
                      <input value={fields.batteryId} onChange={e => setFields(v => ({ ...v, batteryId: e.target.value }))} placeholder="Enter Battery ID" autoComplete="off" required maxLength={64} disabled={locked} />
                    </label>
                    <label className={styles.field}>
                      VIN number
                      <input value={fields.vin} onChange={e => setFields(v => ({ ...v, vin: e.target.value }))} placeholder="Enter VIN number" autoComplete="off" required maxLength={64} disabled={locked} />
                    </label>
                    <label className={styles.field}>
                      Payment mode
                      <select value={fields.paymentMode} onChange={e => { setFields(v => ({ ...v, paymentMode: e.target.value as RegistrationFields["paymentMode"], proofId: "" })); setProofImage(null); setProofUploaded(false); }} required disabled={locked}>
                        <option value="" disabled>Select payment mode</option>
                        {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <PaymentProof mode={fields.paymentMode} image={proofImage} uploaded={proofUploaded} disabled={locked || Boolean(busy)} onProcessing={setProofProcessing}
                    onChange={image => { setProofImage(image); setProofUploaded(false); setFields(v => ({ ...v, proofId: crypto.randomUUID() })); }} />
                  <p className={styles.lockNote}>
                    <Icon name="lock" />
                    Submitted entries cannot be edited.
                  </p>
                  <button className={styles.primary} disabled={Boolean(busy) || proofProcessing}>
                    {busy === "check" ? "Checking existing registrations…" : busy === "submit"
                      ? "Submitting…"
                      : online
                        ? "Submit registration"
                        : "Save & sync when online"}
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => void reset()}
                    disabled={Boolean(busy)}
                  >
                    Start a different entry
                  </button>
                </form>
              ) : verification && !expired ? (
                <form onSubmit={verify} className={styles.phoneForm}>
                  <div className={styles.sectionHeading}>
                    <h2>Verify the customer’s number</h2>
                    <p>
                      Enter the six-digit OTP sent to{" "}
                      <strong>{verification.phone}</strong>.
                    </p>
                  </div>
                  <label className={`${styles.field} ${styles.otpField}`}>
                    Verification code
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                      required
                      maxLength={6}
                    />
                  </label>
                  <button
                    className={styles.primary}
                    disabled={Boolean(busy) || code.length !== 6 || !online}
                  >
                    {busy === "verify" ? "Verifying…" : "Verify & continue"}
                  </button>
                  <div className={styles.resend}>
                    <span>Didn’t receive a code?</span>
                    <button
                      type="button"
                      onClick={() => void send(undefined, true)}
                      disabled={cooldown > 0 || Boolean(busy) || !online || (!demo && !captchaToken)}
                    >
                      {cooldown ? `Resend in ${cooldown}s` : "Resend OTP"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => void reset()}
                    disabled={Boolean(busy)}
                  >
                    Change contact number
                  </button>
                </form>
              ) : (
                <form onSubmit={send} className={styles.phoneForm}>
                  <div className={styles.sectionHeading}>
                    <h2>
                      {expired
                        ? "Verify the number again"
                        : "Start with a contact number"}
                    </h2>
                    <p>
                      {expired
                        ? "Your customer details are kept. Request a fresh OTP to finish."
                        : "Verified numbers on this browser skip OTP for 30 days. Up to five purchases per calendar month."}
                    </p>
                  </div>
                  <label className={styles.field}>
                    Customer contact number
                    <span className={styles.phoneInput}>
                      <span>+91</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          sendId.current = "";
                        }}
                        placeholder="10-digit mobile number"
                        maxLength={18}
                        required
                        readOnly={expired}
                      />
                    </span>
                  </label>
                  <label className={styles.consent}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      The customer agrees to phone verification and registration.
                    </span>
                  </label>
                  <button
                    className={styles.primary}
                    disabled={
                      Boolean(busy) || !online || !consent || cooldown > 0
                    }
                  >
                    {busy === "send"
                      ? "Checking number…"
                      : cooldown
                        ? `Try again in ${cooldown}s`
                        : "Continue"}
                  </button>
                  {expired && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => void reset()}
                    >
                      Discard unfinished entry
                    </button>
                  )}
                </form>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className={styles.footer}>Motovolt · Customer registration</footer>
    </div>
  );
}
