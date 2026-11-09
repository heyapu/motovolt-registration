export type Bucket = { label: string; count: number };
export type Ranking = Bucket & {
  id: string;
  customers: number;
  city: string;
  state: string;
};
export type DashboardFilters = {
  from: string;
  to: string;
  product: string;
  state: string;
  city: string;
  dealer: string;
};
export type DashboardData = {
  generatedAt: string;
  stale: boolean;
  filters: DashboardFilters;
  summary: {
    purchases: number;
    customers: number;
    repeatCustomers: number;
    activeDealers: number;
    averageAge: number | null;
    emailCoverage: number;
    unknownLocations: number;
    previousPurchases: number | null;
    previousCustomers: number | null;
  };
  trend: Bucket[];
  granularity: "day" | "month";
  gender: Bucket[];
  age: Bucket[];
  products: Bucket[];
  payments: Bucket[];
  colours: Bucket[];
  connectivity: Bucket[];
  ranges: Bucket[];
  chargers: Bucket[];
  financers: Bucket[];
  states: Ranking[];
  cities: Ranking[];
  dealers: Ranking[];
  variants: {
    product: string;
    colour: string;
    connectivity: string;
    range: string;
    charger: string;
    count: number;
  }[];
  weekdays: Bucket[];
  hours: Bucket[];
  sync: Bucket[];
  options: {
    states: string[];
    cities: { city: string; state: string }[];
    dealers: { id: string; name: string; city: string; state: string }[];
    products: { id: string; name: string }[];
  };
};
