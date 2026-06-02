"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Flag,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
  Zap,
  BarChart2,
  Shield,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useFeatureFlags } from "../context/FeatureFlagContext";
import type { FlagConfig } from "../lib/feature-flags";

type FilterTag = "all" | "kill_switch" | "experiment" | "beta" | "enabled" | "disabled";

const TAG_ICONS: Record<string, React.ReactNode> = {
  kill_switch: <Shield size={11} />,
  experiment: <BarChart2 size={11} />,
  beta: <Zap size={11} />,
};

const TAG_COLORS: Record<string, string> = {
  kill_switch: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  experiment: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  beta: "border-purple-500/40 bg-purple-500/10 text-purple-300",
};

function FlagRow({
  flag,
  onToggle,
  onUpdate,
  onDelete,
}: {
  flag: FlagConfig;
  onToggle: (key: string) => void;
  onUpdate: (key: string, updates: Partial<FlagConfig>) => void;
  onDelete: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rollout, setRollout] = useState(flag.rolloutPercentage ?? 0);
  const isKillSwitch = !!flag.tags?.kill_switch;
  const isOn = !flag.forceDisabled && !!flag.enabled;

  const handleRolloutChange = useCallback(
    (val: number) => {
      setRollout(val);
      onUpdate(flag.key, { rolloutPercentage: val });
    },
    [flag.key, onUpdate]
  );

  return (
    <div className={`rounded-xl border transition-colors duration-150 ${isOn ? "border-[#08c1c1]/20 bg-[#08c1c1]/5" : "border-white/5 bg-white/[0.02]"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onToggle(flag.key)}
          className={`shrink-0 transition-colors ${isOn ? "text-[#08c1c1]" : "text-white/20"} hover:opacity-80`}
          aria-label={isOn ? "Disable flag" : "Enable flag"}
        >
          {isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{flag.name}</span>
            <code className="text-[10px] text-[#6a9fae] font-mono bg-white/5 px-1.5 py-0.5 rounded">{flag.key}</code>
            {Object.entries(flag.tags ?? {})
              .filter(([k]) => ["kill_switch", "experiment", "beta"].includes(k))
              .map(([tagKey]) => (
                <span key={tagKey} className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wide ${TAG_COLORS[tagKey] ?? "border-white/10 bg-white/5 text-white/50"}`}>
                  {TAG_ICONS[tagKey]}
                  {tagKey.replace("_", " ")}
                </span>
              ))}
          </div>
          <p className="text-xs text-[#6a9fae] mt-0.5 truncate">{flag.description}</p>
        </div>

        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#4a8090] bg-white/5 px-2 py-1 rounded-lg hidden sm:block">
          {flag.type}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-[#4a8090] hover:text-white transition-colors"
          aria-label="Toggle details"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 mt-1 pt-3 space-y-3">
          {(flag.type === "rollout" || flag.rolloutPercentage !== undefined) && (
            <div>
              <label className="text-xs font-semibold text-[#6a9fae] mb-1 flex items-center justify-between">
                <span>Rollout Percentage</span>
                <span className="text-[#08c1c1] font-bold">{rollout}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={rollout}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleRolloutChange(Number(e.target.value))}
                className="w-full accent-[#08c1c1]"
              />
            </div>
          )}

          {flag.targetNetworks?.length ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#4a8090]">Networks:</span>
              {flag.targetNetworks.map((n) => (
                <span key={n} className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-semibold">{n}</span>
              ))}
            </div>
          ) : null}

          {flag.targetSegments?.length ? (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Users size={12} className="text-[#4a8090] shrink-0" />
              <span className="text-[#4a8090]">Segments:</span>
              {flag.targetSegments.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-semibold">{s}</span>
              ))}
            </div>
          ) : null}

          {isKillSwitch && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <AlertTriangle size={14} className="text-rose-400 shrink-0" />
              <span className="text-xs text-rose-300 flex-1">Kill switch — force-disables this feature for all users.</span>
              <button
                type="button"
                onClick={() => onUpdate(flag.key, { forceDisabled: !flag.forceDisabled, enabled: false })}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${flag.forceDisabled ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
              >
                {flag.forceDisabled ? "🛑 Forced Off" : "Force Off"}
              </button>
            </div>
          )}

          {flag.tags && (
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(flag.tags)
                .filter(([, v]) => v !== "true" && v !== "false")
                .map(([k, v]) => (
                  <span key={k} className="text-[10px] text-[#4a8090] font-mono">{k}:{v}</span>
                ))}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete flag "${flag.key}"?`)) onDelete(flag.key);
              }}
              className="flex items-center gap-1.5 text-xs text-rose-400/60 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} />
              Delete flag
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FeatureFlagAdminProps {
  onClose: () => void;
}

export default function FeatureFlagAdmin({ onClose }: FeatureFlagAdminProps) {
  const { flags, isLoading, toggleFlag, updateFlagConfig, createFlagConfig, deleteFlagConfig } = useFeatureFlags();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTag>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newFlag, setNewFlag] = useState<Partial<FlagConfig>>({
    type: "boolean",
    defaultValue: false,
    enabled: false,
    tags: {},
  });

  const filtered = useMemo(() => {
    return flags.filter((flag: FlagConfig) => {
      const q = search.toLowerCase();
      const matchesSearch = !search || flag.key.includes(q) || flag.name.toLowerCase().includes(q) || flag.description.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "kill_switch" && flag.tags?.kill_switch === "true") ||
        (filter === "experiment" && flag.tags?.experiment === "true") ||
        (filter === "beta" && flag.tags?.beta === "true") ||
        (filter === "enabled" && !!flag.enabled && !flag.forceDisabled) ||
        (filter === "disabled" && (!flag.enabled || !!flag.forceDisabled));
      return matchesSearch && matchesFilter;
    });
  }, [flags, search, filter]);

  const stats = useMemo(() => {
    const enabled = flags.filter((f: FlagConfig) => f.enabled && !f.forceDisabled).length;
    const killSwitches = flags.filter((f: FlagConfig) => f.tags?.kill_switch === "true").length;
    return { total: flags.length, enabled, disabled: flags.length - enabled, killSwitches };
  }, [flags]);

  const handleCreateSubmit = useCallback(async () => {
    if (!newFlag.key || !newFlag.name) return;
    await createFlagConfig(newFlag as FlagConfig);
    setNewFlag({ type: "boolean", defaultValue: false, enabled: false, tags: {} });
    setShowCreate(false);
  }, [newFlag, createFlagConfig]);

  const FILTERS: FilterTag[] = ["all", "enabled", "disabled", "kill_switch", "experiment", "beta"];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end p-4 pt-16" role="dialog" aria-modal="true" aria-label="Feature Flag Admin">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl max-h-[calc(100vh-80px)] flex flex-col rounded-2xl bg-[#0d1f28] border border-white/8 shadow-2xl animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#08c1c1]/10 flex items-center justify-center text-[#08c1c1]">
            <Flag size={16} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white m-0">Feature Flags</h2>
            <p className="text-[11px] text-[#4a8090] m-0">
              {stats.enabled}/{stats.total} enabled
              {stats.killSwitches > 0 && ` · ${stats.killSwitches} kill switches`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#4a8090] hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5 shrink-0">
          {[
            { label: "Total", value: stats.total, color: "text-white" },
            { label: "Enabled", value: stats.enabled, color: "text-[#08c1c1]" },
            { label: "Disabled", value: stats.disabled, color: "text-[#4a8090]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center py-2.5">
              <span className={`text-lg font-bold ${color}`}>{value}</span>
              <span className="text-[10px] text-[#4a8090] uppercase tracking-wide">{label}</span>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className="px-4 py-3 border-b border-white/5 space-y-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a8090]" />
            <input
              type="search"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search flags..."
              className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-[#4a8090] focus:outline-none focus:border-[#08c1c1]/40"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${filter === f ? "bg-[#08c1c1]/20 text-[#08c1c1] border border-[#08c1c1]/30" : "bg-white/5 text-[#4a8090] border border-transparent hover:text-white"}`}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Flag list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[#4a8090]">
              <div className="animate-spin w-5 h-5 border-2 border-[#08c1c1]/30 border-t-[#08c1c1] rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-[#4a8090] py-10">No flags match your search.</p>
          ) : (
            filtered.map((flag: FlagConfig) => (
              <FlagRow
                key={flag.key}
                flag={flag}
                onToggle={toggleFlag}
                onUpdate={updateFlagConfig}
                onDelete={deleteFlagConfig}
              />
            ))
          )}
        </div>

        {/* Create new flag */}
        <div className="border-t border-white/5 px-4 py-3 shrink-0">
          {showCreate ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="flag-key (kebab-case)"
                  value={newFlag.key ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlag((f: Partial<FlagConfig>) => ({ ...f, key: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[#4a8090] focus:outline-none focus:border-[#08c1c1]/40"
                />
                <input
                  type="text"
                  placeholder="Display name"
                  value={newFlag.name ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlag((f: Partial<FlagConfig>) => ({ ...f, name: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[#4a8090] focus:outline-none focus:border-[#08c1c1]/40"
                />
              </div>
              <input
                type="text"
                placeholder="Description"
                value={newFlag.description ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlag((f: Partial<FlagConfig>) => ({ ...f, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[#4a8090] focus:outline-none focus:border-[#08c1c1]/40"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newFlag.type ?? "boolean"}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewFlag((f: Partial<FlagConfig>) => ({ ...f, type: e.target.value as FlagConfig["type"] }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08c1c1]/40 flex-1"
                >
                  <option value="boolean">Boolean</option>
                  <option value="rollout">Rollout %</option>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                </select>
                <button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={!newFlag.key || !newFlag.name}
                  className="btn-press px-4 py-2 bg-[#08c1c1] text-[#061a1a] text-xs font-bold rounded-lg disabled:opacity-40"
                >
                  Create
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-xs text-[#4a8090] hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-press w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 text-xs font-semibold text-[#4a8090] hover:text-white hover:border-white/20 transition-colors"
            >
              <Plus size={14} />
              New Flag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
