"use client";
import { useEffect, useState } from "react";
import s from "./FinanceSettings.module.scss";
type Option = {
    id: string;
    name: string;
    active: boolean;
};
export function FinanceSettings() {
    const [options, setOptions] = useState<Option[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch("/api/dashboard/financers", { cache: "no-store", signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok)
            throw new Error(data.error?.message || "Could not load finance settings."); setOptions(data.options); }).catch(error => { if (!controller.signal.aborted)
            setError(error.message); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [retry]);
    async function toggle(option: Option) {
        setBusy(option.id);
        setError("");
        try {
            const response = await fetch("/api/dashboard/financers", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: option.id, active: !option.active }) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error?.message || "Could not update this financer.");
            setOptions(data.options);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Could not update this financer.");
        }
        finally {
            setBusy(null);
        }
    }
    return <section className={s.panel}><h2>Finance options</h2><p>Enable each partner when it is ready. Disabled partners are hidden from new registrations.</p>
 {error && <p className={s.error} role="alert">{error}</p>}
 {loading ? <p role="status">Loading finance options…</p> : <ul>{options.map(option => <li key={option.id}><div><strong>{option.name}</strong><span>{option.active ? "Available in registration form" : "Disabled · not available in form"}</span></div><button type="button" role="switch" aria-checked={option.active} aria-label={`Enable ${option.name}`} disabled={busy !== null} onClick={() => void toggle(option)} className={option.active ? s.enabled : ""}>{busy === option.id ? "Saving…" : option.active ? "Enabled" : "Enable"}</button></li>)}</ul>}
 <button type="button" onClick={() => setRetry(v => v + 1)} disabled={loading || busy !== null}>Refresh settings</button>
 <small>Existing registrations keep their saved financer. Open forms reload finance options when the window regains focus.</small></section>;
}
