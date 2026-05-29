"use client";

import React from "react";
import { useWallet } from "../../context/WalletContext";

const NetWorthCard: React.FC = () => {
  const { totalUsdValue, isConnected, isBalancesLoading } = useWallet();

  return (
    <div className="relative overflow-hidden rounded-[18px] p-28 min-h-[160px] shadow-[0_10px_30px_rgba(2,12,14,0.6)] backdrop-blur-[6px] border border-[rgba(6,110,110,0.15)] bg-linear-to-b from-[rgba(4,20,22,0.85)] to-[rgba(6,18,20,0.75)] text-[#e6ffff]">
      {/* Wave SVG sits at the back */}
      <svg
        className="absolute -right-[30px] top-0 w-[84%] h-[110%] opacity-55 z-0 pointer-events-none"
        viewBox="0 0 600 200"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0%" stopColor="#07c1c1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#083b3b" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        <path
          d="M0,80 C150,200 350,0 600,80 L600,200 L0,200 Z"
          fill="url(#g1)"
        />
      </svg>

      {/* Content on top */}
      <div className="relative z-1">
        <div className="flex justify-between items-center">
          <div className="text-xs text-[#9bb7b7] font-semibold tracking-wide">
            TOTAL NET WORTH
          </div>
          <div
            className="px-3 py-2 rounded-2xl font-bold text-[#8ef4ef] inline-flex gap-2 items-center text-sm bg-linear-to-r from-[rgba(3,116,116,0.22)] to-[rgba(6,140,140,0.14))]"
          >
            + $0.00{" "}
            <span className="text-[#cfe] text-xs font-semibold">(0.0%)</span>
          </div>
        </div>

        <div className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {isConnected ? (
            isBalancesLoading && totalUsdValue === 0 ? (
              <span className="inline-block h-12 w-52 animate-pulse rounded-lg bg-white/10" />
            ) : (
              `$${totalUsdValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            )
          ) : (
            "$0.00"
          )}
        </div>

        <div className="mt-2 text-[#95b7b7] text-sm">
          {isBalancesLoading ? "Loading wallet valuation..." : "vs last month"}
        </div>
      </div>
    </div>
  );
};

export default NetWorthCard;
