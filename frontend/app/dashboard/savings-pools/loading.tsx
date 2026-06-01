import { PoolCardSkeleton } from "../../components/ui/LoadingState";

export default function SavingsPoolsLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto pb-20" aria-busy="true" aria-label="Loading savings pools">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <PoolCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
