"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  initFeatureFlags,
  isFeatureEnabled,
  getFeatureFlagValue,
  getAllFlags,
  updateFlag,
  createFlag,
  deleteFlag,
  setFlagUserContext,
  type FlagConfig,
  type FlagValue,
  type UserContext,
} from "../lib/feature-flags";
import { DEFAULT_FLAGS } from "../lib/flags.config";

interface FeatureFlagContextValue {
  /** Check if a boolean/rollout flag is enabled */
  isEnabled: (flagKey: string) => boolean;
  /** Get the value of any flag type */
  getValue: <T extends FlagValue = FlagValue>(flagKey: string) => T;
  /** All flags (for admin UI) */
  flags: FlagConfig[];
  /** Whether flags are loading from API */
  isLoading: boolean;
  /** Update user context for targeting */
  setUserContext: (ctx: UserContext) => void;
  /** Admin: toggle a flag on/off */
  toggleFlag: (flagKey: string) => Promise<void>;
  /** Admin: update a flag */
  updateFlagConfig: (flagKey: string, updates: Partial<FlagConfig>) => Promise<void>;
  /** Admin: create a new flag */
  createFlagConfig: (flag: FlagConfig) => Promise<void>;
  /** Admin: delete a flag */
  deleteFlagConfig: (flagKey: string) => Promise<void>;
  /** Force re-evaluation after context/flag changes */
  refresh: () => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function FeatureFlagProvider({
  children,
  userContext,
}: {
  children: React.ReactNode;
  userContext?: UserContext;
}) {
  const [flags, setFlags] = useState<FlagConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const initDone = useRef(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Seed defaults and init
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Seed defaults into the cache before API fetch
    DEFAULT_FLAGS.forEach((flag) => {
      if (!getAllFlags().find((f) => f.key === flag.key)) {
        // Only seed if not already in localStorage
      }
    });

    setIsLoading(true);
    initFeatureFlags(true).then(() => {
      // Merge defaults with any cached/API flags
      const loaded = getAllFlags();
      const merged = DEFAULT_FLAGS.map((def) => {
        const live = loaded.find((f) => f.key === def.key);
        return live ?? def;
      });
      // Add any API-only flags not in defaults
      const extra = loaded.filter(
        (f) => !DEFAULT_FLAGS.find((d) => d.key === f.key)
      );
      setFlags([...merged, ...extra]);
      setIsLoading(false);
    });
  }, []);

  // Sync user context when it changes (e.g. wallet connects)
  useEffect(() => {
    if (userContext) {
      setFlagUserContext(userContext);
      refresh();
    }
  }, [userContext?.address, userContext?.network, refresh]);

  const isEnabled = useCallback(
    (flagKey: string) => {
      // tick dependency ensures re-evaluation after flag changes
      void tick;
      return isFeatureEnabled(flagKey);
    },
    [tick]
  );

  const getValue = useCallback(
    <T extends FlagValue>(flagKey: string): T => {
      void tick;
      return getFeatureFlagValue<T>(flagKey);
    },
    [tick]
  );

  const updateFlagConfig = useCallback(
    async (flagKey: string, updates: Partial<FlagConfig>) => {
      await updateFlag(flagKey, updates);
      setFlags(getAllFlags());
      refresh();
    },
    [refresh]
  );

  const toggleFlag = useCallback(
    async (flagKey: string) => {
      const current = flags.find((f) => f.key === flagKey);
      if (!current) return;
      await updateFlagConfig(flagKey, {
        enabled: !current.enabled,
        forceDisabled: false,
      });
    },
    [flags, updateFlagConfig]
  );

  const createFlagConfig = useCallback(
    async (flag: FlagConfig) => {
      await createFlag(flag);
      setFlags(getAllFlags());
      refresh();
    },
    [refresh]
  );

  const deleteFlagConfig = useCallback(
    async (flagKey: string) => {
      await deleteFlag(flagKey);
      setFlags(getAllFlags());
      refresh();
    },
    [refresh]
  );

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      isEnabled,
      getValue,
      flags,
      isLoading,
      setUserContext: setFlagUserContext,
      toggleFlag,
      updateFlagConfig,
      createFlagConfig,
      deleteFlagConfig,
      refresh,
    }),
    [
      isEnabled,
      getValue,
      flags,
      isLoading,
      toggleFlag,
      updateFlagConfig,
      createFlagConfig,
      deleteFlagConfig,
      refresh,
    ]
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/** Access feature flags in any component */
export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error("useFeatureFlags must be used within FeatureFlagProvider");
  return ctx;
}
