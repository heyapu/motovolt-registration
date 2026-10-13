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
} from "@/lib/types";
import { fieldsSchema, normalizePhone } from "@/lib/validation";
import { api, ApiError } from "@/lib/client/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/client/drafts";
import { PAYMENT_LABELS } from "@/lib/types";
import { BotCheck } from "./BotCheck";
import { Icon } from "./Icon";
import styles from "./PublicForm.module.scss";

const emptyFields = (): RegistrationFields => ({
  dealerName: "", customerName: "", email: "", age: "", productId: "", batteryId: "", vin: "", paymentMode: "",
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
    setFields(draft.fields);
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
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
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
        queued,
        savedAt: Date.now(),
      })
        .then(() => setStorageAvailable(true))
        .catch(() => setStorageAvailable(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [context, verification, fields, queued, receipt, requestId]);

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
      const { receipt: result } = await api<{ receipt: Receipt }>(
        "/api/submissions",
        { ...fields, attemptId: verification.id, requestId, website },
      );
      await complete(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not confirm this entry.",
      );
      if (e instanceof ApiError) {
        submitRetryAt.current = Date.now() + Math.max(30, e.retryAfter) * 1000;
        if (["DUPLICATE_PHONE", "DUPLICATE_VIN", "DUPLICATE_BATTERY", "INVALID_INPUT", "INVALID_PRODUCT"].includes(e.code)) {
          // Rejected before commit: keep the details editable for correction.
          setQueued(false);
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
  }, [context, verification, fields, requestId, complete, website]);

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
    if (!context || !verification || working.current) return;
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
      }).catch(() => {});
    }, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [receipt?.id, receipt?.sheetStatus, demo, online]);

  async function reset() {
    if (
      verification &&
      !receipt &&
      !window.confirm("Discard this unfinished entry and start a new customer?")
    )
      return;
    if (context)
      try {
        await clearDraft(context.browserId);
      } catch {}
    setVerification(null);
    setFields(emptyFields());
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
      <header className={styles.header}><div className={styles.brand}><span className={styles.brandMark}><Icon name="bolt" /></span><span>MOTOVOLT</span></div><span className={styles.portalLabel}>Customer registration</span></header>
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
                {!ready && !receipt && context.turnstileSiteKey && <><BotCheck siteKey={context.turnstileSiteKey} browserId={context.browserId} generation={captchaGeneration} onToken={setCaptchaToken} /><button type="button" className={styles.textButton} onClick={() => setCaptchaGeneration(v => v+1)}>Refresh security check</button></>}
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
                        ["Dealer", fields.dealerName],
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
                    <label className={styles.field}>
                      Dealer name
                      <input value={fields.dealerName} onChange={e => setFields(v => ({ ...v, dealerName: e.target.value }))} placeholder="Store where the vehicle was bought" required minLength={2} maxLength={120} disabled={locked} />
                    </label>
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
                        Product
                        <select value={fields.productId} onChange={e => setFields(v => ({ ...v, productId: e.target.value }))} required disabled={locked}>
                          <option value="" disabled>Select a product</option>
                          {context.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className={styles.field}>
                        Battery ID (optional)
                        <input value={fields.batteryId} onChange={e => setFields(v => ({ ...v, batteryId: e.target.value }))} placeholder="Enter Battery ID" autoComplete="off" maxLength={64} disabled={locked} />
                      </label>
                      <label className={styles.field}>
                        VIN number (optional)
                        <input value={fields.vin} onChange={e => setFields(v => ({ ...v, vin: e.target.value }))} placeholder="Enter VIN number" autoComplete="off" maxLength={64} disabled={locked} />
                      </label>
                      <label className={styles.field}>
                        Payment mode
                        <select value={fields.paymentMode} onChange={e => setFields(v => ({ ...v, paymentMode: e.target.value as RegistrationFields["paymentMode"] }))} required disabled={locked}>
                          <option value="" disabled>Select payment mode</option>
                          {Object.entries(PAYMENT_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                    <p className={styles.lockNote}>
                      <Icon name="lock" />
                      Submitted entries cannot be edited.
                    </p>
                    <button className={styles.primary} disabled={Boolean(busy)}>
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
