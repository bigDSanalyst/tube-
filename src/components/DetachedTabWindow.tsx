import React, { useState, useEffect, useCallback } from 'react';
import { SpawnedTabSession, SyncLedgerNode, ViewportConfig, ComponentType } from '../types/v2e';
import { IdeEditorPane } from './IdeEditorPane';
import { TerminalShellPane } from './TerminalShellPane';
import { ViewportPreviewPane } from './ViewportPreviewPane';
import { InteractiveSubscreen } from './InteractiveSubscreen';
import { Cpu, Radio, ArrowLeftRight, RefreshCw, ArrowLeft, ExternalLink, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { findBestLedgerNodeBySimilarity, findLedgerNodeAtTimestamp } from '../utils/bitemporalLogic';

interface Props {
  session: SpawnedTabSession;
  ledger: SyncLedgerNode[];
  onUpdateSession: (updated: SpawnedTabSession) => void;
  onBroadcastSeek: (ms: number) => void;
  onReturnToStudio?: () => void;
  isSessionExpired?: boolean;
}

export const DetachedTabWindow: React.FC<Props> = ({
  session,
  ledger,
  onUpdateSession,
  onBroadcastSeek,
  onReturnToStudio,
  isSessionExpired = false,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [lastSyncScore, setLastSyncScore] = useState<number | undefined>(undefined);
  const [isExpired, setIsExpired] = useState<boolean>(isSessionExpired);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // V8 Item 4: Ordered visibilitychange handler (awaits auth refresh before reconnecting)
  const refreshAuthState = useCallback(async (): Promise<boolean> => {
    // Check localStorage or simulated token
    const token = typeof window !== 'undefined' ? localStorage.getItem('v2e_cap_token') : null;
    if (!token && isExpired) {
      setStatusToast('Session expired — please sign in again on the main tab');
      return false;
    }
    return true;
  }, [isExpired]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const isAuthed = await refreshAuthState();
        if (!isAuthed) {
          setIsExpired(true);
          setStatusToast('Session expired — please sign in again on the main tab');
        } else {
          setIsExpired(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshAuthState]);

  const handleCommand = (cmd: string, output: string[]) => {
    if (isExpired) {
      setStatusToast('Session expired — please sign in again on the main tab');
      return;
    }
    const nextHistory = [...session.terminalHistory, `$ ${cmd}`, ...output];
    onUpdateSession({
      ...session,
      terminalHistory: nextHistory,
    });
  };

  const handleClearTerminal = () => {
    onUpdateSession({
      ...session,
      terminalHistory: [],
    });
  };

  const handleCodeChange = (code: string) => {
    if (isExpired) {
      setStatusToast('Session expired — please sign in again on the main tab');
      return;
    }
    onUpdateSession({
      ...session,
      codeContent: code,
    });
  };

  const handleViewportUpdate = (cfg: ViewportConfig) => {
    onUpdateSession({
      ...session,
      viewportConfig: cfg,
    });
  };

  // Re-sync: Sync Speaker -> Subscreen (find match in ledger from terminal/input and seek main YouTube video)
  const handleSyncSpeakerToSubscreen = () => {
    const query = quickInput || session.terminalHistory.slice(-3).join(' ') || session.initialCmd;
    const match = findBestLedgerNodeBySimilarity(query, ledger);
    setLastSyncScore(match.score);
    onBroadcastSeek(match.node.timestampMs);
  };

  // Re-sync: Sync Subscreen -> Speaker (reset to session's forked timestamp)
  const handleSyncSubscreenToSpeaker = () => {
    const node = findLedgerNodeAtTimestamp(session.forkedFromMs, ledger);
    onUpdateSession({
      ...session,
      codeContent: node.codeSnippet,
      initialCmd: node.inferredCmd,
      viewportConfig: node.viewportConfig,
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-200 overflow-hidden font-sans select-none relative">
      {/* V8 Expired Session Banner */}
      {isExpired && (
        <div className="bg-rose-950/90 border-b border-rose-700/80 px-4 py-2 text-rose-200 text-xs flex items-center justify-between shadow-lg z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="font-semibold">Session expired — please sign in again on the main tab</span>
          </div>
          <button
            onClick={async () => {
              const ok = await refreshAuthState();
              if (ok) setIsExpired(false);
            }}
            className="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-medium transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Floating Status Toast */}
      {statusToast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-rose-600/60 text-rose-300 px-4 py-2 rounded-lg text-xs shadow-2xl flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>{statusToast}</span>
          <button onClick={() => setStatusToast(null)} className="ml-2 text-slate-400 hover:text-white font-bold">×</button>
        </div>
      )}

      {/* Detached Top Bar */}
      <header className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-slate-800 gap-3 shadow-md">
        <div className="flex items-center gap-3">
          {onReturnToStudio && (
            <button
              onClick={onReturnToStudio}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Main Studio</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-purple-950 border border-purple-600 text-purple-200 font-mono text-xs font-bold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              DETACHED TAB: {session.componentType.replace('_', ' ')} ({session.displayStr})
            </span>
            <span className="text-slate-400 text-xs hidden sm:inline">
              Forked from: <strong className="text-cyan-300 font-mono">{(session.forkedFromMs / 1000).toFixed(1)}s</strong>
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Trunk :99 & tmux: HEALTHY
          </span>

          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center gap-1">
            <Radio className="w-3 h-3 text-slate-500" />
            YouTube Video: DECOUPLED
          </span>

          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-300 font-mono text-[11px] flex items-center gap-1">
            UID: {10000 + session.displayNum} (Xauth Enforced)
          </span>

          <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[11px] flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Isolated Sandbox {session.displayStr}
          </span>
        </div>
      </header>

      {/* Main Detached Component Body */}
      <main className="flex-1 p-3 overflow-hidden bg-[#090d16]">
        {session.componentType === 'IDE_EDITOR' ? (
          <div className="h-full">
            <IdeEditorPane
              activeFile="app.py"
              codeContent={session.codeContent}
              onCodeChange={handleCodeChange}
              onPopOut={() => {}}
              isPopoutAllowed={false}
              onResetCode={handleSyncSubscreenToSpeaker}
              displayStr={session.displayStr}
              isForked={true}
            />
          </div>
        ) : session.componentType === 'TERMINAL' ? (
          <div className="h-full">
            <TerminalShellPane
              terminalHistory={session.terminalHistory}
              onCommandExecuted={handleCommand}
              onClearTerminal={handleClearTerminal}
              onPopOut={() => {}}
              isPopoutAllowed={false}
              displayStr={session.displayStr}
              isForked={true}
            />
          </div>
        ) : session.componentType === 'VIEWPORT_PREVIEW' ? (
          <div className="h-full">
            <ViewportPreviewPane
              config={session.viewportConfig}
              onUpdateConfig={handleViewportUpdate}
              onPopOut={() => {}}
              isPopoutAllowed={false}
              displayStr={session.displayStr}
              isForked={true}
            />
          </div>
        ) : (
          <div className="h-full">
            <InteractiveSubscreen
              activeFile="app.py"
              codeContent={session.codeContent}
              onCodeChange={handleCodeChange}
              onResetCode={handleSyncSubscreenToSpeaker}
              terminalHistory={session.terminalHistory}
              onCommandExecuted={handleCommand}
              onClearTerminal={handleClearTerminal}
              viewportConfig={session.viewportConfig}
              onUpdateViewportConfig={handleViewportUpdate}
              onPopOutComponent={() => {}}
              isPopoutAllowed={() => false}
              displayStr={session.displayStr}
              isForked={true}
              onForkSubscreen={() => {}}
            />
          </div>
        )}
      </main>

      {/* Detached Controls & Cross-Tab Broadcast Re-sync Bar */}
      <footer className="p-3 bg-[#161b22] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Search terminal output or enter command to re-sync..."
            className="w-72 px-3 py-1.5 bg-[#0b0f17] border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
          />
          {lastSyncScore !== undefined && (
            <span className="text-[11px] text-cyan-300 font-mono">
              Match: {Math.round(lastSyncScore * 100)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncSubscreenToSpeaker}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-600 text-cyan-300 font-medium transition-colors"
            title="Reset sandbox state to forked timestamp"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Subscreen ➔ Speaker</span>
          </button>

          <button
            onClick={handleSyncSpeakerToSubscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-950 hover:bg-amber-900 border border-amber-600 text-amber-300 font-medium transition-colors"
            title="Broadcast seek command across tabs to jump main YouTube video"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Sync Speaker ➔ Subscreen (Broadcast)</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
