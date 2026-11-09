"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Bucket,
  DashboardData,
  DashboardFilters,
  Ranking,
} from "@/lib/dashboard/types";
import {
  defaultFilters,
  filterQuery,
  indiaDate,
  offsetDate,
} from "@/lib/dashboard/filters";
import s from "./Dashboard.module.scss";
import { BrandLogo } from "./BrandLogo";
const nf = new Intl.NumberFormat("en-IN");
const fmt = (n: number) => nf.format(n);
const percent = (n: number, total: number) =>
  total ? Math.round((n / total) * 1000) / 10 : 0;
const colours = [
  "#F04E23",
  "#04287F",
  "#FDAA8D",
  "#637FC1",
  "#F57C5D",
  "#A3B4DB",
  "#D8DFEF",
];
type Tab =
  | "Overview"
  | "Products"
  | "Dealers & locations"
  | "Customers"
  | "Operations";
const tabs: Tab[] = [
  "Overview",
  "Products",
  "Dealers & locations",
  "Customers",
  "Operations",
];
function Glyph({ kind = "grid", size = 20 }: { kind?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "grid" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      ) : kind === "people" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" />
        </>
      ) : kind === "pin" ? (
        <>
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      ) : kind === "lock" ? (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
        </>
      ) : kind === "arrow" ? (
        <path d="m6 17 11-11M6 6h11v11" />
      ) : kind === "refresh" ? (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16" />
        </>
      ) : kind === "download" ? (
        <>
          <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />
        </>
      ) : kind === "bike" ? (
        <>
          <circle cx="5" cy="17" r="4" />
          <circle cx="19" cy="17" r="4" />
          <path d="m5 17 4-10 5 10H5m9 0 3-10h3M7 7h5" />
        </>
      ) : kind === "chart" ? (
        <>
          <path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5" />
        </>
      ) : (
        <>
          <path d="M9 4H5v16h4m5-12 4 4-4 4m-6-4h10" />
        </>
      )}
    </svg>
  );
}
function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${s.card} ${className}`}>
      <div className={s.cardHeading}>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
function Bars({
  data,
  total,
  limit = 8,
}: {
  data: Bucket[];
  total?: number;
  limit?: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1),
    sum = total ?? data.reduce((a, d) => a + d.count, 0);
  return data.length ? (
    <div className={s.bars}>
      {data.slice(0, limit).map((d, i) => (
        <div className={s.barRow} key={d.label}>
          <div>
            <span title={d.label}>{d.label}</span>
            <strong>
              {fmt(d.count)} <small>{percent(d.count, sum)}%</small>
            </strong>
          </div>
          <div className={s.track}>
            <span
              style={{
                width: `${(d.count / max) * 100}%`,
                background: colours[i % colours.length],
              }}
            />
          </div>
        </div>
      ))}
      {data.length > limit && (
        <p className={s.muted}>
          +{data.length - limit} more categories in the detail tables.
        </p>
      )}
    </div>
  ) : (
    <Empty />
  );
}
function Empty() {
  return (
    <div className={s.empty}>
      <Glyph kind="chart" size={28} />
      <p>No registrations in this selection.</p>
      <small>Try a wider date range or clear the filters.</small>
    </div>
  );
}
function Delta({
  value,
  previous,
}: {
  value: number;
  previous: number | null;
}) {
  if (previous === null)
    return <span className={s.muted}>All recorded time</span>;
  if (previous === 0)
    return (
      <span className={s.muted}>{value ? "New activity" : "No change"}</span>
    );
  const delta = Math.round(((value - previous) / previous) * 1000) / 10;
  return (
    <span className={delta < 0 ? s.down : s.up}>
      {delta > 0 ? "+" : ""}
      {delta}% <small>vs previous period</small>
    </span>
  );
}
function Trend({ data, monthly }: { data: Bucket[]; monthly: boolean }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const points = data.map((d, i) => [
    42 + (i / Math.max(data.length - 1, 1)) * 710,
    178 - (d.count / max) * 145,
  ]);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return (
    <div className={s.trend}>
      <svg
        viewBox="0 0 780 218"
        role="img"
        aria-label={`${monthly ? "Monthly" : "Daily"} registered purchases. ${data.reduce((a, d) => a + d.count, 0)} total.`}
      >
        <defs>
          <linearGradient id="mv-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F04E23" stopOpacity=".35" />
            <stop offset="100%" stopColor="#F04E23" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1="42"
              x2="752"
              y1={178 - v * 145}
              y2={178 - v * 145}
              stroke="#eeeeef"
              strokeDasharray="4 5"
            />
            <text
              x="28"
              y={182 - v * 145}
              textAnchor="end"
              fill="#97979d"
              fontSize="11"
            >
              {Math.round(max * v)}
            </text>
          </g>
        ))}
        {points.length > 0 && (
          <>
            <path
              d={`${path} L${points[points.length - 1][0]},178 L42,178 Z`}
              fill="url(#mv-area)"
            />
            <path
              d={path}
              fill="none"
              stroke="#F04E23"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {points.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={data.length > 65 ? 2 : 4}
                fill="#F04E23"
                stroke="white"
                strokeWidth="1.5"
              >
                <title>
                  {data[i].label}: {fmt(data[i].count)} purchases
                </title>
              </circle>
            ))}
          </>
        )}
        {data
          .filter(
            (_, i) =>
              i === 0 ||
              i === data.length - 1 ||
              (data.length > 6 && i === Math.floor(data.length / 2)),
          )
          .map((d) => (
            <text
              key={d.label}
              x={points[data.indexOf(d)][0]}
              y="207"
              textAnchor="middle"
              fill="#88888f"
              fontSize="11"
            >
              {new Intl.DateTimeFormat("en-IN", {
                month: "short",
                ...(!monthly
                  ? { day: "numeric" as const }
                  : { year: "2-digit" as const }),
              }).format(new Date(d.label + "T12:00:00Z"))}
            </text>
          ))}
      </svg>
      <span className={s.chartLegend}>
        <i />
        {monthly ? "Monthly" : "Daily"} purchases · India time
      </span>
    </div>
  );
}
function Donut({ data, total }: { data: Bucket[]; total: number }) {
  let cumulative = 0;
  const gradient = data
    .map((d, i) => {
      const start = cumulative;
      cumulative += percent(d.count, total);
      return `${colours[i % colours.length]} ${start}% ${cumulative}%`;
    })
    .join(",");
  return (
    <div className={s.donutLayout}>
      <div
        className={s.donut}
        style={{
          background: total ? `conic-gradient(${gradient})` : "#eeeeef",
        }}
        role="img"
        aria-label={data.map((d) => `${d.label}: ${d.count}`).join(", ")}
      >
        <div>
          <span>Customers</span>
          <strong>{fmt(total)}</strong>
        </div>
      </div>
      <div className={s.legend}>
        {data.map((d, i) => (
          <div key={d.label}>
            <span>
              <i style={{ background: colours[i % colours.length] }} />
              {d.label}
            </span>
            <strong>
              {percent(d.count, total)}% <small>{fmt(d.count)}</small>
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""') +
    '"'
  );
}
function exportRows(name: string, rows: unknown[][]) {
  const blob = new Blob(
    ["\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function RankTable({
  data,
  total,
  kind,
}: {
  data: Ranking[];
  total: number;
  kind: "Dealers" | "Cities" | "States";
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = data.filter((d) =>
    `${d.label} ${d.city} ${d.state}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const shown = filtered.slice(page * 10, page * 10 + 10);
  useEffect(() => {
    setPage((current) =>
      Math.min(current, Math.max(0, Math.ceil(filtered.length / 10) - 1)),
    );
  }, [filtered.length]);
  return (
    <>
      <div className={s.tableTools}>
        <input
          aria-label={`Search ${kind.toLowerCase()}`}
          placeholder={`Search ${kind.toLowerCase()}…`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <button
          onClick={() =>
            exportRows(`motovolt-${kind.toLowerCase()}.csv`, [
              [
                "Rank",
                kind.slice(0, -1),
                "City",
                "State",
                "Purchases",
                "Unique customers",
                "Share (%)",
              ],
              ...filtered.map((d) => [
                data.indexOf(d) + 1,
                d.label,
                d.city,
                d.state,
                d.count,
                d.customers,
                percent(d.count, total),
              ]),
            ])
          }
        >
          <Glyph kind="download" size={15} />
          Export
        </button>
      </div>
      <div className={s.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>{kind.slice(0, -1)}</th>
              {kind !== "States" && <th>Location</th>}
              <th>Purchases</th>
              <th>Customers</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={JSON.stringify([d.id, d.label, d.city, d.state])}>
                <td>
                  <span className={s.rank}>{data.indexOf(d) + 1}</span>
                </td>
                <td className={s.dealerName}>{d.label}</td>
                {kind !== "States" && (
                  <td>
                    {kind === "Dealers" ? `${d.city}, ${d.state}` : d.state}
                  </td>
                )}
                <td>
                  <strong>{fmt(d.count)}</strong>
                </td>
                <td>{fmt(d.customers)}</td>
                <td>
                  <div className={s.share}>
                    <span style={{ width: `${percent(d.count, total)}%` }} />
                  </div>
                  {percent(d.count, total)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty />}
      </div>
      <div className={s.pagination}>
        <span>{fmt(filtered.length)} results</span>
        <div>
          <button disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(filtered.length / 10))}
          </span>
          <button
            disabled={(page + 1) * 10 >= filtered.length}
            onClick={() => setPage((v) => v + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
export function Dashboard({ previewData }: { previewData?: DashboardData }) {
  const [status, setStatus] = useState<"checking" | "locked" | "open">(
    previewData ? "open" : "checking",
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardData | null>(previewData ?? null);
  const [filters, setFilters] = useState<DashboardFilters>(
    previewData?.filters ?? defaultFilters,
  );
  const [draft, setDraft] = useState<DashboardFilters>(
    previewData?.filters ?? defaultFilters,
  );
  const [tab, setTab] = useState<Tab>("Overview");
  const [expiresAt, setExpiresAt] = useState("");
  const [range, setRange] = useState("30");
  const pending = useRef<AbortController | null>(null);
  const sessionGeneration = useRef(0);
  const lock = useCallback(() => {
    sessionGeneration.current++;
    pending.current?.abort();
    setData(null);
    setCode("");
    setExpiresAt("");
    setStatus("locked");
  }, []);
  const checkSession = useCallback(async () => {
    if (previewData) return;
    const version = sessionGeneration.current;
    try {
      const r = await fetch("/api/dashboard/session", { cache: "no-store" });
      const body = await r.json();
      if (version !== sessionGeneration.current) return;
      if (!r.ok)
        throw new Error(
          body.error?.message || "Could not check dashboard access.",
        );
      if (body.authenticated) {
        setExpiresAt(body.expiresAt);
        setStatus("open");
      } else lock();
    } catch (e) {
      if (version === sessionGeneration.current) {
        lock();
        setError(e instanceof Error ? e.message : "Connection unavailable.");
      }
    }
  }, [lock, previewData]);
  useEffect(() => {
    void checkSession();
    const focus = () => void checkSession();
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("focus", focus);
      pending.current?.abort();
    };
  }, [checkSession]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => {
      if (Date.now() >= Date.parse(expiresAt)) {
        lock();
        setError("Your 15-day access has expired. Enter the code again.");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, lock]);
  const load = useCallback(async () => {
    if (previewData) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        "/api/dashboard/analytics?" + filterQuery(filters),
        { cache: "no-store", signal: controller.signal },
      );
      const body = await r.json();
      if (controller.signal.aborted) return;
      if (r.status === 401) {
        lock();
        return;
      }
      if (!r.ok)
        throw new Error(body.error?.message || "Could not load analytics.");
      setData(body);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Connection unavailable.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, previewData, lock]);
  useEffect(() => {
    if (status !== "open" || previewData) return;
    setData(null);
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 120000);
    return () => {
      clearInterval(timer);
      pending.current?.abort();
    };
  }, [status, load, previewData]);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error?.message || "Could not verify access.");
      sessionGeneration.current++;
      setCode("");
      setExpiresAt(body.expiresAt);
      setStatus("open");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (previewData) return;
    setBusy(true);
    try {
      const r = await fetch("/api/dashboard/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!r.ok) throw new Error("Could not sign out. Please try again.");
      lock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
  function selectRange(value: string) {
    setRange(value);
    const to = indiaDate();
    setDraft((current) => ({
      ...current,
      to,
      from:
        value === "all"
          ? ""
          : value === "custom"
            ? current.from
            : offsetDate(to, -Number(value) + 1),
    }));
  }
  if (status !== "open")
    return (
      <main className={s.gate}>
        <a className={s.gateBrand} href="/">
          <BrandLogo height={28} />
        </a>
        <section className={s.gateCard}>
          <div className={s.gateIcon}>
            <BrandLogo height={28} />
          </div>
          <span className={s.eyebrow}>A clearer view of every ride</span>
          <h1>
            Your business.
            <br />
            In perspective.
          </h1>
          <p>
            Enter the dashboard access code to explore customer and dealer
            analytics.
          </p>
          {status === "checking" ? (
            <p role="status">Checking secure access…</p>
          ) : (
            <form onSubmit={login}>
              <label htmlFor="dashboard-code">Access code</label>
              <input
                id="dashboard-code"
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                minLength={12}
                maxLength={64}
                placeholder="Enter your access code"
                disabled={busy}
              />
              {error && (
                <p className={s.error} role="alert">
                  {error}
                </p>
              )}
              <button className={s.primary} disabled={busy}>
                {busy ? "Verifying…" : "Open dashboard"}
                <Glyph kind="arrow" size={17} />
              </button>
            </form>
          )}
          <div className={s.gateFoot}>
            <Glyph kind="lock" size={14} />
            Access stays valid on this browser for 15 days.
          </div>
        </section>
        <span className={s.gateBottom}>Motovolt · Internal analytics</span>
      </main>
    );
  const total = data?.summary.purchases ?? 0,
    customers = data?.summary.customers ?? 0;
  const selectedDealer = draft.dealer
    ? data?.options.dealers.find((d) => d.id === draft.dealer)
    : null;
  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <a href="/dashboard" className={s.brand}>
          <BrandLogo height={28} />
        </a>
        <span className={s.sidebarCaption}>Workspace</span>
        <nav aria-label="Dashboard sections">
          {tabs.map((name, i) => (
            <button
              key={name}
              className={tab === name ? s.navActive : ""}
              onClick={() => setTab(name)}
              aria-current={tab === name ? "page" : undefined}
            >
              <Glyph kind={["grid", "bike", "pin", "people", "chart"][i]} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className={s.sidebarBottom}>
          <div className={s.accessBadge}>
            <span />
            <div>
              Private workspace<small>Passcode protected</small>
            </div>
          </div>
          <a href="/" target="_blank" rel="noreferrer">
            Registration form
            <Glyph kind="arrow" size={15} />
          </a>
          <button
            onClick={() => void logout()}
            disabled={busy || Boolean(previewData)}
          >
            <Glyph kind="exit" size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <main className={s.main}>
        <header className={s.topbar}>
          <span>
            Motovolt <span className={s.slash}>/</span>{" "}
            <strong>Sales intelligence</strong>
          </span>
          <div>
            <span className={s.internalTag}>
              <i />
              Internal
            </span>
            <span className={s.avatar}>
              <BrandLogo height={18} />
            </span>
          </div>
        </header>
        {previewData && (
          <div className={s.previewBanner}>
            Design preview · Illustrative data only. Production requires your
            database-verified access code. Filters are disabled in this preview.
          </div>
        )}
        <div className={s.pageHeading}>
          <div>
            <div className={s.eyebrow}>Dealer network · India</div>
            <h1>
              {tab === "Overview" ? "Every ride, a little clearer." : tab}
            </h1>
            <p>
              {tab === "Overview"
                ? "A complete view of your customers, products and dealer network."
                : "Explore registered purchases across your selected period."}
            </p>
          </div>
          <div className={s.headingButtons}>
            <button
              onClick={() => void load()}
              disabled={loading || Boolean(previewData)}
            >
              <Glyph kind="refresh" size={16} />
              {loading ? "Updating…" : "Refresh"}
            </button>
            <button
              onClick={() =>
                data &&
                exportRows("motovolt-overview.csv", [
                  ["Metric", "Value"],
                  ["From", data.filters.from || "All time"],
                  ["To", data.filters.to],
                  ["Product", data.filters.product || "All"],
                  ["State", data.filters.state || "All"],
                  ["City", data.filters.city || "All"],
                  ["Dealer ID", data.filters.dealer || "All"],
                  ["Purchases", total],
                  ["Unique customers", customers],
                  ["Repeat customers in period", data.summary.repeatCustomers],
                  ["Active dealers", data.summary.activeDealers],
                  [],
                  ["Dealer", "City", "State", "Purchases"],
                  ...data.dealers.map((d) => [
                    d.label,
                    d.city,
                    d.state,
                    d.count,
                  ]),
                ])
              }
              disabled={!data}
            >
              <Glyph kind="download" size={16} />
              Export report
            </button>
          </div>
        </div>
        <form
          className={s.filters}
          onSubmit={(e) => {
            e.preventDefault();
            if (previewData) return;
            setFilters({ ...draft });
          }}
        >
          <fieldset disabled={Boolean(previewData)}>
            <label>
              Period
              <select
                value={range}
                onChange={(e) => selectRange(e.target.value)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={draft.from}
                max={draft.to}
                onChange={(e) => {
                  setRange("custom");
                  setDraft((v) => ({ ...v, from: e.target.value }));
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                max={indiaDate()}
                required
                onChange={(e) => {
                  setRange("custom");
                  setDraft((v) => ({ ...v, to: e.target.value }));
                }}
              />
            </label>
            <label>
              Product
              <select
                value={draft.product}
                onChange={(e) =>
                  setDraft((v) => ({ ...v, product: e.target.value }))
                }
              >
                <option value="">All products</option>
                {data?.options.products.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              State
              <select
                value={draft.state}
                onChange={(e) =>
                  setDraft((v) => ({
                    ...v,
                    state: e.target.value,
                    city: "",
                    dealer: "",
                  }))
                }
              >
                <option value="">All states</option>
                {data?.options.states.map((v) => (
                  <option key={v}>{v}</option>
                ))}
                <option value="Unknown">Unknown</option>
              </select>
            </label>
            <label>
              City
              <select
                value={draft.city}
                onChange={(e) =>
                  setDraft((v) => ({ ...v, city: e.target.value, dealer: "" }))
                }
              >
                <option value="">All cities</option>
                {Array.from(
                  new Set(
                    data?.options.cities
                      .filter((v) => !draft.state || v.state === draft.state)
                      .map((v) => v.city),
                  ),
                )
                  .sort()
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                <option value="Unknown">Unknown</option>
              </select>
            </label>
            <label className={s.dealerFilter}>
              Dealer
              <select
                title={selectedDealer?.name}
                value={draft.dealer}
                onChange={(e) =>
                  setDraft((v) => ({ ...v, dealer: e.target.value }))
                }
              >
                <option value="">All dealers</option>
                {data?.options.dealers
                  .filter(
                    (d) =>
                      (!draft.state || d.state === draft.state) &&
                      (!draft.city || d.city === draft.city),
                  )
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className={s.primary} disabled={loading}>
              Apply filters
            </button>
          </fieldset>
        </form>
        <div className={s.freshness}>
          <span>
            {data
              ? `${data.filters.from || "First registration"} — ${data.filters.to} · India time (IST)`
              : "Loading analytics…"}
          </span>
          <span aria-live="polite">
            {data?.stale
              ? "Showing saved data; refresh in progress"
              : data
                ? `Updated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(data.generatedAt))} IST · cached up to 2 min`
                : ""}
          </span>
        </div>
        {error && (
          <div className={s.error} role="alert">
            {error}
            <button onClick={() => void load()}>Try again</button>
          </div>
        )}
        {!data ? (
          <div className={s.skeleton} role="status">
            {loading
              ? "Loading your analytics…"
              : "No analytics loaded. Adjust the filters or try again."}
            <div />
            <div />
            <div />
          </div>
        ) : (
          <div aria-busy={loading} className={loading ? s.updating : ""}>
            <section className={s.kpis} aria-label="Key metrics">
              {[
                {
                  label: "Registered purchases",
                  value: fmt(total),
                  icon: "bike",
                  detail: (
                    <Delta
                      value={total}
                      previous={data.summary.previousPurchases}
                    />
                  ),
                },
                {
                  label: "Unique customers",
                  value: fmt(customers),
                  icon: "people",
                  detail: (
                    <Delta
                      value={customers}
                      previous={data.summary.previousCustomers}
                    />
                  ),
                },
                {
                  label: "Active dealers",
                  value: fmt(data.summary.activeDealers),
                  icon: "pin",
                  detail: (
                    <span className={s.muted}>
                      With purchases in this selection
                    </span>
                  ),
                },
                {
                  label: "Repeat customers",
                  value: fmt(data.summary.repeatCustomers),
                  icon: "chart",
                  detail: (
                    <span className={s.muted}>
                      {percent(data.summary.repeatCustomers, customers)}% bought
                      more than once in period
                    </span>
                  ),
                },
              ].map((k, i) => (
                <div
                  className={`${s.kpi} ${i === 0 ? s.kpiDark : ""}`}
                  key={k.label}
                >
                  <div>
                    <span>{k.label}</span>
                    <Glyph kind={k.icon} size={18} />
                  </div>
                  <strong>{k.value}</strong>
                  <div className={s.kpiDetail}>{k.detail}</div>
                </div>
              ))}
            </section>
            {tab === "Overview" && (
              <>
                <div className={s.overviewGrid}>
                  <Card
                    title="Purchase activity"
                    subtitle="Registered purchases over the selected period"
                  >
                    <div className={s.chartSummary}>
                      <strong>{fmt(total)}</strong>
                      <span>purchases</span>
                      <Delta
                        value={total}
                        previous={data.summary.previousPurchases}
                      />
                    </div>
                    {total ? (
                      <Trend
                        data={data.trend}
                        monthly={data.granularity === "month"}
                      />
                    ) : (
                      <Empty />
                    )}
                  </Card>
                  <Card
                    title="Customer mix"
                    subtitle="Gender · unique customers in this period"
                  >
                    <Donut data={data.gender} total={customers} />
                  </Card>
                </div>
                <div className={s.threeGrid}>
                  <Card
                    title="Top products"
                    subtitle="Purchase volume by model"
                  >
                    <Bars data={data.products} total={total} />
                  </Card>
                  <Card
                    title="Where we’re growing"
                    subtitle="Top selling states"
                  >
                    <Bars data={data.states} total={total} limit={5} />
                  </Card>
                  <Card
                    title="Payment preferences"
                    subtitle="How registered purchases were paid"
                  >
                    <Bars data={data.payments} total={total} />
                  </Card>
                </div>
                <div className={s.leaderStrip}>
                  <div className={s.leaderIcon}>
                    <Glyph kind="pin" size={23} />
                  </div>
                  <div>
                    <span>Leading dealer</span>
                    <strong>
                      {data.dealers[0]?.label || "No dealer activity yet"}
                    </strong>
                    <small>
                      {data.dealers[0]
                        ? `${data.dealers[0].city}, ${data.dealers[0].state}`
                        : "Choose a wider period to explore your network."}
                    </small>
                  </div>
                  <div className={s.leaderCount}>
                    <strong>{fmt(data.dealers[0]?.count || 0)}</strong>
                    <span>registered purchases</span>
                  </div>
                </div>
                <Card
                  title="Dealer leaderboard"
                  subtitle="Ranked by registered purchases · not revenue"
                >
                  <RankTable data={data.dealers} total={total} kind="Dealers" />
                </Card>
              </>
            )}
            {tab === "Products" && (
              <>
                <div className={s.threeGrid}>
                  <Card title="Model performance">
                    <Bars data={data.products} total={total} />
                  </Card>
                  <Card title="Colour preferences">
                    <Bars data={data.colours} total={total} />
                  </Card>
                  <Card title="Connectivity">
                    <Bars data={data.connectivity} total={total} />
                  </Card>
                </div>
                <div className={s.threeGrid}>
                  <Card title="Range selection">
                    <Bars data={data.ranges} total={total} />
                  </Card>
                  <Card title="Charger selection">
                    <Bars data={data.chargers} total={total} />
                  </Card>
                  <Card
                    title="Finance partners"
                    subtitle="Financer names as entered by dealers"
                  >
                    <Bars data={data.financers} />
                  </Card>
                </div>
                <Card
                  title="Product configuration breakdown"
                  subtitle="Older records may have no variant details"
                >
                  <div className={s.tableTools}>
                    <span>{fmt(data.variants.length)} configurations</span>
                    <button
                      onClick={() =>
                        exportRows("motovolt-variants.csv", [
                          [
                            "Product",
                            "Colour",
                            "Connectivity",
                            "Range",
                            "Charger",
                            "Purchases",
                          ],
                          ...data.variants.map((v) => [
                            v.product,
                            v.colour,
                            v.connectivity,
                            v.range,
                            v.charger,
                            v.count,
                          ]),
                        ])
                      }
                    >
                      <Glyph kind="download" size={15} />
                      Export all
                    </button>
                  </div>
                  <div className={s.tableScroll}>
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Product",
                            "Colour",
                            "Connectivity",
                            "Range",
                            "Charger",
                            "Purchases",
                          ].map((t) => (
                            <th key={t}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.variants.map((v) => (
                          <tr key={JSON.stringify(v)}>
                            <td>
                              <strong>{v.product}</strong>
                            </td>
                            <td>{v.colour}</td>
                            <td>{v.connectivity}</td>
                            <td>{v.range}</td>
                            <td>{v.charger}</td>
                            <td>{fmt(v.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.variants.length && <Empty />}
                  </div>
                </Card>
              </>
            )}
            {tab === "Dealers & locations" && (
              <>
                <div className={s.twoGrid}>
                  <Card
                    title="State distribution"
                    subtitle="Location of the selling dealer"
                  >
                    <Bars data={data.states} total={total} limit={10} />
                  </Card>
                  <Card
                    title="City distribution"
                    subtitle="Cities with the most registered purchases"
                  >
                    <Bars
                      data={data.cities.map((d) => ({
                        ...d,
                        label: `${d.city}, ${d.state}`,
                      }))}
                      total={total}
                      limit={10}
                    />
                  </Card>
                </div>
                <Card
                  title="Dealer performance"
                  subtitle="Search by dealer, city or state"
                >
                  <RankTable data={data.dealers} total={total} kind="Dealers" />
                </Card>
                <div className={s.twoGrid}>
                  <Card title="State rankings">
                    <RankTable data={data.states} total={total} kind="States" />
                  </Card>
                  <Card title="City rankings">
                    <RankTable data={data.cities} total={total} kind="Cities" />
                  </Card>
                </div>
              </>
            )}
            {tab === "Customers" && (
              <>
                <div className={s.twoGrid}>
                  <Card
                    title="Gender distribution"
                    subtitle="Latest registration per phone in this period"
                  >
                    <Donut data={data.gender} total={customers} />
                  </Card>
                  <Card
                    title="Age distribution"
                    subtitle={
                      data.summary.averageAge === null
                        ? "No age data"
                        : `Average age: ${data.summary.averageAge} years`
                    }
                  >
                    <Bars data={data.age} total={customers} />
                  </Card>
                </div>
                <div className={s.threeGrid}>
                  <Card title="Repeat purchasing">
                    <div className={s.bigStat}>
                      {percent(data.summary.repeatCustomers, customers)}
                      <small>%</small>
                    </div>
                    <p className={s.muted}>
                      {fmt(data.summary.repeatCustomers)} of {fmt(customers)}{" "}
                      customers registered multiple purchases in this period.
                    </p>
                  </Card>
                  <Card title="Purchases per customer">
                    <div className={s.bigStat}>
                      {customers ? (total / customers).toFixed(2) : "0"}
                    </div>
                    <p className={s.muted}>
                      {fmt(total)} purchases across {fmt(customers)} distinct
                      verified phone numbers.
                    </p>
                  </Card>
                  <Card title="Email coverage">
                    <div className={s.bigStat}>
                      {percent(data.summary.emailCoverage, customers)}
                      <small>%</small>
                    </div>
                    <p className={s.muted}>
                      {fmt(data.summary.emailCoverage)} unique customers
                      provided an email. Email remains optional.
                    </p>
                  </Card>
                </div>
                <Card
                  title="When customers register"
                  subtitle="Submission timing in India time; this may differ from purchase time"
                >
                  <div className={s.twoGrid}>
                    <Bars data={data.weekdays} total={total} />
                    <Bars
                      data={data.hours.filter((v) => v.count > 0)}
                      total={total}
                      limit={24}
                    />
                  </div>
                </Card>
              </>
            )}
            {tab === "Operations" && (
              <>
                <div className={s.twoGrid}>
                  <Card
                    title="Google Sheets sync"
                    subtitle="Current job status for the selected registrations"
                  >
                    <Bars data={data.sync} total={total} />
                  </Card>
                  <Card title="Data completeness">
                    <div className={s.bigStat}>
                      {fmt(data.summary.unknownLocations)}
                    </div>
                    <p>Purchases with an unmatched dealer city or state.</p>
                    <p className={s.muted}>
                      Location comes from the imported dealer list, joined by
                      Dealer ID. Unknown records remain in every total.
                    </p>
                  </Card>
                </div>
                <Card title="How to read this dashboard">
                  <div className={s.explainer}>
                    <div>
                      <strong>Purchases ≠ revenue</strong>
                      <p>
                        One confirmed registration counts as one purchase. Sale
                        amounts are not collected.
                      </p>
                    </div>
                    <div>
                      <strong>Unique customers</strong>
                      <p>
                        Distinct verified phone numbers in the selected period.
                        Demographics use the latest registration for each
                        number.
                      </p>
                    </div>
                    <div>
                      <strong>Comparable periods</strong>
                      <p>
                        Percentage changes compare with the immediately
                        preceding period of the same length and the same
                        filters. All-time selections have no comparison.
                      </p>
                    </div>
                    <div>
                      <strong>Location & freshness</strong>
                      <p>
                        City and state refer to the selling dealer, not the
                        customer’s home. Analytics are cached for two minutes. A
                        busy refresh may serve a snapshot up to 15 minutes old,
                        labelled above.
                      </p>
                    </div>
                  </div>
                </Card>
              </>
            )}
            <footer className={s.footer}>
              <span>Motovolt · Registered purchase analytics</span>
              <span>Aggregated data only · All dates in IST</span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
