"use client";

import React, { useEffect, useState } from "react";
import { Download, History, Loader2, Search, ChevronDown } from "lucide-react";
import TransactionRow, { TransactionType, TransactionStatus } from "./components/TransactionRow";
import { useToast } from "../../context/ToastContext";
import { Button } from "@/app/components/ui/Button";

type TransactionRowData = {
  date: string;
  time: string;
  transactionId: string;
  type: TransactionType;
  assetDetails: string;
  amountDisplay: string;
  isPositive: boolean | null;
  status: TransactionStatus;
  hash: string;
};

function csvEscape(value: string) {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: TransactionRowData[]) {
  const header = ["date", "time", "transactionId", "type", "assetDetails", "amountDisplay", "status", "hash"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.date, r.time, r.transactionId, r.type, r.assetDetails, r.amountDisplay, r.status, r.hash]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TransactionHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsLoading(false), 750);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const transactions: TransactionRowData[] = [
    {
      date: "Oct 25, 2023",
      time: "10:23 AM",
      transactionId: "0xabc...123",
      type: "deposit",
      assetDetails: "USDC",
      amountDisplay: "+$500.00",
      isPositive: true,
      status: "completed",
      hash: "0xabc",
    },
    {
      date: "Oct 24, 2023",
      time: "04:15 PM",
      transactionId: "0xdef...456",
      type: "withdraw",
      assetDetails: "ETH",
      amountDisplay: "-0.50 ETH",
      isPositive: false,
      status: "completed",
      hash: "0xdef",
    },
    {
      date: "Oct 24, 2023",
      time: "09:30 AM",
      transactionId: "0xghi...789",
      type: "swap",
      assetDetails: "XLM → USDC",
      amountDisplay: "200 USDC",
      isPositive: null,
      status: "completed",
      hash: "0xghi",
    },
    {
      date: "Oct 23, 2023",
      time: "08:00 AM",
      transactionId: "0xjkl...012",
      type: "yield",
      assetDetails: "Staking Reward",
      amountDisplay: "+$12.45",
      isPositive: true,
      status: "pending",
      hash: "0xjkl",
    },
  ];

  function onExportCsv() {
    const csv = toCsv(transactions);
    downloadTextFile(
      `nestera-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
    toast.success("Transactions exported", "CSV file downloaded successfully.");
  }

  return (
    <div className="w-full max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-linear-to-b from-[#063d3d] to-[#0a6f6f] flex items-center justify-center text-cyan-400 shadow-[0_8px_20px_rgba(6,61,61,0.3)]">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white m-0 tracking-tight">
              Transaction History
            </h1>
            <p className="text-[#5e8c96] text-sm md:text-base m-0 mt-1">
              Download your transactions as a CSV file for reporting.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="md"
          leftIcon={<Download size={18} />}
          onClick={onExportCsv}
          className="bg-cyan-500 hover:bg-cyan-400 text-[#061a1a] shadow-lg"
        >
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5e8c96]"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by transaction, token, or hash..."
            className="w-full bg-[#0e2330] border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-[#4e7a86] focus:outline-hidden focus:border-cyan-500/50 transition-colors"
          />
        </div>

        {["Type: All", "Asset: All", "Status: All"].map((filter) => (
          <Button
            key={filter}
            variant="secondary"
            size="md"
            rightIcon={<ChevronDown size={14} className="opacity-70" />}
            className="bg-[#0e2330] border-white/5 text-[#5e8c96] hover:text-white"
          >
            {filter}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#0e2330]">
        {isLoading ? (
          <div className="space-y-4 p-4" aria-live="polite" aria-busy="true">
            <div className="inline-flex items-center gap-2 text-xs text-[#7fa9b0]">
              <Loader2 size={14} className="animate-spin text-cyan-400" />
              Loading transaction history...
            </div>
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-[72px] animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[820px] overflow-hidden">
              <div className="grid grid-cols-12 px-5 py-3 border-b border-white/5 text-[#5e8c96] text-xs font-bold uppercase tracking-widest">
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Transaction ID</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Asset / Details</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-2 text-right">Status</div>
              </div>

              {transactions.map((t) => (
                <TransactionRow
                  key={t.hash}
                  date={t.date}
                  time={t.time}
                  transactionId={t.transactionId}
                  type={t.type}
                  assetDetails={t.assetDetails}
                  amountDisplay={t.amountDisplay}
                  isPositive={t.isPositive}
                  status={t.status}
                  onClick={(id) => {
                    // TODO: Implement transaction details modal
                  }}
                />
              ))}

              <div className="h-[220px] border-b border-white/5" />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-4 px-5 py-4 text-sm font-semibold">
          <Button variant="ghost" size="sm" className="text-[#5e8c96]" aria-label="Previous page">
            &lt; Prev
          </Button>
          <span className="rounded-lg bg-[rgba(6,110,110,0.2)] px-4 py-1.5 text-[#e2f8f8] text-sm font-semibold" aria-label="Page 1 of 12">
            Page 1 of 12
          </span>
          <Button variant="ghost" size="sm" className="text-[#e2f8f8]" aria-label="Next page">
            Next &gt;
          </Button>
        </div>
      </div>
    </div>
  );
}
