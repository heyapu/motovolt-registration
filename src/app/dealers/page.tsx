import type { Metadata } from "next";
import { DealerManager } from "@/components/dealers/DealerManager";
export const metadata: Metadata = {
  title: "Motovolt · Manage dealers",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function DealersPage() {
  return <DealerManager />;
}
