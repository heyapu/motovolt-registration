import type { DashboardFilters } from "./types";
export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function offsetDate(value: string, days: number): string {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function defaultFilters(): DashboardFilters {
  const to = indiaDate();
  return {
    from: offsetDate(to, -29),
    to,
    product: "",
    state: "",
    city: "",
    dealer: "",
  };
}
export function parseFilters(params: URLSearchParams): DashboardFilters {
  const defaults = defaultFilters();
  const result = { ...defaults };
  for (const key of Object.keys(result) as (keyof DashboardFilters)[]) {
    const value = params.get(key);
    if (value !== null) result[key] = value;
  }
  for (const key of ["from", "to"] as const) {
    const value = result[key];
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
        new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value)
    )
      throw new Error("Choose valid dates.");
  }
  if (
    (result.from && result.from < "2000-01-01") ||
    !result.to ||
    result.to > indiaDate() ||
    (result.from && result.from > result.to)
  )
    throw new Error("Choose a date range ending today or earlier.");
  if (Object.values(result).some((v) => v.length > 120))
    throw new Error("Invalid filter.");
  return result;
}
export function filterQuery(filters: DashboardFilters): string {
  return new URLSearchParams(filters).toString();
}
