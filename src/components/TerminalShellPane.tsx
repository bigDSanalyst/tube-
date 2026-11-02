import React, { useState, useRef, useEffect } from 'react';
import { Terminal, ExternalLink, Play, Trash2, ArrowRight, Lock, CornerDownLeft } from 'lucide-react';
import { executeSimulatedShellCommand } from '../utils/bitemporalLogic';

interface Props {
  terminalHistory: string[];
  onCommandExecuted: (cmd: string, outputLines: string[]) => void;
  onClearTerminal: () => void;
  onPopOut: () => void;
  isPopoutAllowed: boolean;
  displayStr: string;
  isForked: boolean;
  suggestedCmds?: string[];
}

export const TerminalShellPane: React.FC<Props> = ({
  terminalHistory,
  onCommandExecuted,
  onClearTerminal,
  onPopOut,
  isPopoutAllowed,
  displayStr,
  isForked,
  suggestedCmds = ['ls -la', 'ps aux', 'python3 --version', 'docker images', 'git status'],
}) => {
  const [currentInput, setCurrentInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [submittedHistory, setSubmittedHistory] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = currentInput.trim();
      if (!cmd) return;

      const res = executeSimulatedShellCommand(cmd);
      const newSubmitted = [...submittedHistory, cmd];
      setSubmittedHistory(newSubmitted);
      setHistoryIndex(-1);
      setCurrentInput('');

      if (res.stdout[0] === '__CLEAR__') {
        onClearTerminal();
      } else {
        onCommandExecuted(cmd, res.stdout);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (submittedHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? submittedHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCurrentInput(submittedHistory[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= submittedHistory.length) {
        setHistoryIndex(-1);
        setCurrentInput('');
      } else {
        setHistoryIndex(nextIdx);
        setCurrentInput(submittedHistory[nextIdx] || '');
      }
    }
  };

  const runSuggested = (cmd: string) => {
    const res = executeSimulatedShellCommand(cmd);
    setSubmittedHistory((prev) => [...prev, cmd]);
    if (res.stdout[0] === '__CLEAR__') {
      onClearTerminal();
    } else {
      onCommandExecuted(cmd, res.stdout);
    }
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-[#0b0f17] border border-slate-800 rounded-lg overflow-hidden font-mono text-xs shadow-inner">
      {/* Pane Window Title Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-800 text-slate-300 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <Terminal className="w-3.5 h-3.5" />
            <span>TERMINAL SHELL PANE</span>
          </div>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">
            {displayStr} (X11 pts/1) • {isForked ? 'FORKED' : 'TRUNK'}
          </span>
        </div>

        {/* Pop-Out Action Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClearTerminal}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Clear terminal screen"
          >
            <Trash2 className="w-3 h-3 text-slate-400" />
            <span className="text-[10px]">Clear</span>
          </button>

          <button
            onClick={onPopOut}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${
              isPopoutAllowed
                ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-600 text-purple-200 shadow-sm'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            title={isPopoutAllowed ? 'Pop out Bash Terminal into isolated browser tab (:101)' : 'Restricted by Publisher Policy'}
          >
            {isPopoutAllowed ? <ExternalLink className="w-3 h-3 text-purple-300" /> : <Lock className="w-3 h-3 text-rose-400" />}
            <span>Pop Out Terminal Tab</span>
          </button>
        </div>
      </div>

      {/* Suggested Quick Commands Bar */}
      <div className="flex items-center px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 gap-1.5 overflow-x-auto select-none">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">
          Quick Cmds:
        </span>
        {suggestedCmds.map((sc) => (
          <button
            key={sc}
            onClick={() => runSuggested(sc)}
            className="px-2 py-0.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 rounded text-[10px] text-emerald-300 font-mono whitespace-nowrap transition-colors flex items-center gap-1"
          >
            <span>$ {sc}</span>
          </button>
        ))}
      </div>

      {/* Terminal Output Area */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-1 text-slate-300 font-mono text-[11px] leading-relaxed select-text"
      >
        <div className="text-slate-500 pb-1 border-b border-slate-800/50">
          V2E Linux Sandbox v2.4 (Virtual Display {displayStr}) — Interactive PTY Connected.
        </div>

        {terminalHistory.map((line, idx) => {
          const isCommand = line.startsWith('$ ') || line.startsWith('user@');
          const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');
          const isSuccess = line.toLowerCase().includes('ok') || line.toLowerCase().includes('pass') || line.toLowerCase().includes('success');

          return (
            <div
              key={idx}
              className={`whitespace-pre-wrap break-all ${
                isCommand
                  ? 'text-emerald-400 font-semibold pt-1'
                  : isError
                  ? 'text-rose-400'
                  : isSuccess
                  ? 'text-emerald-300'
                  : 'text-slate-300'
              }`}
            >
              {line}
            </div>
          );
        })}
      </div>

      {/* Terminal Interactive Prompt Input */}
      <div className="flex items-center px-3 py-2 bg-[#161b22] border-t border-slate-800 gap-2">
        <span className="text-emerald-400 font-semibold select-none flex items-center gap-1">
          <span>user@v2e-sandbox:~$</span>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type bash command (e.g. ls, python3, ps aux, docker images)..."
          className="flex-1 bg-transparent text-emerald-300 font-mono text-[11px] focus:outline-none placeholder:text-slate-600"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          onClick={() => {
            if (currentInput.trim()) {
              const cmd = currentInput.trim();
              const res = executeSimulatedShellCommand(cmd);
              setSubmittedHistory((prev) => [...prev, cmd]);
              setCurrentInput('');
              if (res.stdout[0] === '__CLEAR__') {
                onClearTerminal();
              } else {
                onCommandExecuted(cmd, res.stdout);
              }
            }
          }}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          title="Run command (Enter)"
        >
          <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400" />
        </button>
      </div>
    </div>
  );
};
