/**
 * Default feature flag configuration.
 *
 * This file serves as the source of truth for all available flags.
 * - Flags listed here are loaded as defaults on first run.
 * - Production overrides come from the API (/feature-flags endpoint).
 * - LocalStorage overrides take effect for admin-toggled flags.
 *
 * Usage in code:
 *   const { isEnabled } = useFeatureFlag('new-dashboard-layout');
 *   if (isEnabled) return <NewDashboard />;
 */

import type { FlagConfig } from "./feature-flags";

export const DEFAULT_FLAGS: FlagConfig[] = [
  // ─── Dashboard & UI ───────────────────────────────────────────────
  {
    key: "new-dashboard-layout",
    name: "New Dashboard Layout",
    description: "Enable the redesigned dashboard with animated cards and enhanced analytics.",
    defaultValue: false,
    type: "rollout",
    enabled: false,
    rolloutPercentage: 0,
    tags: { team: "frontend", area: "dashboard" },
  },
  {
    key: "enhanced-charts",
    name: "Enhanced Charts",
    description: "Use the new Recharts-based interactive chart components.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    tags: { team: "frontend", area: "analytics" },
  },

  // ─── Wallet & DeFi ────────────────────────────────────────────────
  {
    key: "wallet-staking",
    name: "Staking Feature",
    description: "Enable XLM staking UI and flows.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    tags: { team: "defi", area: "wallet" },
  },
  {
    key: "wallet-nft-display",
    name: "NFT Display",
    description: "Show NFT assets in the wallet balance card.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    tags: { team: "defi", area: "wallet" },
  },
  {
    key: "testnet-only-features",
    name: "Testnet-Only Features",
    description: "Enable experimental features only on the Stellar testnet.",
    defaultValue: false,
    type: "boolean",
    enabled: true,
    targetNetworks: ["testnet"],
    tags: { team: "defi", area: "testing" },
  },

  // ─── A/B Tests ────────────────────────────────────────────────────
  {
    key: "ab-new-onboarding",
    name: "A/B: New Onboarding Flow",
    description: "50% of new users see the redesigned onboarding experience.",
    defaultValue: false,
    type: "rollout",
    rolloutPercentage: 50,
    tags: { team: "growth", area: "onboarding", experiment: "true" },
  },
  {
    key: "ab-cta-button-color",
    name: "A/B: CTA Button Color",
    description: "Test teal vs green CTA buttons for conversion.",
    defaultValue: "teal",
    type: "string",
    value: "teal",
    tags: { team: "growth", area: "landing", experiment: "true" },
  },

  // ─── Kill Switches ────────────────────────────────────────────────
  {
    key: "disable-referral-system",
    name: "Kill Switch: Referral System",
    description: "Emergency kill switch to disable the referral system.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    forceDisabled: false,
    tags: { team: "backend", area: "referrals", kill_switch: "true" },
  },
  {
    key: "disable-governance",
    name: "Kill Switch: Governance",
    description: "Emergency kill switch to disable governance voting.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    forceDisabled: false,
    tags: { team: "backend", area: "governance", kill_switch: "true" },
  },

  // ─── Beta Features ────────────────────────────────────────────────
  {
    key: "beta-analytics-v2",
    name: "Beta: Analytics V2",
    description: "New analytics dashboard with predictive metrics. Beta users only.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    targetSegments: ["beta_tester", "internal"],
    tags: { team: "analytics", area: "dashboard", beta: "true" },
  },
  {
    key: "beta-savings-goals-v2",
    name: "Beta: Savings Goals V2",
    description: "Enhanced savings goals with milestone tracking and push notifications.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    targetSegments: ["beta_tester"],
    tags: { team: "savings", area: "goals", beta: "true" },
  },

  // ─── Performance & Infrastructure ─────────────────────────────────
  {
    key: "websocket-balances",
    name: "WebSocket Balance Updates",
    description: "Use WebSocket for real-time balance updates instead of polling.",
    defaultValue: false,
    type: "boolean",
    enabled: false,
    tags: { team: "infra", area: "performance" },
  },
];
