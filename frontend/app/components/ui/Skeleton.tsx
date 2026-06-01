"use client";

import React from "react";
import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
}

/**
 * Reusable skeleton placeholder. Shimmer is disabled automatically
 * when the user has prefers-reduced-motion: reduce set.
 */
const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div
    aria-hidden="true"
    className={clsx("rounded bg-white/[0.06] skeleton-shimmer", className)}
  />
);

export default Skeleton;
