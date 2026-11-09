import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
export const metadata: Metadata = {
  title: "Motovolt · Sales intelligence",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function DashboardPage() {
  return <Dashboard />;
}
