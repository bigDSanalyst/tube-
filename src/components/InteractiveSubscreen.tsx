import React, { useState } from 'react';
import { ComponentType, ViewportConfig } from '../types/v2e';
import { IdeEditorPane } from './IdeEditorPane';
import { TerminalShellPane } from './TerminalShellPane';
import { ViewportPreviewPane } from './ViewportPreviewPane';
import { Grid, Maximize2, ExternalLink, Lock, CheckCircle2, SplitSquareVertical } from 'lucide-react';

interface Props {
  activeFile: string;
  codeContent: string;
  onCodeChange: (code: string) => void;
  onResetCode: () => void;
  terminalHistory: string[];
  onCommandExecuted: (cmd: string, outputLines: string[]) => void;
  onClearTerminal: () => void;
  viewportConfig: ViewportConfig;
  onUpdateViewportConfig: (config: ViewportConfig) => void;
  onPopOutComponent: (componentType: ComponentType) => void;
  isPopoutAllowed: (componentType: ComponentType) => boolean;
  displayStr: string;
  isForked: boolean;
  onForkSubscreen: () => void;
}

export const InteractiveSubscreen: React.FC<Props> = ({
  activeFile,
  codeContent,
  onCodeChange,
  onResetCode,
  terminalHistory,
  onCommandExecuted,
  onClearTerminal,
  viewportConfig,
  onUpdateViewportConfig,
  onPopOutComponent,
  isPopoutAllowed,
  displayStr,
  isForked,
  onForkSubscreen,
}) => {
  const [layoutMode, setLayoutMode] = useState<'TILED' | 'IDE' | 'TERMINAL' | 'VIEWPORT'>('TILED');

  return (
    <div
      onClick={() => {
        if (!isForked) onForkSubscreen();
      }}
      className={`relative flex flex-col h-full w-full rounded-xl overflow-hidden border-2 transition-all duration-200 bg-slate-950 shadow-2xl ${
        isForked
          ? 'border-emerald-500/90 shadow-emerald-500/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Subscreen Demuxer Header */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 gap-2 select-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/80 font-mono text-[11px] text-indigo-300 font-bold">
            <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />
            WORKSPACE SUBSCREEN
          </span>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
              isForked
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700 animate-pulse'
                : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
            }`}
          >
            {isForked ? `LIVE FORKED DISPLAY (${displayStr})` : `SYNCED TRUNK DISPLAY (${displayStr})`}
          </span>
        </div>

        {/* Layout Mode Switcher & Full Subscreen Popout */}
        <div className="flex items-center gap-2">
          {/* Layout Buttons */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded p-0.5 text-xs">
            <button
              onClick={() => setLayoutMode('TILED')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                layoutMode === 'TILED' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3-Pane Tiled Layout"
            >
              Tiled Grid
            </button>
            <button
              onClick={() => setLayoutMode('IDE')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                layoutMode === 'IDE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              IDE
            </button>
            <button
              onClick={() => setLayoutMode('TERMINAL')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                layoutMode === 'TERMINAL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Terminal
            </button>
            <button
              onClick={() => setLayoutMode('VIEWPORT')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                layoutMode === 'VIEWPORT' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3D Viewport
            </button>
          </div>

          {/* Full Workspace Pop-Out Button */}
          <button
            onClick={() => onPopOutComponent('FULL_WORKSPACE')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
              isPopoutAllowed('FULL_WORKSPACE')
                ? 'bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 border-purple-500 text-purple-200 shadow-md'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            title="Pop out entire 3-pane subscreen workspace into new browser tab"
          >
            {isPopoutAllowed('FULL_WORKSPACE') ? <ExternalLink className="w-3.5 h-3.5 text-purple-300" /> : <Lock className="w-3.5 h-3.5 text-rose-400" />}
            <span>Pop Out Full Subscreen</span>
          </button>
        </div>
      </div>

      {/* Pane Content Area */}
      <div className="flex-1 p-2 overflow-hidden">
        {layoutMode === 'TILED' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 h-full">
            {/* Left Top: IDE Editor (7 cols) */}
            <div className="lg:col-span-7 h-[280px] lg:h-[55%]">
              <IdeEditorPane
                activeFile={activeFile}
                codeContent={codeContent}
                onCodeChange={onCodeChange}
                onPopOut={() => onPopOutComponent('IDE_EDITOR')}
                isPopoutAllowed={isPopoutAllowed('IDE_EDITOR')}
                onResetCode={onResetCode}
                displayStr={displayStr}
                isForked={isForked}
              />
            </div>

            {/* Right Top: 3D Viewport (5 cols) */}
            <div className="lg:col-span-5 h-[260px] lg:h-[55%]">
              <ViewportPreviewPane
                config={viewportConfig}
                onUpdateConfig={onUpdateViewportConfig}
                onPopOut={() => onPopOutComponent('VIEWPORT_PREVIEW')}
                isPopoutAllowed={isPopoutAllowed('VIEWPORT_PREVIEW')}
                displayStr={displayStr}
                isForked={isForked}
              />
            </div>

            {/* Bottom: Terminal Shell (12 cols) */}
            <div className="lg:col-span-12 h-[220px] lg:h-[42%]">
              <TerminalShellPane
                terminalHistory={terminalHistory}
                onCommandExecuted={onCommandExecuted}
                onClearTerminal={onClearTerminal}
                onPopOut={() => onPopOutComponent('TERMINAL')}
                isPopoutAllowed={isPopoutAllowed('TERMINAL')}
                displayStr={displayStr}
                isForked={isForked}
              />
            </div>
          </div>
        ) : layoutMode === 'IDE' ? (
          <div className="h-full">
            <IdeEditorPane
              activeFile={activeFile}
              codeContent={codeContent}
              onCodeChange={onCodeChange}
              onPopOut={() => onPopOutComponent('IDE_EDITOR')}
              isPopoutAllowed={isPopoutAllowed('IDE_EDITOR')}
              onResetCode={onResetCode}
              displayStr={displayStr}
              isForked={isForked}
            />
          </div>
        ) : layoutMode === 'TERMINAL' ? (
          <div className="h-full">
            <TerminalShellPane
              terminalHistory={terminalHistory}
              onCommandExecuted={onCommandExecuted}
              onClearTerminal={onClearTerminal}
              onPopOut={() => onPopOutComponent('TERMINAL')}
              isPopoutAllowed={isPopoutAllowed('TERMINAL')}
              displayStr={displayStr}
              isForked={isForked}
            />
          </div>
        ) : (
          <div className="h-full">
            <ViewportPreviewPane
              config={viewportConfig}
              onUpdateConfig={onUpdateViewportConfig}
              onPopOut={() => onPopOutComponent('VIEWPORT_PREVIEW')}
              isPopoutAllowed={isPopoutAllowed('VIEWPORT_PREVIEW')}
              displayStr={displayStr}
              isForked={isForked}
            />
          </div>
        )}
      </div>
    </div>
  );
};
