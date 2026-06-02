"use client";

import { useFeatureFlags } from "../context/FeatureFlagContext";
import type { FlagValue } from "../lib/feature-flags";

/**
 * Check if a single feature flag is enabled.
 *
 * @example
 * const { isEnabled, isLoading } = useFeatureFlag('new-dashboard-layout');
 * if (isLoading) return <Skeleton />;
 * if (isEnabled) return <NewDashboard />;
 * return <OldDashboard />;
 */
export function useFeatureFlag(flagKey: string): {
  isEnabled: boolean;
  isLoading: boolean;
} {
  const { isEnabled, isLoading } = useFeatureFlags();
  return {
    isEnabled: isEnabled(flagKey),
    isLoading,
  };
}

/**
 * Get a flag value (for string/number/multivariate flags).
 *
 * @example
 * const { value } = useFeatureFlagValue<string>('ab-cta-button-color');
 * // value === 'teal' | 'green'
 */
export function useFeatureFlagValue<T extends FlagValue = FlagValue>(
  flagKey: string
): {
  value: T;
  isLoading: boolean;
} {
  const { getValue, isLoading } = useFeatureFlags();
  return {
    value: getValue<T>(flagKey),
    isLoading,
  };
}

/**
 * Get multiple flags at once.
 *
 * @example
 * const flags = useFeatureFlagMany(['new-dashboard', 'beta-charts']);
 * // flags['new-dashboard'] === true | false
 */
export function useFeatureFlagMany(flagKeys: string[]): {
  flags: Record<string, boolean>;
  isLoading: boolean;
} {
  const { isEnabled, isLoading } = useFeatureFlags();
  const flags = Object.fromEntries(
    flagKeys.map((key) => [key, isEnabled(key)])
  );
  return { flags, isLoading };
}
