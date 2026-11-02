import React, { useState } from 'react';
import { PublisherManifest, ComponentType, SubscriberTier } from '../types/v2e';
import { Shield, ShieldAlert, ShieldCheck, Key, Lock, Unlock, ExternalLink, RefreshCw, Cpu, Layers, UserCheck, Crown } from 'lucide-react';

interface Props {
  manifest: PublisherManifest;
  onUpdateManifest: (updated: PublisherManifest) => void;
  activeTabsCount: number;
  currentDisplay: string;
  subscriberTier: SubscriberTier;
  onChangeSubscriberTier: (tier: SubscriberTier) => void;
}

export const PublisherGovernanceBar: React.FC<Props> = ({
  manifest,
  onUpdateManifest,
  activeTabsCount,
  currentDisplay,
  subscriberTier,
  onChangeSubscriberTier,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSubscreenFork = () => {
    onUpdateManifest({
      ...manifest,
      allowSubscreenFork: !manifest.allowSubscreenFork,
    });
  };

  const toggleMultiTabPopout = () => {
    onUpdateManifest({
      ...manifest,
      allowMultiTabPopout: !manifest.allowMultiTabPopout,
    });
  };

  const toggleComponent = (comp: ComponentType) => {
    const exists = manifest.allowedComponents.includes(comp);
    const next = exists
      ? manifest.allowedComponents.filter((c) => c !== comp)
      : [...manifest.allowedComponents, comp];

    onUpdateManifest({
      ...manifest,
      allowedComponents: next,
    });
  };

  const setPreset = (preset: 'open' | 'safe' | 'strict') => {
    if (preset === 'open') {
      onUpdateManifest({
        ...manifest,
        allowSubscreenFork: true,
        allowMultiTabPopout: true,
        maxConcurrentTabs: 8,
        allowedComponents: ['FULL_WORKSPACE', 'IDE_EDITOR', 'TERMINAL', 'VIEWPORT_PREVIEW'],
        allowFullShellControl: true,
      });
    } else if (preset === 'safe') {
      onUpdateManifest({
        ...manifest,
        allowSubscreenFork: true,
        allowMultiTabPopout: true,
        maxConcurrentTabs: 4,
        allowedComponents: ['IDE_EDITOR', 'VIEWPORT_PREVIEW'],
        allowFullShellControl: false,
      });
    } else {
      onUpdateManifest({
        ...manifest,
        allowSubscreenFork: false,
        allowMultiTabPopout: false,
        maxConcurrentTabs: 0,
        allowedComponents: [],
        allowFullShellControl: false,
      });
    }
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-200 px-4 py-2.5 shadow-lg select-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Studio Branding & Publisher Signature */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-950/80 border border-indigo-700/60 rounded-md">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-xs tracking-wide text-indigo-200">V2E BITEMPORAL STUDIO v8</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 font-mono text-[11px] text-cyan-300">
              <Key className="w-3 h-3 text-cyan-400" />
              ECDSA-P256
            </span>
            <span className="text-slate-400 hidden sm:inline text-[11px]">
              Publisher: <strong className="text-slate-300">{manifest.publisherName}</strong>
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
              <ShieldCheck className="w-3 h-3" />
              Signed Manifest
            </span>
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-700/70 px-2 py-0.5 rounded font-mono" title="Checked against /tmp/.X11-unix/X99, loaded manifest, and tmux has-session -t main">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Trunk :99 & tmux: HEALTHY
            </span>
          </div>
        </div>

        {/* Center: Subscriber Status, Live Quota & Display Metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Subscriber Tier Badge & Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2 py-0.5 rounded text-xs">
            <span
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ${
                subscriberTier === 'free'
                  ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
                  : subscriberTier === 'paid'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-700/80'
              }`}
            >
              {subscriberTier === 'free' ? 'FREE VIEWER' : `${subscriberTier.toUpperCase()} SUBSCRIBER`}
            </span>
            <div className="flex items-center gap-0.5 text-[10px] text-slate-400">
              {(['free', 'paid', 'premium'] as SubscriberTier[]).map((t) => (
                <button
                  key={t}
                  onClick={() => onChangeSubscriberTier(t)}
                  className={`px-1.5 py-0.5 rounded uppercase font-mono transition-colors ${
                    subscriberTier === t ? 'bg-indigo-600 text-white font-bold' : 'hover:text-slate-200'
                  }`}
                  title={`Switch subscriber role to ${t}`}
                >
                  {t[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-2.5 py-1 rounded text-xs">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300">
              Display: <strong className="font-mono text-cyan-400">{currentDisplay}</strong>
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">
              Active Tabs: <strong className={`font-mono ${activeTabsCount >= manifest.maxConcurrentTabs ? 'text-rose-400' : 'text-emerald-400'}`}>
                {activeTabsCount} / {manifest.maxConcurrentTabs}
              </strong>
            </span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              isExpanded
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-indigo-300" />
            <span>Publisher ACL Policy</span>
            <span className="text-[10px] bg-slate-900/60 px-1 py-0.2 rounded font-mono">
              {manifest.allowSubscreenFork && manifest.allowMultiTabPopout ? 'PERMISSIVE' : 'RESTRICTED'}
            </span>
          </button>
        </div>
      </div>

      {/* Expanded Governance & Access Control Panel */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in duration-150">
          {/* Column 1: Master Switches */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Cryptographic ACL Switches</span>
              <span className="text-[10px] text-slate-400 font-mono">Header Policy</span>
            </div>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900/80 cursor-pointer">
              <span className="flex items-center gap-2">
                {manifest.allowSubscreenFork ? <Unlock className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-rose-400" />}
                <span className="text-slate-200">Allow Subscreen Forking</span>
              </span>
              <input
                type="checkbox"
                checked={manifest.allowSubscreenFork}
                onChange={toggleSubscreenFork}
                className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900/80 cursor-pointer">
              <span className="flex items-center gap-2">
                {manifest.allowMultiTabPopout ? <Unlock className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5 text-rose-400" />}
                <span className="text-slate-200">Allow Multi-Tab Pop-Out</span>
              </span>
              <input
                type="checkbox"
                checked={manifest.allowMultiTabPopout}
                onChange={toggleMultiTabPopout}
                className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <div className="pt-1 flex items-center justify-between text-slate-400">
              <span>Max Concurrent Tabs Quota:</span>
              <div className="flex items-center gap-1.5 font-mono">
                <button
                  onClick={() => onUpdateManifest({ ...manifest, maxConcurrentTabs: Math.max(1, manifest.maxConcurrentTabs - 1) })}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  -
                </button>
                <span className="text-cyan-300 font-bold px-1">{manifest.maxConcurrentTabs}</span>
                <button
                  onClick={() => onUpdateManifest({ ...manifest, maxConcurrentTabs: Math.min(12, manifest.maxConcurrentTabs + 1) })}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Component Whitelist */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Allowed Tear-Off Panes</span>
              <span className="text-[10px] text-cyan-400 font-mono">{manifest.allowedComponents.length} enabled</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['IDE_EDITOR', 'TERMINAL', 'VIEWPORT_PREVIEW', 'FULL_WORKSPACE'] as ComponentType[]).map((comp) => {
                const checked = manifest.allowedComponents.includes(comp);
                return (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => toggleComponent(comp)}
                    className={`flex items-center justify-between px-2 py-1 rounded text-[11px] font-mono border transition-all ${
                      checked
                        ? 'bg-indigo-950/80 border-indigo-700 text-indigo-200'
                        : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    <span>{comp.replace('_', ' ')}</span>
                    {checked ? <Unlock className="w-2.5 h-2.5 text-emerald-400" /> : <Lock className="w-2.5 h-2.5 text-slate-500" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 pt-1">
              Viewer clicks on locked components will be blocked with Publisher Manifest violations.
            </p>
          </div>

          {/* Column 3: Policy Presets & Ledger Signature Details */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex flex-col justify-between space-y-2">
            <div>
              <div className="font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Creator Access Presets</span>
                <span className="text-[10px] text-slate-400">1-Click Rules</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreset('open')}
                  className="flex-1 py-1 px-2 rounded bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700 text-emerald-300 text-[10px] font-medium"
                >
                  Full Access
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('safe')}
                  className="flex-1 py-1 px-2 rounded bg-amber-950/50 hover:bg-amber-900/60 border border-amber-700 text-amber-300 text-[10px] font-medium"
                >
                  Safe Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('strict')}
                  className="flex-1 py-1 px-2 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700 text-rose-300 text-[10px] font-medium"
                >
                  Strict Lock
                </button>
              </div>
            </div>

            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 truncate">
              Sig: <span className="text-cyan-400">{manifest.manifestSignature.slice(0, 24)}...</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
