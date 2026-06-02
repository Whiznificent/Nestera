"use client";

import React from "react";
import { FeatureFlagProvider } from "../context/FeatureFlagContext";
import { useWallet } from "../context/WalletContext";

/**
 * Client-side providers for the dashboard.
 * Bridges server layout → client context.
 */
export default function DashboardProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, network } = useWallet();

  return (
    <FeatureFlagProvider userContext={{ address, network }}>
      {children}
    </FeatureFlagProvider>
  );
}
