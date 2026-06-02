// app/hooks/useWalletWebSocket.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { env } from "../lib/env";
import type { Balance } from "../context/WalletContext";

type WSMessage = {
  type: "balance_update";
  balances: Balance[];
};

export function useWalletWebSocket(address: string | null) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [error, setError] = useState<string | null>(null);

  const onMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "balance_update" && address) {
      setBalances(msg.balances);
    }
  }, [address]);

  const { error: wsError, status: wsStatus } = useWebSocket<WSMessage>({
    url: `${env.walletWsUrl}?address=${address ?? ""}`,
    onMessage,
    maxAttempts: 5,
  });

  useEffect(() => {
    setStatus(wsStatus);
    setError(wsError);
  }, [wsStatus, wsError]);

  return { balances, status, error };
}
