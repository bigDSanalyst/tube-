import React from 'react';
import { ShieldAlert, X, Lock, Check } from 'lucide-react';
import { PublisherManifest } from '../types/v2e';

interface Props {
  reason: string;
  manifest: PublisherManifest;
  onClose: () => void;
  onGrantPermissionQuick?: () => void;
}

export const PublisherPolicyModal: React.FC<Props> = ({
  reason,
  manifest,
  onClose,
  onGrantPermissionQuick,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-rose-500/80 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 text-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-700/80 text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Publisher ACL Restriction</h3>
              <p className="text-xs text-rose-400 font-mono">Manifest Policy Enforcement</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reason Message */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-sans leading-relaxed">
          {reason}
        </div>

        {/* Publisher Manifest Signature Proof */}
        <div className="space-y-1.5 text-[11px] text-slate-400 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
          <div className="flex justify-between">
            <span>Video ID:</span>
            <span className="text-slate-300">{manifest.videoId}</span>
          </div>
          <div className="flex justify-between">
            <span>Publisher:</span>
            <span className="text-cyan-400">{manifest.publisherName}</span>
          </div>
          <div className="flex justify-between">
            <span>Max Tabs Quota:</span>
            <span className="text-amber-400">{manifest.maxConcurrentTabs}</span>
          </div>
          <div className="truncate text-slate-500 pt-1 border-t border-slate-800 text-[10px]">
            Signature: {manifest.manifestSignature}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          {onGrantPermissionQuick && (
            <button
              onClick={() => {
                onGrantPermissionQuick();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Enable Permission in Governance Bar</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
