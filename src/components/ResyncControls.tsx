import React, { useState } from 'react';
import { RefreshCw, ArrowLeftRight, Terminal, Radio, Cpu, Sparkles } from 'lucide-react';

interface Props {
  isSpeakerPlaying: boolean;
  isForked: boolean;
  currentDisplay: string;
  onSyncSubscreenToSpeaker: () => void;
  onSyncSpeakerToSubscreen: (userText: string) => void;
  onExecuteCommand: (cmd: string) => void;
  lastMatchedSimilarity?: number;
}

export const ResyncControls: React.FC<Props> = ({
  isSpeakerPlaying,
  isForked,
  currentDisplay,
  onSyncSubscreenToSpeaker,
  onSyncSpeakerToSubscreen,
  onExecuteCommand,
  lastMatchedSimilarity,
}) => {
  const [quickInput, setQuickInput] = useState('');

  const handleQuickExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onExecuteCommand(quickInput.trim());
    setQuickInput('');
  };

  const handleSpeakerSync = () => {
    onSyncSpeakerToSubscreen(quickInput);
  };

  return (
    <footer className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg select-none">
      {/* Left: Dual Status Indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] font-semibold ${
            isSpeakerPlaying
              ? 'bg-amber-950/80 border-amber-700/80 text-amber-300'
              : 'bg-rose-950/80 border-rose-700/80 text-rose-300'
          }`}
        >
          <Radio className="w-3 h-3" />
          <span>SPEAKER: {isSpeakerPlaying ? 'PLAYING' : 'PAUSED (WORKSPACE LIVE)'}</span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] font-semibold ${
            isForked
              ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300'
              : 'bg-cyan-950/80 border-cyan-700/80 text-cyan-300'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span>SUBSCREEN: {isForked ? `FORKED (${currentDisplay})` : `SYNCED (${currentDisplay})`}</span>
        </div>

        {lastMatchedSimilarity !== undefined && (
          <span className="text-[10px] bg-slate-800 text-cyan-300 px-2 py-0.5 rounded border border-slate-700 font-mono">
            Match Score: {Math.round(lastMatchedSimilarity * 100)}%
          </span>
        )}
      </div>

      {/* Center: Command Input for Active Sandbox */}
      <form onSubmit={handleQuickExecute} className="flex-1 max-w-md flex items-center gap-1.5">
        <div className="relative flex-1">
          <Terminal className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Execute live bash command or sync target..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg font-mono text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-mono text-xs transition-colors"
        >
          Run
        </button>
      </form>

      {/* Right: YouTube-Style Bidirectional Re-Sync Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSyncSubscreenToSpeaker}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600 text-cyan-300 font-medium transition-all shadow-sm"
          title="Reset Subscreen to match current speaker playhead timestamp"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Sync Subscreen ➔ Speaker</span>
        </button>

        <button
          onClick={handleSpeakerSync}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600 text-amber-300 font-medium transition-all shadow-sm"
          title="Search transcript using current sandbox terminal state and jump video playhead"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
          <span>Sync Speaker ➔ Subscreen</span>
        </button>
      </div>
    </footer>
  );
};
