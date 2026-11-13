"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { dealerLabel, type Dealer } from "@/lib/dealers";
import styles from "./DealerSelect.module.scss";

export function DealerSelect({ value, onChange, disabled, dealers, loading, error }: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  dealers: readonly Dealer[];
  loading: boolean;
  error: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = dealers.find(dealer => dealer.id === value);
  const matches = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return dealers.filter(dealer => words.every(word =>
      `${dealer.name} ${dealer.city} ${dealer.state} ${dealer.address} #${dealer.id}`.toLocaleLowerCase().includes(word),
    )).slice(0, 30);
  }, [query, dealers]);
  useEffect(() => { setActive(0); }, [dealers]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function choose(index: number) {
    const dealer = matches[index];
    if (dealer) { onChange(dealer.id); setOpen(false); setQuery(""); }
  }
  return <div className={styles.control}>
    <label htmlFor={id}>Dealer name</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={open}
      aria-describedby={error ? `${id}-error` : undefined}
      aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
      autoComplete="off" disabled={disabled || (loading && !dealers.length)} required
      value={open ? query : selected ? dealerLabel(selected) : value ? `Dealer #${value} · unavailable` : query}
      placeholder={loading ? "Loading dealers…" : "Type a dealer name or city"}
      onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
      onChange={event => { setQuery(event.target.value); onChange(""); setOpen(true); setActive(0); }}
      onBlur={() => setOpen(false)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
        }
        if (event.key === "Enter" && open) { event.preventDefault(); choose(active); }
        if (event.key === "Escape") setOpen(false);
      }} />
    {error && <small id={`${id}-error`} role="alert">{error}</small>}
    {open && <ul id={`${id}-list`} role="listbox" aria-label="Matching dealers" className={styles.options}>
      {matches.map((dealer, index) => <li key={dealer.id} id={`${id}-option-${index}`} role="option"
        aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}
        className={active === index ? styles.active : undefined}>
        <span>{dealer.name}</span><small>{dealer.city}, {dealer.state} · #{dealer.id}</small>
        <small>{dealer.address}</small>
      </li>)}
      {!matches.length && <li className={styles.empty}>{loading ? "Loading dealers…" : "No matching active dealer. Try another name or city."}</li>}
      {matches.length === 30 && <li className={styles.empty}>Keep typing to narrow the list.</li>}
    </ul>}
  </div>;
}
