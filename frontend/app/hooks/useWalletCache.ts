import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Horizon } from "@stellar/stellar-sdk";
import { env } from "../lib/env";

interface Balance {
  asset_code: string;
  balance: string;
  asset_type: string;
  asset_issuer?: string;
  usd_value: number;
}

const COINGECKO_IDS: Record<string, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
  AQUA: "aqua",
};

async function fetchPrices(): Promise<Record<string, number>> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const res = await fetch(`${env.coingeckoApi}/simple/price?ids=${ids}&vs_currencies=usd`);
  if (!res.ok) throw new Error("Failed to fetch prices");
  const data = await res.json();
  const prices: Record<string, number> = {};
  for (const [code, id] of Object.entries(COINGECKO_IDS)) {
    prices[code] = data[id]?.usd ?? (code === "USDC" ? 1 : 0);
  }
  return prices;
}

async function fetchBalances(address: string, horizonUrl: string): Promise<Balance[]> {
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(address);
  return account.balances.map((b: any) => ({
    asset_code: b.asset_type === "native" ? "XLM" : b.asset_code,
    balance: b.balance,
    asset_type: b.asset_type,
    asset_issuer: b.asset_issuer,
    usd_value: 0, // enriched below
  }));
}

/** Cached price data — refreshes every 5 minutes */
export function usePrices() {
  return useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 5 * 60_000,   // 5 minutes
    gcTime: 10 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Cached wallet balances — refreshes every 60 seconds, invalidated on disconnect */
export function useWalletBalances(
  address: string | null,
  network: string | null,
  horizonUrl: string,
) {
  const { data: prices } = usePrices();

  return useQuery({
    queryKey: ["balances", address],
    queryFn: async () => {
      if (!address) return [];
      const rawBalances = await fetchBalances(address, horizonUrl);
      let total = 0;
      const enriched = rawBalances.map((b) => {
        const price = prices?.[b.asset_code] ?? (b.asset_code === "USDC" ? 1 : 0);
        const usdValue = parseFloat(b.balance) * price;
        total += usdValue;
        return { ...b, usd_value: usdValue };
      });
      return enriched;
    },
    enabled: !!address,
    staleTime: 30_000,        // 30 seconds
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,  // 1 minute
  });
}

/** Call this to invalidate balance cache (e.g. after a transaction or on disconnect) */
export function useInvalidateBalances() {
  const queryClient = useQueryClient();
  return (address?: string | null) => {
    if (address) {
      queryClient.invalidateQueries({ queryKey: ["balances", address] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
    }
  };
}
