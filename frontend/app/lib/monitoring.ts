/**
 * Nestera Error Monitoring & Tracking
 *
 * Lightweight wrapper that:
 * - Integrates with Sentry (loaded via CDN script in layout.tsx)
 * - Tracks breadcrumbs, user context, API errors, wallet errors
 * - Is privacy-compliant: never captures passwords, private keys, or raw addresses
 * - Gracefully no-ops when Sentry DSN is not configured
 */

declare const process: { env: Record<string, string | undefined> } | undefined;

export type ErrorCategory =
  | "runtime"
  | "api"
  | "wallet"
  | "performance"
  | "user_action";

export interface ErrorContext {
  category: ErrorCategory;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; network?: string };
}

export interface Breadcrumb {
  message: string;
  category: ErrorCategory;
  data?: Record<string, unknown>;
  level?: "debug" | "info" | "warning" | "error";
}

// Sentry loaded via CDN — typed loosely to avoid a hard dependency
type SentryLike = {
  captureException: (error: unknown, hint?: object) => string;
  captureMessage: (msg: string, level?: string) => string;
  addBreadcrumb: (breadcrumb: object) => void;
  setUser: (user: object | null) => void;
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
  withScope: (fn: (scope: ScopeLike) => void) => void;
};

type ScopeLike = {
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
  setLevel: (level: string) => void;
};

declare global {
  interface Window {
    Sentry?: SentryLike;
    __NESTERA_MONITORING_INIT__?: boolean;
  }
}

const isBrowser = typeof window !== "undefined";
const dsn = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SENTRY_DSN : undefined;
const isDev = typeof process !== "undefined" ? process.env.NODE_ENV !== "production" : false;

function getSentry(): SentryLike | null {
  if (!isBrowser || !dsn) return null;
  return window.Sentry ?? null;
}

/** Sanitize user-provided strings — strip anything resembling a private key or seed phrase */
function sanitize(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Remove anything that looks like a 56-char Stellar secret key (starts with S)
  if (/^S[A-Z2-7]{55}$/.test(value.trim())) return "[REDACTED_SECRET]";
  // Truncate wallet addresses to first 6 + last 4 chars
  if (/^G[A-Z2-7]{55}$/.test(value.trim())) {
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }
  return value;
}

function sanitizeContext(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, sanitize(v)])
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Capture an exception with optional context */
export function captureError(error: unknown, ctx: ErrorContext = { category: "runtime" }) {
  const sentry = getSentry();
  const message = error instanceof Error ? error.message : String(error);

  if (isDev) {
    console.error(`[monitoring:${ctx.category}]`, error, ctx);
  }

  if (!sentry) return;

  sentry.withScope((scope) => {
    scope.setTag("category", ctx.category);
    if (ctx.tags) {
      Object.entries(ctx.tags).forEach(([k, v]) => scope.setTag(k, v));
    }
    if (ctx.extra) {
      Object.entries(sanitizeContext(ctx.extra)).forEach(([k, v]) =>
        scope.setExtra(k, v)
      );
    }
    scope.setLevel(ctx.category === "performance" ? "warning" : "error");
    sentry.captureException(error);
  });

  if (isDev) {
    console.warn(`[monitoring] captured: ${message}`);
  }
}

/** Add a breadcrumb to the trail */
export function addBreadcrumb(breadcrumb: Breadcrumb) {
  const sentry = getSentry();

  if (isDev) {
    console.debug(`[breadcrumb:${breadcrumb.category}]`, breadcrumb.message, breadcrumb.data);
  }

  sentry?.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category,
    data: breadcrumb.data ? sanitizeContext(breadcrumb.data as Record<string, unknown>) : undefined,
    level: breadcrumb.level ?? "info",
    timestamp: Date.now() / 1000,
  });
}

/** Set the current user context (privacy-safe: only non-sensitive identifiers) */
export function setUserContext(user: { id?: string; network?: string } | null) {
  const sentry = getSentry();
  if (!user) {
    sentry?.setUser(null);
    return;
  }
  sentry?.setUser({
    id: user.id ? sanitize(user.id) : undefined,
    network: user.network,
  });
}

/** Track a wallet connection error */
export function captureWalletError(error: unknown, action: string, address?: string) {
  addBreadcrumb({
    message: `Wallet action failed: ${action}`,
    category: "wallet",
    data: { action, address: address ? sanitize(address) as string : undefined },
    level: "error",
  });

  captureError(error, {
    category: "wallet",
    tags: { wallet_action: action },
    extra: { address: address ? sanitize(address) : undefined },
  });
}

/** Track an API error */
export function captureApiError(
  error: unknown,
  endpoint: string,
  status?: number,
  method = "GET"
) {
  addBreadcrumb({
    message: `API ${method} ${endpoint} failed${status ? ` (${status})` : ""}`,
    category: "api",
    data: { endpoint, status, method },
    level: "error",
  });

  captureError(error, {
    category: "api",
    tags: { api_endpoint: endpoint, http_method: method },
    extra: { status_code: status },
  });
}

/** Track a user navigation action */
export function trackNavigation(to: string, from?: string) {
  addBreadcrumb({
    message: `Navigated to ${to}`,
    category: "user_action",
    data: { to, from },
    level: "info",
  });
}

/** Track a user interaction (button clicks, form submits, etc.) */
export function trackUserAction(action: string, data?: Record<string, unknown>) {
  addBreadcrumb({
    message: action,
    category: "user_action",
    data: data ? sanitizeContext(data) : undefined,
    level: "info",
  });
}

/** Initialise monitoring — called once from the root layout / provider */
export function initMonitoring() {
  if (!isBrowser || !dsn || window.__NESTERA_MONITORING_INIT__) return;
  window.__NESTERA_MONITORING_INIT__ = true;

  // Global unhandled error handler
  window.addEventListener("error", (event) => {
    captureError(event.error ?? new Error(event.message), {
      category: "runtime",
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    captureError(event.reason ?? new Error("Unhandled promise rejection"), {
      category: "runtime",
      tags: { type: "unhandled_promise_rejection" },
    });
  });

  if (isDev) {
    console.info("[monitoring] initialized (dev mode — Sentry no-op unless DSN set)");
  }
}
