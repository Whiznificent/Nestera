"use client";

import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { Button } from "./ui/Button";

export function WalletReconnectBanner() {
  const { connectionStatus, reconnect, isLoading } = useWallet();

  if (connectionStatus !== "locked" && connectionStatus !== "disconnected") return null;

  const isLocked = connectionStatus === "locked";

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-sm"
    >
      <div className="flex items-center gap-2">
        <WifiOff size={15} className="shrink-0" />
        <span>
          {isLocked
            ? "Your wallet was locked. Reconnect to continue."
            : "Wallet disconnected. Reconnect to restore your session."}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<RefreshCw size={13} />}
        loading={isLoading}
        onClick={reconnect}
        className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 shrink-0"
      >
        Reconnect
      </Button>
    </div>
  );
}
