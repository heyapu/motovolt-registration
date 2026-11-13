"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ManagedDealer } from "@/lib/dealers";
import { api, ApiError } from "@/lib/client/api";
import { BrandLogo } from "../dashboard/BrandLogo";
import s from "./DealerManager.module.scss";

type Editor = { id: string | null; version: number | null; name: string; city: string; state: string; address: string };
const empty = (): Editor => ({ id: null, version: null, name: "", city: "", state: "", address: "" });
export function DealerManager() {
  const [dealers, setDealers] = useState<ManagedDealer[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ dealers: ManagedDealer[] }>("/api/dashboard/dealers");
      setDealers(data.dealers);
      setAuthorized(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAuthorized(false);
      else setError(error instanceof Error ? error.message : "Could not load dealers.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // Session expiry/revocation is always enforced on the server. Recheck on focus.
    const focus = () => { if (!busy) void load(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [busy, load]);
  const activeCount = dealers.filter(dealer => dealer.active).length;
  const matches = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return dealers.filter(dealer => (status === "all" || (status === "active" ? dealer.active : !dealer.active)) &&
      words.every(word => `${dealer.name} ${dealer.id} ${dealer.city} ${dealer.state} ${dealer.address}`.toLocaleLowerCase().includes(word)));
  }, [dealers, query, status]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("login"); setError("");
    try {
      await api("/api/dashboard/login", { code });
      setCode("");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not verify the access code."); }
    finally { setBusy(""); }
  }
  async function change(body: unknown, message: string, closeEditor = false) {
    if (busy) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      await api("/api/dashboard/dealers", body);
      if (closeEditor) setEditor(null);
      setNotice(message);
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAuthorized(false);
      if (error instanceof ApiError && error.code === "DEALER_CHANGED") await load();
      setError(error instanceof Error ? error.message : "Could not save this change.");
    } finally { setBusy(""); }
  }
  async function logout() {
    if (busy) return;
    setBusy("logout"); setError("");
    try {
      await api("/api/dashboard/logout", {});
      setDealers([]); setEditor(null); setAuthorized(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign out."); }
    finally { setBusy(""); }
  }
  function edit(dealer: ManagedDealer) {
    setEditor({ id: dealer.id, version: dealer.version, name: dealer.name, city: dealer.city, state: dealer.state, address: dealer.address });
    setError(""); setNotice("");
    requestAnimationFrame(() => document.getElementById("dealer-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor) void change({ action: "save", ...editor }, editor.id ? "Dealer updated." : "Dealer added and available in the registration form.", true);
  }
  return <main className={s.page}>
    <header className={s.header}>
      <a href="/" className={s.brand}><BrandLogo height={31} /><span>motovolt</span></a>
      <nav aria-label="Main navigation"><a href="/dashboard">Dashboard</a><a href="/">Registration form</a>
        {authorized && <button type="button" onClick={() => void logout()} disabled={Boolean(busy)}>Sign out</button>}
      </nav>
    </header>
    <div className={s.intro}><span className={s.eyebrow}>Dealer directory</span><h1>Manage dealers</h1>
      <p>Add a dealer, keep their details up to date, or archive a location.</p></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {notice && authorized && <p className={s.notice} role="status">{notice}</p>}
    {authorized === null ? <section className={s.panel} aria-live="polite">
      <p>{loading ? "Checking access…" : "Could not check access. Reload the page to try again."}</p>
    </section> : !authorized ? <section className={`${s.panel} ${s.gate}`}>
      <h2>Enter the dashboard access code</h2><p>Use the same passcode as the sales dashboard. Access lasts 15 days.</p>
      <form onSubmit={login}><label>Access code<input type="password" value={code} onChange={event => setCode(event.target.value)} required minLength={12} maxLength={64} autoComplete="off" disabled={Boolean(busy)} /></label>
        <button className={s.primary} disabled={Boolean(busy)}>{busy === "login" ? "Verifying…" : "Continue"}</button></form>
    </section> : <>
      <div className={s.stats}><div><strong>{dealers.length}</strong><span>Total dealers</span></div><div><strong>{activeCount}</strong><span>Active</span></div><div><strong>{dealers.length - activeCount}</strong><span>Archived</span></div></div>
      <div className={s.toolbar}>
        <label className={s.search}>Search dealers<input type="search" placeholder="Name, city, state or Dealer ID" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All dealers</option></select></label>
        <button type="button" className={s.primary} disabled={Boolean(busy)} onClick={() => { setEditor(empty()); setError(""); setNotice(""); }}>Add dealer</button>
      </div>
      {editor && <section id="dealer-editor" className={s.panel}>
        <h2>{editor.id ? `Edit dealer #${editor.id}` : "Add a new dealer"}</h2>
        <form onSubmit={save} className={s.editor}>
          <label className={s.wide}>Dealer name<input required minLength={2} maxLength={120} value={editor.name} disabled={Boolean(busy)} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
          <label>City<input required maxLength={100} value={editor.city} disabled={Boolean(busy)} onChange={event => setEditor({ ...editor, city: event.target.value })} /></label>
          <label>State<input required maxLength={100} value={editor.state} disabled={Boolean(busy)} onChange={event => setEditor({ ...editor, state: event.target.value })} /></label>
          <label className={s.wide}><span>Address <span className={s.optional}>(optional)</span></span><input maxLength={1000} value={editor.address} disabled={Boolean(busy)} onChange={event => setEditor({ ...editor, address: event.target.value })} /></label>
          <p className={s.wide}>Dealer IDs stay the same when editing. Existing registration details and Google Sheets rows are kept; location reports use the updated dealer directory.</p>
          <div className={`${s.actions} ${s.wide}`}><button className={s.primary} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save dealer"}</button><button type="button" disabled={Boolean(busy)} onClick={() => setEditor(null)}>Cancel</button></div>
        </form>
      </section>}
      <section className={s.panel} aria-busy={loading}>
        <div className={s.listHeading}><h2>{matches.length} {matches.length === 1 ? "dealer" : "dealers"}</h2>{loading && <span role="status">Updating…</span>}</div>
        <div className={s.tableWrap}><table><thead><tr><th scope="col">Dealer</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
          {matches.map(dealer => <tr key={dealer.id}><td><strong>{dealer.name}</strong><small>#{dealer.id}</small>{dealer.address && <small>{dealer.address}</small>}</td>
            <td>{dealer.city}<small>{dealer.state}</small></td><td><span className={dealer.active ? s.active : s.archived}>{dealer.active ? "Active" : "Archived"}</span></td>
            <td><div className={s.rowActions}><button type="button" disabled={Boolean(busy)} onClick={() => edit(dealer)} aria-label={`Edit ${dealer.name}`}>Edit</button>
              <button type="button" disabled={Boolean(busy)} aria-label={`${dealer.active ? "Archive" : "Restore"} ${dealer.name}`}
                onClick={() => void change({ action: "archive", id: dealer.id, version: dealer.version, archived: dealer.active }, dealer.active ? "Dealer archived. Past sales are retained." : "Dealer restored and available in the form.")}>{dealer.active ? "Archive" : "Restore"}</button></div></td></tr>)}
        </tbody></table></div>
        {!matches.length && <p className={s.empty}>No dealers match this search.</p>}
      </section>
      <p className={s.footer}>Archived dealers are hidden from new registrations. Their IDs and past sales stay in the database and reports.</p>
    </>}
  </main>;
}
