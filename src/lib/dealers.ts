// Dealer records are stored in Supabase. This file contains types/display helpers only.
export type Dealer = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
};
export type ManagedDealer = Dealer & {
  active: boolean;
  version: number;
  updatedAt: string;
};
export type DealerDirectory = { revision: number; dealers: Dealer[] };
export const dealerLabel = (dealer: Dealer): string =>
  `${dealer.name} · ${dealer.city}, ${dealer.state} · #${dealer.id}`;
