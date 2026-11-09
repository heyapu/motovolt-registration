// Run: node --import tsx scripts/dashboard-sync-dealers.ts
// Copy the printed SQL into Supabase SQL Editor after changing src/lib/dealers.ts.
import { DEALERS } from "../src/lib/dealers";
const quote = (value: string) => "'" + value.trim().replaceAll("'", "''") + "'";
console.log("begin;");
console.log(
  "insert into public.dashboard_dealer_locations(id,name,city,state) values",
);
console.log(
  DEALERS.map(
    (d) => "(" + [d.id, d.name, d.city, d.state].map(quote).join(",") + ")",
  ).join(",\n"),
);
console.log(
  "on conflict(id) do update set name=excluded.name,city=excluded.city,state=excluded.state;",
);
console.log("delete from public.dashboard_cache;");
console.log("commit;");
