import { notFound } from "next/navigation";
import { dashboardPreview } from "@/lib/server/dashboard";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { PREVIEW_DATA } from "@/lib/dashboard/preview-data";
export const dynamic = "force-dynamic";
export default function DashboardPreview() {
  if (!dashboardPreview()) notFound();
  return <Dashboard previewData={PREVIEW_DATA} />;
}
