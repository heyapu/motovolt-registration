"use client";
import { useEffect, useRef, useState } from "react";
export function FinanceSelect({ value, disabled, onChange }: {
    value: string;
    disabled: boolean;
    onChange: (name: string) => void;
}) {
    const [options, setOptions] = useState<{
        id: string;
        name: string;
    }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const current = useRef({ value, onChange });
    current.current = { value, onChange };
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const response = await fetch("/api/finance-options", { cache: "no-store", signal: controller.signal });
                const data = await response.json();
                if (!response.ok)
                    throw new Error(data.error?.message || "Could not load finance options.");
                if (active) {
                    setOptions(data.options);
                    if (current.current.value && !data.options.some((o: {
                        name: string;
                    }) => o.name === current.current.value))
                        current.current.onChange("");
                }
            }
            catch (error) {
                if (active)
                    setError(error instanceof Error ? error.message : "Could not load finance options.");
            }
            finally {
                if (active)
                    setLoading(false);
            }
        }
        void load();
        const focus = () => void load();
        window.addEventListener("focus", focus);
        return () => { active = false; controller.abort(); window.removeEventListener("focus", focus); };
    }, []);
    return <><select value={value} required disabled={disabled} onChange={event => onChange(event.target.value)} aria-label="Financer name">
 <option value="" disabled>{loading ? "Loading finance options…" : options.length ? "Choose a financer" : "No finance options available"}</option>
 {options.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
 </select>
 {error && <small role="alert">{error}</small>}
 </>;
}
