"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { DEALERS, dealerLabel, getDealer } from "@/lib/dealers";
import styles from "./DealerSelect.module.scss";
export function DealerSelect({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const id = useId(), [query, setQuery] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const selected = getDealer(value);
  const matches = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return DEALERS.filter(d => words.every(w => `${d.name} ${d.city} ${d.state} ${d.address} #${d.id}`.toLocaleLowerCase().includes(w))).slice(0, 30);
  }, [query]);
  useEffect(()=>{if(open)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:"nearest"});},[active,open,id]);
  function choose(index: number) { const dealer = matches[index]; if (dealer) { onChange(dealer.id); setOpen(false); setQuery(""); } }
  return <div className={styles.control}>
    <label htmlFor={id}>Dealer name</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={open}
      aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined} autoComplete="off" disabled={disabled}
      value={open ? query : selected ? dealerLabel(selected) : query} placeholder="Type a dealer name or city" required
      onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
      onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); setActive(0); }}
      onBlur={() => setOpen(false)} onKeyDown={e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(v => Math.max(0, Math.min(matches.length - 1, v + (e.key === "ArrowDown" ? 1 : -1)))); }
        if (e.key === "Enter" && open) { e.preventDefault(); choose(active); }
        if (e.key === "Escape") setOpen(false);
      }} />
    {open && <ul id={`${id}-list`} role="listbox" aria-label="Matching dealers" className={styles.options}>
      {matches.map((dealer, index) => <li key={dealer.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
        onMouseDown={e => { e.preventDefault(); choose(index); }} className={active === index ? styles.active : undefined}>
        <span>{dealer.name}</span><small>{dealer.city}, {dealer.state} · #{dealer.id}</small>
        <small>{dealer.address}</small>
      </li>)}
      {!matches.length && <li className={styles.empty}>No matching dealer. Try the city or another name.</li>}
      {matches.length === 30 && <li className={styles.empty}>Keep typing to narrow the list.</li>}
    </ul>}
  </div>;
}
