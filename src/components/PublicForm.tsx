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
  PaymentProof as UploadedProof,
} from "@/lib/types";
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
  dealerId: "", gender: "", proofId: "", customerName: "", email: "", age: "", productId: "", batteryId: "", vin: "", paymentMode: "",
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
        form.set("attemptId", verification.id); form.set("proofId", proofId); form.set("paymentMode", fields.paymentMode); form.set("website", website);

        form.set(
          "image",
          proofImage,
          proofImage.type === "image/png"
            ? "payment-proof.png"
            : proofImage.type === "image/webp"
              ? "payment-proof.webp"
              : "payment-proof.jpg",
        );

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
        if (["DUPLICATE_PHONE", "DUPLICATE_VIN", "DUPLICATE_BATTERY", "INVALID_INPUT", "INVALID_PRODUCT", "INVALID_DEALER", "PROOF_REQUIRED", "PROOF_MISMATCH", "DUPLICATE_PROOF", "INVALID_IMAGE"].includes(e.code)) {
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
    if (!demo && !captchaToken) { setError("Complete the security check before sending an OTP."); return; }
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
        const existing = await api<{ phoneExists: boolean; batteryExists: boolean; vinExists: boolean }>("/api/registrations/check", {
          phone: verification.phone, batteryId: parsed.data.batteryId, vin: parsed.data.vin, attemptId: verification.id,
        });
        if (existing.phoneExists || existing.batteryExists || existing.vinExists) {
          setError(existing.phoneExists ? "This phone number is already registered." : existing.vinExists ? "This VIN number is already registered." : "This Battery ID is already registered.");
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

  async function reset() {
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
    setVerification(null);
    setFields(emptyFields());
    setProofImage(null); setProofUploaded(false); setProofProcessing(false);
    setPhone("");
    setCode("");
    setConsent(false);
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
        <div className={styles.brand}>
          <svg height="22" viewBox="0 0 234 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M100.577 12.0321C100.112 11.6087 99.4843 11.296 98.719 11.1072C97.9927 10.9313 97.07 10.8401 95.9778 10.8401H84.3324C83.2527 10.8401 82.3434 10.9313 81.6109 11.1072C80.8451 11.296 80.2234 11.6087 79.7525 12.0321C79.2751 12.4621 78.9347 13.0353 78.7454 13.7258C78.5619 14.3772 78.4705 15.172 78.4705 16.0903V20.507C78.4705 21.4384 78.5619 22.2333 78.7454 22.8781C78.9414 23.562 79.2815 24.1288 79.7525 24.5587C80.2234 24.9823 80.8451 25.2883 81.6109 25.4771C82.3367 25.6597 83.2527 25.7508 84.3324 25.7508H95.9778C97.07 25.7508 97.9927 25.6597 98.719 25.4771C99.4843 25.2883 100.106 24.9758 100.577 24.5587C101.048 24.1288 101.388 23.562 101.585 22.8781C101.767 22.2333 101.866 21.4384 101.866 20.507V16.0903C101.866 15.1784 101.774 14.3837 101.585 13.7258C101.388 13.0353 101.048 12.4621 100.57 12.0321M82.5592 20.9565C82.5004 20.6894 82.4743 20.3376 82.4743 19.9143V16.6961C82.4743 16.2859 82.5004 15.9472 82.5592 15.6931C82.6048 15.4781 82.6901 15.3153 82.8144 15.1915C82.9387 15.0742 83.1221 14.983 83.3509 14.9309C83.6322 14.8658 84.0184 14.8397 84.4826 14.8397H95.8598C96.2918 14.8397 96.6516 14.8723 96.9327 14.9309C97.1684 14.983 97.3451 15.0677 97.4694 15.1915C97.6003 15.3218 97.6917 15.4846 97.7505 15.7061C97.816 15.9601 97.8551 16.2923 97.8551 16.6961V19.9143C97.8551 20.331 97.8228 20.6765 97.7505 20.937C97.6917 21.1519 97.6003 21.3277 97.4823 21.445C97.358 21.5622 97.1813 21.6403 96.9459 21.686C96.6646 21.7448 96.298 21.7707 95.8661 21.7707H84.4894C84.0184 21.7707 83.6322 21.7448 83.3441 21.686C83.1087 21.6403 82.9323 21.5556 82.8082 21.445C82.6901 21.3277 82.6048 21.1714 82.5592 20.9565Z" fill="white" />
            <path d="M104.08 10.9834V14.7485L111.303 14.7029V25.7443H115.339V14.6638L121.941 14.4033V10.8401L104.08 10.9834Z" fill="white" />
            <path d="M159.93 21.1324L153.401 10.8401H148.559L157.162 24.2396C157.457 24.7021 157.797 25.067 158.177 25.3274C158.582 25.6075 159.145 25.7444 159.864 25.7444C160.584 25.7444 161.147 25.6009 161.552 25.3274C161.932 25.067 162.272 24.7021 162.566 24.2396L171.215 10.8401H166.439L159.93 21.1324Z" fill="white" />
            <path d="M204.267 21.6275C204.013 21.5622 203.809 21.4581 203.666 21.3277C203.529 21.1975 203.431 21.0281 203.372 20.8132C203.306 20.5656 203.266 20.2529 203.266 19.8753L203.384 10.8401H199.387V20.5004C199.387 21.432 199.478 22.2268 199.661 22.8717C199.859 23.5554 200.199 24.1224 200.676 24.5522C201.147 24.9758 201.769 25.2883 202.533 25.4771C203.261 25.6597 204.176 25.7508 205.256 25.7508H216.862L216.743 21.7382H205.412C204.949 21.7382 204.563 21.7057 204.267 21.6275Z" fill="white" />
            <path d="M64.9784 25.4977C64.0033 25.4977 63.4474 25.0416 63.1528 24.6638L57.52 17.9283V25.6865H53.5093V12.2219C53.5093 11.3881 53.9216 10.9451 54.2682 10.7171C54.6806 10.4501 55.1842 10.3133 55.7665 10.3133C56.2183 10.3133 56.5843 10.385 56.8853 10.5282C57.1863 10.6781 57.4612 10.9061 57.6967 11.2188L65.0174 20.3384L71.8869 11.2188C72.1162 10.9126 72.371 10.6846 72.6459 10.5413C72.9272 10.3914 73.287 10.3133 73.7383 10.3133C74.3204 10.3133 74.8247 10.4501 75.2364 10.7171C75.5899 10.9451 76.0021 11.3946 76.0021 12.2284V25.7517H71.9525V17.9283L66.8038 24.6638C66.5028 25.0548 65.9466 25.5107 64.9718 25.5107" fill="white" />
            <path d="M215.838 10.9834V14.7485L223.062 14.7029V25.7443H227.097V14.6638L233.698 14.4033V10.8401L215.838 10.9834Z" fill="white" />
            <path d="M146.157 12.0321C145.692 11.6087 145.064 11.296 144.299 11.1072C143.572 10.9313 142.65 10.8401 141.557 10.8401H129.912C128.839 10.8401 127.923 10.9313 127.19 11.1072C126.425 11.296 125.804 11.6087 125.332 12.0321C124.855 12.4621 124.515 13.0353 124.325 13.7258C124.135 14.3772 124.044 15.172 124.044 16.0903V20.507C124.044 21.4384 124.135 22.2333 124.325 22.8781C124.515 23.562 124.861 24.1288 125.332 24.5587C125.804 24.9823 126.425 25.2883 127.19 25.4771C127.917 25.6597 128.833 25.7508 129.912 25.7508H141.557C142.65 25.7508 143.572 25.6597 144.299 25.4771C145.064 25.2883 145.686 24.9758 146.157 24.5587C146.628 24.1288 146.968 23.562 147.164 22.8781C147.348 22.2333 147.445 21.4384 147.445 20.507V16.0903C147.445 15.1784 147.348 14.3837 147.164 13.7258C146.968 13.0353 146.628 12.4621 146.15 12.0321M128.133 20.9565C128.074 20.6894 128.048 20.3376 128.048 19.9143V16.6961C128.048 16.2859 128.074 15.9472 128.133 15.6931C128.178 15.4781 128.263 15.3153 128.388 15.1915C128.512 15.0742 128.695 14.983 128.924 14.9309C129.205 14.8658 129.592 14.8397 130.056 14.8397H141.433C141.858 14.8397 142.218 14.8723 142.506 14.9309C142.742 14.983 142.918 15.0677 143.043 15.1915C143.174 15.3218 143.265 15.4846 143.324 15.7061C143.389 15.9601 143.429 16.2923 143.429 16.6961V19.9143C143.429 20.331 143.396 20.6765 143.324 20.937C143.265 21.1519 143.174 21.3277 143.056 21.445C142.931 21.5622 142.755 21.6403 142.519 21.686C142.238 21.7448 141.871 21.7707 141.44 21.7707H130.063C129.592 21.7707 129.206 21.7448 128.917 21.686C128.682 21.6403 128.506 21.5556 128.381 21.445C128.263 21.3277 128.178 21.1714 128.133 20.9565Z" fill="white" />
            <path d="M194.891 12.0321C194.426 11.6087 193.798 11.296 193.032 11.1072C192.306 10.9313 191.385 10.8401 190.292 10.8401H178.646C177.574 10.8401 176.658 10.9313 175.932 11.1072C175.166 11.296 174.545 11.6087 174.073 12.0321C173.596 12.4621 173.255 13.0353 173.066 13.7258C172.883 14.3772 172.791 15.172 172.791 16.0903V20.507C172.791 21.4384 172.883 22.2333 173.066 22.8781C173.262 23.562 173.603 24.1288 174.073 24.5587C174.545 24.9823 175.166 25.2883 175.932 25.4771C176.658 25.6597 177.574 25.7508 178.646 25.7508H190.292C191.385 25.7508 192.306 25.6597 193.032 25.4771C193.798 25.2883 194.421 24.9758 194.891 24.5587C195.361 24.1288 195.702 23.562 195.899 22.8781C196.082 22.2333 196.174 21.4384 196.174 20.507V16.0903C196.174 15.1784 196.082 14.3837 195.899 13.7258C195.702 13.0353 195.361 12.4621 194.884 12.0321M176.874 20.9565C176.815 20.6894 176.788 20.3376 176.788 19.9143V16.6961C176.788 16.2859 176.815 15.9472 176.874 15.6931C176.919 15.4781 177.004 15.3153 177.128 15.1915C177.253 15.0742 177.436 14.983 177.666 14.9309C177.946 14.8658 178.333 14.8397 178.797 14.8397H190.175C190.605 14.8397 190.966 14.8723 191.246 14.9309C191.482 14.983 191.66 15.0677 191.784 15.1915C191.914 15.3218 192.005 15.4846 192.064 15.7061C192.13 15.9601 192.17 16.2923 192.17 16.6961V19.9143C192.17 20.331 192.137 20.6765 192.064 20.937C192.005 21.1519 191.914 21.3277 191.796 21.445C191.672 21.5622 191.495 21.6403 191.26 21.686C190.972 21.7448 190.612 21.7707 190.18 21.7707H178.803C178.333 21.7707 177.946 21.7448 177.659 21.686C177.424 21.6403 177.246 21.5556 177.121 21.445C177.004 21.3277 176.919 21.1714 176.874 20.9565Z" fill="white" />
            <path fillRule="evenodd" clipRule="evenodd" d="M10.5955 28.5868C10.5953 28.5867 10.5956 28.587 10.5955 28.5868Z" fill="#F04E23" />
            <path d="M14.0317 0.416326C20.7036 -0.312716 48.3913 -0.918341 47.6135 6.26098C47.6003 7.10723 47.5479 8.00042 47.4628 8.95733C47.0432 16.9966 42.258 25.0561 34.7152 30.498C34.0595 30.9282 33.3933 31.4094 32.7092 31.9035C30.1114 33.7801 27.2569 35.842 23.7501 35.9915C19.2682 35.7632 13.9732 31.3818 10.5955 28.5868C10.3085 28.3494 10.0356 28.1235 9.77797 27.9125C3.89959 22.6983 0.700408 15.8834 0.169446 8.95733C0.155686 8.81698 0.13997 8.67118 0.123783 8.52102C-0.060473 6.81168 -0.305653 4.53715 1.58002 3.29244C4.49438 1.589 8.03904 1.15611 11.9069 0.683754C12.6052 0.598469 13.3141 0.511895 14.0317 0.416326Z" fill="#F04E23" />
            <path fillRule="evenodd" clipRule="evenodd" d="M27.9176 14.0188V12.3788L23.8043 9.67118L19.6908 12.3788V14.0188L23.8043 11.3112L27.9176 14.0188ZM11.6895 13.4786C11.6895 13.44 11.6695 13.4014 11.6364 13.3821L10.4309 12.591C10.3382 12.5331 10.2123 12.591 10.2123 12.6875V18.3922C10.2123 18.4307 10.2322 18.4693 10.2653 18.4887L14.6237 21.3635C14.7165 21.4213 14.8423 21.3635 14.8423 21.267V19.9357C14.8423 19.8972 14.8225 19.8585 14.7893 19.8392L11.6895 17.7941V13.4786ZM10.4243 20.4501C10.3315 20.3923 10.2057 20.4501 10.2057 20.5466V21.8781C10.2057 21.9166 10.2256 21.9552 10.2587 21.9744L14.6171 24.8493C14.7098 24.9072 14.8357 24.8493 14.8357 24.7529V23.4217C14.8357 23.383 14.8158 23.3444 14.7827 23.3252L10.4243 20.4501ZM37.1908 20.4501L32.8323 23.3252C32.7992 23.3507 32.7794 23.383 32.7794 23.4217V24.7529C32.7794 24.8558 32.9119 24.9137 33.0047 24.8493L37.363 21.9744C37.3961 21.9487 37.4226 21.9166 37.4226 21.8781V20.5466C37.4226 20.4438 37.2901 20.386 37.1975 20.4501M37.4094 10.5716L29.6132 5.43284V14.0831L26.5795 16.0832C26.4935 16.1412 26.4406 16.2312 26.4406 16.3276V22.8878C26.4406 22.9841 26.3875 23.0742 26.3013 23.1321L23.9962 24.6564C23.8903 24.7272 23.7381 24.7272 23.6319 24.6564L21.327 23.1321C21.2409 23.0742 21.1878 22.9841 21.1878 22.8878V16.3276C21.1878 16.2312 21.1347 16.1412 21.0487 16.0832L18.015 14.0831V5.43284L10.3713 10.4687C10.2918 10.5201 10.2918 10.623 10.3713 10.6745L13.3785 12.6618V16.8873C13.3785 16.9837 13.4315 17.0737 13.5176 17.1315L16.3989 19.0288C16.485 19.0868 16.538 19.1768 16.538 19.2732V25.9492C16.538 26.0457 16.591 26.1355 16.6771 26.1935L23.6386 30.7855C23.7447 30.8562 23.8969 30.8562 24.0029 30.7855L30.9646 26.1935C31.0506 26.1355 31.1035 26.0457 31.1035 25.9492V19.2732C31.1035 19.1768 31.1565 19.0868 31.2427 19.0288L34.124 17.1315C34.2102 17.0737 34.2631 16.9837 34.2631 16.8873V12.6618L37.4226 10.578L37.4094 10.5716ZM32.7728 11.9993V16.2248C32.7728 16.3213 32.7199 16.4113 32.6337 16.4693L29.7524 18.3664C29.6662 18.4242 29.6132 18.5143 29.6132 18.6109V25.2866C29.6132 25.3831 29.5603 25.4733 29.4743 25.5309L23.9898 29.1456C23.8836 29.2164 23.7314 29.2164 23.6253 29.1456L18.1408 25.5309C18.0548 25.4733 18.0019 25.3831 18.0019 25.2866V18.6109C18.0019 18.5143 17.9488 18.4242 17.8628 18.3664L14.9814 16.4693C14.8953 16.4113 14.8423 16.3213 14.8423 16.2248V11.9993L12.8353 10.6809C12.7558 10.6294 12.7558 10.5266 12.8353 10.4751L16.5181 8.05042V15.8967C16.5181 15.9934 16.5711 16.0832 16.6572 16.1412L19.5518 18.0514C19.6378 18.1091 19.6908 18.1992 19.6908 18.2959V24.5471C19.6908 24.6435 19.7439 24.7335 19.8301 24.7915L23.6188 27.2869C23.7248 27.3575 23.877 27.3575 23.9831 27.2869L27.7719 24.7915C27.858 24.7335 27.9109 24.6435 27.9109 24.5471V18.2959C27.9109 18.1992 27.964 18.1091 28.05 18.0514L30.9446 16.1412C31.0306 16.0832 31.0837 15.9934 31.0837 15.8967V8.05042L34.9188 10.578L32.7597 11.9993H32.7728ZM27.9176 10.5201V8.88653L23.8043 6.17887L19.6908 8.88653V10.5201L23.8043 7.81245L27.9176 10.5201ZM37.1908 12.5846L35.9853 13.3757C35.9522 13.4014 35.9256 13.4336 35.9256 13.4721V17.7811L32.8257 19.8265C32.7928 19.852 32.7728 19.8843 32.7728 19.9228V21.2541C32.7728 21.357 32.9052 21.4148 32.998 21.3507L37.3563 18.4757C37.3894 18.4502 37.4161 18.4179 37.4161 18.3794V12.6746C37.4161 12.5718 37.2837 12.5138 37.1908 12.5781" fill="white" />
          </svg>

        </div><span className={styles.portalLabel}>Customer registration</span>
      </header>
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
                      ["Email", receipt.email],
                      ["Age", String(receipt.age)],
                      ["Gender", receipt.gender ? GENDER_LABELS[receipt.gender] : "—"],
                      ["Product", receipt.productName],
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
                      Email
                      <input type="email" value={fields.email} onChange={e => setFields(v => ({ ...v, email: e.target.value }))} placeholder="customer@example.com" autoComplete="off" required maxLength={254} disabled={locked} />
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
                      <select value={fields.productId} onChange={e => setFields(v => ({ ...v, productId: e.target.value }))} required disabled={locked}>
                        <option value="" disabled>Select a product</option>
                        {context.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
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
                        : "We check for an existing registration before sending an OTP."}
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
                      The customer agrees to receive a verification SMS.
                    </span>
                  </label>
                  <button
                    className={styles.primary}
                    disabled={
                      Boolean(busy) || !online || !consent || cooldown > 0 || (!demo && !captchaToken)
                    }
                  >
                    {busy === "send"
                      ? "Sending OTP…"
                      : cooldown
                        ? `Try again in ${cooldown}s`
                        : "Send OTP"}
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
