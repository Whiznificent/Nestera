import React from "react";
import { Loader2 } from "lucide-react";

export function Spinner({
  text = "Loading...",
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] ${className}`}>
      <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
      <span>{text}</span>
    </div>
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/10 ${className}`} />;
}

export function DashboardCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <SkeletonLine className="mb-4 h-5 w-40" />
      <SkeletonLine className="mb-3 h-10 w-full" />
      <SkeletonLine className="h-4 w-2/3" />
    </div>
  );
}

