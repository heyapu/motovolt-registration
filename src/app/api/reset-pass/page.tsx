import type { Metadata } from "next";
import { ResetPass } from "@/components/dashboard/ResetPass";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset access code · Motovolt", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ResetPassPage() { return <ResetPass />; }
