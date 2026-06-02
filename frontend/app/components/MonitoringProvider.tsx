"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import {
  initMonitoring,
  setUserContext,
  trackNavigation,
} from "../lib/monitoring";
import { useWallet } from "../context/WalletContext";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnv = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production";
const sentryRelease = process.env.NEXT_PUBLIC_SENTRY_RELEASE;

/**
 * Initialises Sentry error monitoring and wires up:
 * - Global error/rejection handlers
 * - Route-change breadcrumbs
 * - Wallet user context (privacy-safe: truncated address + network only)
 *
 * Sentry is loaded via CDN so no build-time SDK installation is required.
 * Set NEXT_PUBLIC_SENTRY_DSN in your .env to activate.
 */
export default function MonitoringProvider() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);
  const { address, network, isConnected } = useWallet();

  // Init on mount
  useEffect(() => {
    initMonitoring();
  }, []);

  // Track navigation as breadcrumbs
  useEffect(() => {
    if (pathname) {
      trackNavigation(pathname, prevPath.current ?? undefined);
      prevPath.current = pathname;
    }
  }, [pathname]);

  // Attach wallet user context
  useEffect(() => {
    if (isConnected && address) {
      setUserContext({ id: address, network: network ?? undefined });
    } else {
      setUserContext(null);
    }
  }, [isConnected, address, network]);

  // Only inject Sentry script when DSN is configured
  if (!sentryDsn) return null;

  return (
    <Script
      id="sentry-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var script = document.createElement('script');
            script.src = 'https://browser.sentry-cdn.com/7.99.0/bundle.tracing.replay.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = function() {
              if (window.Sentry) {
                window.Sentry.init({
                  dsn: ${JSON.stringify(sentryDsn)},
                  environment: ${JSON.stringify(sentryEnv)},
                  release: ${JSON.stringify(sentryRelease ?? "unknown")},
                  tracesSampleRate: 0.2,
                  replaysOnErrorSampleRate: 1.0,
                  replaysSessionSampleRate: 0.05,
                  // Privacy: scrub sensitive fields before sending
                  beforeSend: function(event) {
                    if (event.request && event.request.data) {
                      delete event.request.data.password;
                      delete event.request.data.mnemonic;
                      delete event.request.data.privateKey;
                      delete event.request.data.secretKey;
                    }
                    return event;
                  },
                  integrations: [
                    new window.Sentry.Replay({
                      maskAllText: true,
                      blockAllMedia: false,
                    }),
                  ],
                });
              }
            };
            document.head.appendChild(script);
          })();
        `,
      }}
    />
  );
}
