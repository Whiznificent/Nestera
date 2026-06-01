"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import {
  isConnected,
  getAddress,
  getNetwork,
  requestAccess,
  WatchWalletChanges,
} from "@stellar/freighter-api";
import { Horizon } from "@stellar/stellar-sdk";
import { env } from "../lib/env";
import { queryClient } from "./QueryProvider";
import { usePrices, getAssetPrice } from "../hooks/usePrices";

interface Balance {
  asset_code: string;
  balance: string;
  asset_type: string;
  asset_issuer?: string;
  usd_value: number;
}

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "locked" | "error";

interface WalletState {
  address: string | null;
  network: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isBalancesLoading: boolean;
  error: string | null;
  balanceError: string | null;
  balances: Balance[];
  totalUsdValue: number;
  lastBalanceSync: number | null;
  connectionStatus: ConnectionStatus;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  fetchBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const COINGECKO_IDS: Record<string, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
  AQUA: "aqua",
};

const STORAGE_KEY = "nestera_wallet_network";
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    network: null,
    isConnected: false,
    isLoading: false,
    isBalancesLoading: false,
    error: null,
    balanceError: null,
    balances: [],
    totalUsdValue: 0,
    lastBalanceSync: null,
  });

const INITIAL_STATE: WalletState = {
  address: null,
  network: null,
  isConnected: false,
  isLoading: false,
  isBalancesLoading: false,
  error: null,
  balanceError: null,
  balances: [],
  totalUsdValue: 0,
  lastBalanceSync: null,
  connectionStatus: "idle",
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(INITIAL_STATE);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const networkWatcher = useRef<WatchWalletChanges | null>(null);
  const disconnectCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use React Query for cached prices (updates every 5 minutes)
  const { data: prices } = usePrices();

  const getHorizonUrl = (network: string | null) => {
    return network?.toLowerCase() === "public"
      ? env.horizonPublic
      : env.horizonTestnet;
  };

  const fetchBalances = useCallback(async () => {
    if (!state.address) {
      try { queryClient.removeQueries({ queryKey: ["balances"] }); } catch {}
      return;
    }

    setState((s) => ({ ...s, isBalancesLoading: true, balanceError: null }));

    try {
      const result = await queryClient.fetchQuery({
        queryKey: ["balances", state.address],
        queryFn: async () => {
          const horizonUrl = getHorizonUrl(state.network);
          const server = new Horizon.Server(horizonUrl);
          const account = await server.loadAccount(state.address);

          const assetIds = Object.values(COINGECKO_IDS).join(",");
          const priceRes = await fetch(
            `${env.coingeckoApi}/simple/price?ids=${assetIds}&vs_currencies=usd`
          );
          const prices = await priceRes.json();

          let totalUsd = 0;
          const balances: Balance[] = account.balances.map((b: any) => {
            const code = b.asset_type === "native" ? "XLM" : b.asset_code;
            const coingeckoId = COINGECKO_IDS[code];
            const price = prices[coingeckoId]?.usd || (code === "USDC" ? 1 : 0);
            const usdValue = parseFloat(b.balance) * price;
            totalUsd += usdValue;
            return {
              asset_code: code,
              balance: b.balance,
              asset_type: b.asset_type,
              asset_issuer: b.asset_issuer,
              usd_value: usdValue,
            };
          });

          return { balances, totalUsd };
        },
        staleTime: 30_000,
        cacheTime: 300_000,
      const horizonUrl = getHorizonUrl(state.network);
      const server = new Horizon.Server(horizonUrl);
      const account = await server.loadAccount(state.address);

      let totalUsd = 0;
      const balances: Balance[] = account.balances.map((b: any) => {
        const code = b.asset_type === "native" ? "XLM" : b.asset_code;
        const price = getAssetPrice(prices, code);
        const usdValue = parseFloat(b.balance) * price;
        totalUsd += usdValue;

        return {
          asset_code: code,
          balance: b.balance,
          asset_type: b.asset_type,
          asset_issuer: b.asset_issuer,
          usd_value: usdValue,
        };
      });

      setState((s) => ({
        ...s,
        balances: result.balances,
        totalUsdValue: result.totalUsd,
        isBalancesLoading: false,
        balanceError: null,
        lastBalanceSync: Date.now(),
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isBalancesLoading: false,
        balanceError: err instanceof Error ? err.message : "Unable to refresh wallet balances.",
      }));
    }
  }, [state.address, state.network, prices]);

  // Restore session on mount
  useEffect(() => {
    const savedNetwork = typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;

    (async () => {
      try {
        const connected = await isConnected();
        if (connected?.isConnected) {
          const [addrResult, netResult] = await Promise.all([getAddress(), getNetwork()]);
          if (addrResult?.address) {
            const network = netResult?.network ?? savedNetwork ?? null;
            if (network) localStorage.setItem(STORAGE_KEY, network);
            setState((s) => ({
              ...s,
              address: addrResult.address,
              network,
              isConnected: true,
              connectionStatus: "connected",
            }));
          }
        } else {
          // Was previously connected but now disconnected
          setState((s) => ({
            ...s,
            connectionStatus: savedNetwork ? "disconnected" : "idle",
          }));
        }
      } catch {
        // Freighter not installed — silent fail
      }
    })();
  }, []);

  // Poll to detect wallet lock/disconnect from extension
  useEffect(() => {
    if (!state.isConnected) return;

    disconnectCheckInterval.current = setInterval(async () => {
      try {
        const connected = await isConnected();
        if (!connected?.isConnected) {
          // Invalidate cached balances and mark as locked so UI prompts reconnect
          try { queryClient.removeQueries({ queryKey: ["balances"] }); } catch {}
          setState((s) => ({
            ...s,
            isConnected: false,
            connectionStatus: "locked",
            address: null,
            balances: [],
            totalUsdValue: 0,
            isBalancesLoading: false,
            lastBalanceSync: null,
          }));
        }
      } catch {
        // ignore
      }
    }, 5000);

    return () => {
      if (disconnectCheckInterval.current) {
        clearInterval(disconnectCheckInterval.current);
        disconnectCheckInterval.current = null;
      }
    };
  }, [state.isConnected]);

  // Fetch balances when address changes
  useEffect(() => {
    if (state.address) {
      fetchBalances();
  // Fetch balances when address changes (prices come from React Query cache)
  useEffect(() => {
    if (state.address) {
      fetchBalances();

      // Poll balances every 30 seconds (prices are cached separately)
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      refreshInterval.current = setInterval(fetchBalances, 30000);
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
      setState((s) => ({
        ...s,
        balances: [],
        totalUsdValue: 0,
        isBalancesLoading: false,
        balanceError: null,
        lastBalanceSync: null,
      }));
    }
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [state.address, fetchBalances]);

  // Watch for network changes
  useEffect(() => {
    if (!state.isConnected) {
      if (networkWatcher.current) {
        try { networkWatcher.current.stop(); } catch {}
        networkWatcher.current = null;
      }
      return;
    }

    try {
      networkWatcher.current = new WatchWalletChanges(3000);
      networkWatcher.current.watch((changes) => {
        if (changes.network && changes.network !== state.network) {
          localStorage.setItem(STORAGE_KEY, changes.network);
          setState((s) => ({ ...s, network: changes.network }));
          // trigger immediate refresh when network changes
          fetchBalances();
        }
      });
    } catch {}

    return () => {
      if (networkWatcher.current) {
        try { networkWatcher.current.stop(); } catch {}
        networkWatcher.current = null;
      }
    };
  }, [state.isConnected, state.network]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null, connectionStatus: "connecting" }));
    try {
      // set a connection timeout to avoid hanging
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = setTimeout(() => {
        setState((s) => ({ ...s, isLoading: false, connectionStatus: "error", error: "Connection timed out" }));
      }, 15000);
      const accessResult = await requestAccess();
      if (accessResult?.error) {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setState((s) => ({
          ...s,
          isLoading: false,
          error: accessResult.error ?? "Connection rejected",
          connectionStatus: "error",
        }));
        return;
      }
      const [addrResult, netResult] = await Promise.all([getAddress(), getNetwork()]);
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      const network = netResult?.network ?? null;
      if (network) localStorage.setItem(STORAGE_KEY, network);
      setState((s) => ({
        ...s,
        address: addrResult?.address ?? null,
        network,
        isConnected: !!addrResult?.address,
        isLoading: false,
        error: null,
        balanceError: null,
        connectionStatus: addrResult?.address ? "connected" : "error",
      }));
    } catch (err) {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to connect wallet",
        connectionStatus: "error",
      }));
    }
  }, []);

  const reconnect = useCallback(async () => {
    setState((s) => ({ ...s, error: null, connectionStatus: "connecting" }));
    await connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    queryClient.removeQueries({ queryKey: ["balances"] });
    setState({ ...INITIAL_STATE, connectionStatus: "idle" });
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, reconnect, fetchBalances }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
