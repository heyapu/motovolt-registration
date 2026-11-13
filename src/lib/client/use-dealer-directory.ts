"use client";
import { useCallback, useEffect, useState } from "react";
import type { Dealer, DealerDirectory } from "../dealers";

// One cached database document per load, not a query per keystroke.
export function useDealerDirectory(enabled: boolean) {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true, sequence = 0, lastLoad = 0;
    const controllers = new Set<AbortController>();
    async function load() {
      lastLoad = Date.now();
      const requestId = ++sequence;
      const controller = new AbortController();
      controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 15000);
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/dealers", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Could not load the dealer list.");
        if (!Array.isArray(data.dealers)) throw new Error("Could not load the dealer list.");
        if (active && requestId === sequence) setDealers((data as DealerDirectory).dealers);
      } catch (error) {
        if (active && requestId === sequence) setError(error instanceof Error && error.name !== "AbortError" ? error.message : "Could not load dealers. Check your connection and reload the page.");
      } finally {
        clearTimeout(timer);
        controllers.delete(controller);
        if (active && requestId === sequence) setLoading(false);
      }
    }
    void load();
    const focus = () => { if (Date.now() - lastLoad > 30000) void load(); };
    const online = () => void load();
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    return () => {
      active = false;
      for (const controller of controllers) controller.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
    };
  }, [enabled, generation]);
  const reload = useCallback(() => setGeneration(value => value + 1), []);
  return { dealers, loading, error, reload };
}
