import React from 'react';
import { SyncLedgerNode, SpawnedTabSession } from '../types/v2e';
import { Clock, ExternalLink, Terminal, MessageSquare, Sparkles, CheckCircle2, Cpu } from 'lucide-react';

interface Props {
  nodes: SyncLedgerNode[];
  activeNodeId: number;
  onSeekSpeaker: (ms: number) => void;
  onPopOutAtNode: (node: SyncLedgerNode) => void;
  onInjectCmd: (cmd: string) => void;
  isPopoutAllowed: boolean;
  activeTabs: SpawnedTabSession[];
}

export const DigitalPixelTranscript: React.FC<Props> = ({
  nodes,
  activeNodeId,
  onSeekSpeaker,
  onPopOutAtNode,
  onInjectCmd,
  isPopoutAllowed,
  activeTabs,
}) => {
  return (
    <aside className="flex flex-col h-full bg-[#161b22] border-l border-slate-800 text-slate-200 select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0d1117]/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold text-slate-200 tracking-wide">DIGITAL PIXEL LEDGER</h2>
        </div>
        <span className="text-[10px] bg-cyan-950/80 border border-cyan-800 text-cyan-300 px-2 py-0.5 rounded font-mono">
          Bitemporal Sync
        </span>
      </div>

      {/* Active Tabs Pool Section (if any torn-off tabs exist) */}
      {activeTabs.length > 0 && (
        <div className="p-3 border-b border-slate-800 bg-purple-950/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              Active Torn-Off Tabs ({activeTabs.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {activeTabs.map((tab) => (
              <div
                key={tab.tabId}
                className="p-2 rounded bg-slate-900/90 border border-purple-800/60 flex items-center justify-between text-[10px] font-mono"
              >
                <div>
                  <span className="text-purple-300 font-bold">{tab.displayStr}</span>
                  <span className="text-slate-400 ml-1.5">• {tab.componentType}</span>
                </div>
                <span className="text-emerald-400 bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800">
                  from {(tab.forkedFromMs / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ledger Nodes Timeline List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {nodes.map((node) => {
          const isActive = node.nodeId === activeNodeId;
          const timeSec = (node.timestampMs / 1000).toFixed(1);

          return (
            <div
              key={node.nodeId}
              className={`rounded-lg p-3 border transition-all text-xs space-y-2 ${
                isActive
                  ? 'bg-slate-900 border-amber-500/80 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
                  : 'bg-[#0d1117] border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Header: Timestamp & Pop Out Action */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <strong className={isActive ? 'text-amber-300' : 'text-slate-300'}>{timeSec}s</strong>
                </span>

                <button
                  onClick={() => onPopOutAtNode(node)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                    isPopoutAllowed
                      ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-700 text-purple-200'
                      : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
                  title="Pop out sandboxed tab cloned at this exact timestamp"
                >
                  <ExternalLink className="w-2.5 h-2.5 text-purple-300" />
                  <span>Pop Out @ {timeSec}s</span>
                </button>
              </div>

              {/* Spoken Audio Quote (Click to seek speaker) */}
              <div
                onClick={() => onSeekSpeaker(node.timestampMs)}
                className="text-amber-300/90 cursor-pointer hover:text-amber-200 transition-colors flex items-start gap-1.5"
                title="Click to seek presenter playhead here"
              >
                <MessageSquare className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="italic leading-relaxed">"{node.spokenText}"</span>
              </div>

              {/* Pixel OCR Inferred Command (Click to inject in terminal) */}
              <div
                onClick={() => onInjectCmd(node.inferredCmd)}
                className="bg-[#161b22] hover:bg-[#1c222b] border border-slate-800 rounded p-2 font-mono text-[11px] text-emerald-400 cursor-pointer transition-colors group flex items-center justify-between"
                title="Click to paste into subscreen terminal"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Terminal className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className="truncate">$ {node.inferredCmd}</span>
                </div>
                <span className="text-[9px] text-slate-500 group-hover:text-cyan-300 transition-colors uppercase font-sans">
                  Inject ➔
                </span>
              </div>

              {/* Pixel OCR text lines excerpt */}
              {node.pixelOcrLines.length > 0 && (
                <div className="text-[10px] text-slate-500 font-mono space-y-0.5 border-t border-slate-800/60 pt-1.5">
                  <span className="text-slate-400 uppercase text-[9px] font-semibold">OCR Detection:</span>
                  {node.pixelOcrLines.slice(0, 2).map((line, idx) => (
                    <div key={idx} className="truncate text-slate-400">
                      • {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
