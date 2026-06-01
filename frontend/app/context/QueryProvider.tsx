"use client";

import React from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 seconds
      gcTime: 5 * 60_000,      // 5 minutes
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

// Only create persister on client side
const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "nestera_query_cache",
      })
    : undefined;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  if (!persister) {
    // SSR fallback — no persistence
    return (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: { persistClient: async () => {}, restoreClient: async () => undefined, removeClient: async () => {} } }}>
        {children}
      </PersistQueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 5 * 60_000, // 5 minutes
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export { queryClient };
