import React, { useState } from 'react';
import { Code2, ExternalLink, Play, RotateCcw, Copy, Check, FileCode, Lock } from 'lucide-react';

interface Props {
  activeFile: string;
  codeContent: string;
  onCodeChange: (code: string) => void;
  onPopOut: () => void;
  isPopoutAllowed: boolean;
  onResetCode: () => void;
  displayStr: string;
  isForked: boolean;
}

export const IdeEditorPane: React.FC<Props> = ({
  activeFile,
  codeContent,
  onCodeChange,
  onPopOut,
  isPopoutAllowed,
  onResetCode,
  displayStr,
  isForked,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(activeFile || 'app.py');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lines = codeContent.split('\n');

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border border-slate-800 rounded-lg overflow-hidden font-mono text-xs shadow-inner">
      {/* Pane Title Bar / Window Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-800 text-slate-300 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <Code2 className="w-3.5 h-3.5" />
            <span>IDE EDITOR PANE</span>
          </div>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">
            {displayStr} • {isForked ? 'LIVE FORK' : 'SYNCED TRUNK'}
          </span>
        </div>

        {/* Pop-Out Action Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onResetCode}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Reset to timeline video snapshot"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span className="text-[10px]">Revert</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={onPopOut}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${
              isPopoutAllowed
                ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-600 text-purple-200 shadow-sm'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            title={isPopoutAllowed ? 'Pop out IDE Editor into isolated browser tab (:101)' : 'Restricted by Publisher Policy'}
          >
            {isPopoutAllowed ? <ExternalLink className="w-3 h-3 text-purple-300" /> : <Lock className="w-3 h-3 text-rose-400" />}
            <span>Pop Out IDE Tab</span>
          </button>
        </div>
      </div>

      {/* File Tabs Bar */}
      <div className="flex items-center px-2 pt-1 gap-1 bg-[#161b22]/60 border-b border-slate-800/60 overflow-x-auto">
        {['app.py', 'demuxer.py', 'Dockerfile', 'spawn_display.sh', 'test_bitemporal.py'].map((file) => (
          <button
            key={file}
            onClick={() => setActiveTab(file)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t text-[11px] border-t border-x font-mono transition-colors ${
              activeTab === file
                ? 'bg-[#0d1117] text-cyan-300 border-slate-800 border-b-transparent font-medium'
                : 'bg-slate-900/40 text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3 h-3 text-slate-500" />
            <span>{file}</span>
          </button>
        ))}
      </div>

      {/* Code Editor Body with Line Numbers */}
      <div className="flex-1 flex overflow-hidden bg-[#0d1117] relative">
        {/* Line Numbers Gutter */}
        <div className="py-2 px-2.5 bg-[#0b0f17] border-r border-slate-800/80 text-slate-600 select-none text-right font-mono text-[11px]">
          {lines.map((_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          value={codeContent}
          onChange={(e) => onCodeChange(e.target.value)}
          spellCheck={false}
          className="flex-1 p-2 bg-transparent text-slate-200 font-mono text-[11px] leading-5 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50 overflow-auto whitespace-pre selection:bg-cyan-900/50"
          placeholder="Edit code here in live X11 sandbox..."
        />
      </div>

      {/* Editor Status Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-t border-slate-800 text-[10px] text-slate-400 select-none">
        <div className="flex items-center gap-3">
          <span>Python 3.12 / AST Verified</span>
          <span>UTF-8</span>
          <span>{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">● Live Buffer Active</span>
        </div>
      </div>
    </div>
  );
};
