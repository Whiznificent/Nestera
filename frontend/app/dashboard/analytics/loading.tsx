import { ChartSkeleton, DashboardCardSkeleton } from "../../components/ui/LoadingState";

export default function AnalyticsLoading() {
  return (
    <div className="w-full space-y-6" aria-busy="true" aria-label="Loading analytics">
      <DashboardCardSkeleton />
      <ChartSkeleton height="h-64" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
      </div>
    </div>
  );
}
