import React from 'react';
import { Play, Pause, RotateCcw, Volume2, FastForward, Clock, Layers } from 'lucide-react';
import { SyncLedgerNode } from '../types/v2e';

interface Props {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onChangePlaybackRate: (rate: number) => void;
  ledgerNodes: SyncLedgerNode[];
  activeNodeId: number;
  isSpeakerPaused: boolean;
}

export const VideoTimelinePlayer: React.FC<Props> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  playbackRate,
  onTogglePlay,
  onSeek,
  onChangePlaybackRate,
  ledgerNodes,
  activeNodeId,
  isSpeakerPaused,
}) => {
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100));

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.round(ratio * durationMs));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg select-none">
      {/* Scrubber Progress Bar */}
      <div className="relative mb-2">
        <div
          onClick={handleScrubberClick}
          className="relative h-2.5 bg-slate-800 rounded-full cursor-pointer overflow-hidden group hover:h-3.5 transition-all"
        >
          {/* Played track */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Scrubber Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPercent}% - 7px)` }}
          />
        </div>

        {/* Ledger Node Markers on timeline */}
        <div className="absolute inset-x-0 -top-1 pointer-events-none flex items-center justify-between">
          {ledgerNodes.map((node) => {
            const nodePercent = (node.timestampMs / durationMs) * 100;
            const isActive = node.nodeId === activeNodeId;
            return (
              <div
                key={node.nodeId}
                className="absolute -translate-x-1/2 group/marker pointer-events-auto cursor-pointer"
                style={{ left: `${nodePercent}%` }}
                onClick={() => onSeek(node.timestampMs)}
              >
                <div
                  className={`w-2 h-4 rounded-sm transition-all ${
                    isActive
                      ? 'bg-amber-400 scale-125 shadow-lg shadow-amber-400/50'
                      : 'bg-slate-500 hover:bg-cyan-400'
                  }`}
                />
                {/* Tooltip on hover */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden group-hover/marker:flex flex-col items-center bg-slate-950 border border-slate-700 p-2 rounded shadow-2xl text-[10px] w-48 text-left z-50 pointer-events-none">
                  <span className="font-mono text-cyan-300 font-bold">{(node.timestampMs / 1000).toFixed(1)}s Node</span>
                  <span className="text-slate-300 truncate w-full italic">"{node.spokenText}"</span>
                  <span className="text-emerald-400 font-mono truncate w-full text-[9px]">$ {node.inferredCmd}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Media Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
        {/* Play/Pause & Time */}
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm"
            title={isPlaying ? 'Pause Video Presentation (Space)' : 'Play Video Presentation (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Restart to 00:00"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 font-mono text-slate-300 font-medium">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{formatTime(currentTimeMs)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-500">{formatTime(durationMs)}</span>
          </div>

          {isSpeakerPaused && (
            <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-[10px] text-rose-300 font-mono">
              Speaker Audio Paused (Workspace Active)
            </span>
          )}
        </div>

        {/* Playback Rate */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-[11px]">Speed:</span>
          <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700 text-[11px] font-mono">
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => onChangePlaybackRate(rate)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  playbackRate === rate ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
