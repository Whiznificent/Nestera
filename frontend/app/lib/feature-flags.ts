/**
 * Nestera Feature Flags System
 * 
 * Lightweight feature flag implementation with:
 * - Runtime toggles without deployment
 * - User-based targeting (wallet address, network, user segments)
 * - A/B testing with percentage rollouts
 * - LocalStorage cache + API sync
 * - Analytics tracking
 */

import { addBreadcrumb, trackUserAction } from "./monitoring";

export type FlagValue = boolean | string | number;

export interface FlagConfig {
  /** Unique flag identifier */
  key: string;
  /** Human-readable name */
  name: string;
  /** Description of what this flag controls */
  description: string;
  /** Default value when flag is not configured */
  defaultValue: FlagValue;
  /** Flag type determines evaluation logic */
  type: "boolean" | "string" | "number" | "rollout";
  /** Current enabled state (for boolean flags) */
  enabled?: boolean;
  /** String/number value (for non-boolean flags) */
  value?: FlagValue;
  /** Percentage of users to enable (0-100, for rollout flags) */
  rolloutPercentage?: number;
  /** Target specific users by wallet address */
  targetUsers?: string[];
  /** Target specific networks */
  targetNetworks?: ("public" | "testnet")[];
  /** User segments for targeting */
  targetSegments?: string[];
  /** Kill switch — force disable regardless of other rules */
  forceDisabled?: boolean;
  /** Metadata for tracking */
  tags?: Record<string, string>;
}

export interface UserContext {
  address?: string | null;
  network?: string | null;
  segments?: string[];
  sessionId?: string;
}

interface FlagEvaluation {
  flagKey: string;
  value: FlagValue;
  reason: string;
  targetingMatched: boolean;
}

// In-memory cache
let flagCache: Map<string, FlagConfig> = new Map();
let userContextCache: UserContext = {};

const STORAGE_KEY = "nestera_feature_flags";
const STORAGE_USER_CONTEXT = "nestera_flag_context";
const API_ENDPOINT = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/feature-flags`
  : null;

// ─── Hash function for consistent A/B bucketing ────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getUserBucket(flagKey: string, userId: string): number {
  const combined = `${flagKey}:${userId}`;
  const hash = simpleHash(combined);
  return hash % 100; // Returns 0-99
}

// ─── Flag evaluation logic ──────────────────────────────────────────

function evaluateFlag(flag: FlagConfig, context: UserContext): FlagEvaluation {
  const { key, type, enabled, value, defaultValue, forceDisabled } = flag;

  // Kill switch always wins
  if (forceDisabled) {
    return {
      flagKey: key,
      value: false,
      reason: "force_disabled",
      targetingMatched: false,
    };
  }

  // User targeting
  if (flag.targetUsers?.length && context.address) {
    const truncatedAddress = context.address.slice(0, 10);
    const isTargeted = flag.targetUsers.some(
      (addr) => addr.toLowerCase().startsWith(truncatedAddress.toLowerCase())
    );
    if (isTargeted) {
      const val = type === "boolean" ? enabled ?? true : value ?? defaultValue;
      return {
        flagKey: key,
        value: val,
        reason: "user_targeted",
        targetingMatched: true,
      };
    }
  }

  // Network targeting
  if (flag.targetNetworks?.length && context.network) {
    const isTargeted = flag.targetNetworks.includes(
      context.network as "public" | "testnet"
    );
    if (!isTargeted) {
      return {
        flagKey: key,
        value: defaultValue,
        reason: "network_not_targeted",
        targetingMatched: false,
      };
    }
  }

  // Segment targeting
  if (flag.targetSegments?.length && context.segments?.length) {
    const hasSegment = flag.targetSegments.some((seg) =>
      context.segments?.includes(seg)
    );
    if (hasSegment) {
      const val = type === "boolean" ? enabled ?? true : value ?? defaultValue;
      return {
        flagKey: key,
        value: val,
        reason: "segment_matched",
        targetingMatched: true,
      };
    }
  }

  // Percentage rollout
  if (type === "rollout" && flag.rolloutPercentage !== undefined) {
    const userId = context.address || context.sessionId || "anonymous";
    const bucket = getUserBucket(key, userId);
    const isInRollout = bucket < flag.rolloutPercentage;
    return {
      flagKey: key,
      value: isInRollout,
      reason: `rollout_${isInRollout ? "included" : "excluded"}_${bucket}`,
      targetingMatched: isInRollout,
    };
  }

  // Default evaluation
  const val = type === "boolean" ? enabled ?? defaultValue : value ?? defaultValue;
  return {
    flagKey: key,
    value: val,
    reason: "default",
    targetingMatched: false,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/** Load flags from localStorage and optionally fetch from API */
export async function initFeatureFlags(fetchFromApi = true): Promise<void> {
  // Load from localStorage first (instant)
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: FlagConfig[] = JSON.parse(stored);
        parsed.forEach((flag) => flagCache.set(flag.key, flag));
      }

      const storedContext = localStorage.getItem(STORAGE_USER_CONTEXT);
      if (storedContext) {
        userContextCache = JSON.parse(storedContext);
      }
    } catch (err) {
      console.warn("[feature-flags] Failed to load from localStorage:", err);
    }
  }

  // Fetch latest from API (async)
  if (fetchFromApi && API_ENDPOINT) {
    try {
      const res = await fetch(API_ENDPOINT, { credentials: "include" });
      if (res.ok) {
        const flags: FlagConfig[] = await res.json();
        flags.forEach((flag) => flagCache.set(flag.key, flag));
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
        }
        addBreadcrumb({
          message: `Loaded ${flags.length} feature flags from API`,
          category: "user_action",
          level: "info",
        });
      }
    } catch (err) {
      console.warn("[feature-flags] Failed to fetch from API:", err);
    }
  }
}

/** Set user context for flag evaluation */
export function setFlagUserContext(context: UserContext): void {
  userContextCache = { ...userContextCache, ...context };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_USER_CONTEXT, JSON.stringify(userContextCache));
    } catch (err) {
      console.warn("[feature-flags] Failed to save user context:", err);
    }
  }
}

/** Check if a flag is enabled (boolean flags only) */
export function isFeatureEnabled(flagKey: string): boolean {
  const flag = flagCache.get(flagKey);
  if (!flag) {
    console.warn(`[feature-flags] Flag "${flagKey}" not found, returning false`);
    return false;
  }

  const evaluation = evaluateFlag(flag, userContextCache);

  // Track flag access
  trackUserAction("feature_flag_evaluated", {
    flag: flagKey,
    value: String(evaluation.value),
    reason: evaluation.reason,
    targeted: evaluation.targetingMatched,
  });

  return Boolean(evaluation.value);
}

/** Get flag value (any type) */
export function getFeatureFlagValue<T extends FlagValue = FlagValue>(
  flagKey: string
): T {
  const flag = flagCache.get(flagKey);
  if (!flag) {
    console.warn(`[feature-flags] Flag "${flagKey}" not found, returning default`);
    return false as T;
  }

  const evaluation = evaluateFlag(flag, userContextCache);

  trackUserAction("feature_flag_evaluated", {
    flag: flagKey,
    value: String(evaluation.value),
    reason: evaluation.reason,
    targeted: evaluation.targetingMatched,
  });

  return evaluation.value as T;
}

/** Get all flags for admin UI */
export function getAllFlags(): FlagConfig[] {
  return Array.from(flagCache.values());
}

/** Get current user context */
export function getUserContext(): UserContext {
  return { ...userContextCache };
}

/** Update a flag (admin only — requires API call to persist) */
export async function updateFlag(
  flagKey: string,
  updates: Partial<FlagConfig>
): Promise<void> {
  const existing = flagCache.get(flagKey);
  if (!existing) {
    throw new Error(`Flag "${flagKey}" not found`);
  }

  const updated = { ...existing, ...updates };
  flagCache.set(flagKey, updated);

  // Persist to localStorage
  if (typeof window !== "undefined") {
    const allFlags = getAllFlags();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFlags));
  }

  // Persist to API
  if (API_ENDPOINT) {
    try {
      await fetch(`${API_ENDPOINT}/${flagKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error("[feature-flags] Failed to persist update:", err);
      throw err;
    }
  }

  addBreadcrumb({
    message: `Feature flag "${flagKey}" updated`,
    category: "user_action",
    data: { updates },
    level: "info",
  });
}

/** Create a new flag (admin only) */
export async function createFlag(flag: FlagConfig): Promise<void> {
  flagCache.set(flag.key, flag);

  if (typeof window !== "undefined") {
    const allFlags = getAllFlags();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFlags));
  }

  if (API_ENDPOINT) {
    try {
      await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(flag),
      });
    } catch (err) {
      console.error("[feature-flags] Failed to create flag:", err);
      throw err;
    }
  }
}

/** Delete a flag (admin only) */
export async function deleteFlag(flagKey: string): Promise<void> {
  flagCache.delete(flagKey);

  if (typeof window !== "undefined") {
    const allFlags = getAllFlags();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFlags));
  }

  if (API_ENDPOINT) {
    try {
      await fetch(`${API_ENDPOINT}/${flagKey}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch (err) {
      console.error("[feature-flags] Failed to delete flag:", err);
      throw err;
    }
  }
}
