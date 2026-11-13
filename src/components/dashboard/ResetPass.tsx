"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLogo } from "./BrandLogo";
import s from "./ResetPass.module.scss";
export function ResetPass() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (value && /^[a-f0-9]{64}$/.test(value)) setToken(value);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (token && code !== confirmation) { setError("The access codes do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/dashboard/reset/${token ? "complete" : "request"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify(token ? { token, code } : { email: email.trim() }), signal: AbortSignal.timeout(20000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Could not complete the request.");
      setMessage(token ? "Access code updated. Everyone has been signed out. Use the new code to sign in." : data.message);
      if (token) { setDone(true); setCode(""); setConfirmation(""); setToken(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <main className={s.page}><section className={s.card}>
    <BrandLogo /><p className={s.eyebrow}>Motovolt dashboard</p>
    <h1>{done ? "Access code updated" : token ? "Choose a new access code" : "Reset access code"}</h1>
    {!ready ? <p role="status">Loading…</p> : !done && <>
      <p>{token ? "This changes the shared dashboard code and signs everyone out." : "Enter the approved administrator email. We’ll send a reset link if it matches."}</p>
      <form onSubmit={submit}>
        {token ? <><label>New access code<input type="password" autoComplete="new-password" minLength={12} maxLength={64} pattern="[\x21-\x7e]{12,64}" required value={code} onChange={e => setCode(e.target.value)} disabled={busy} /></label>
          <small>Use a unique code of 12–64 characters, without spaces.</small>
          <label>Confirm access code<input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label></>
          : <label>Administrator email<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>}
        <button disabled={busy}>{busy ? "Please wait…" : token ? "Update access code" : "Send reset link"}</button>
      </form></>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={s.error}>{error}</p>}
    <a href="/dashboard">Back to dashboard</a>
  </section></main>;
}
