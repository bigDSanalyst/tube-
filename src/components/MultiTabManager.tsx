import React from 'react';
import { SpawnedTabSession } from '../types/v2e';
import { ExternalLink, X, Monitor, Cpu, Plus, Sparkles } from 'lucide-react';

interface Props {
  activeTabs: SpawnedTabSession[];
  selectedTabId: string | null; // null means Main Studio
  onSelectTab: (tabId: string | null) => void;
  onCloseTab: (tabId: string) => void;
  onOpenStandaloneWindow: (tab: SpawnedTabSession) => void;
  onSpawnDefaultTab: () => void;
  isPopoutAllowed: boolean;
}

export const MultiTabManager: React.FC<Props> = ({
  activeTabs,
  selectedTabId,
  onSelectTab,
  onCloseTab,
  onOpenStandaloneWindow,
  onSpawnDefaultTab,
  isPopoutAllowed,
}) => {
  return (
    <nav aria-label="Virtual Display Sessions" className="flex items-center px-4 py-2 bg-slate-950/80 border-b border-slate-800 gap-2 overflow-x-auto select-none text-xs">
      {/* Main Studio Tab */}
      <button
        onClick={() => onSelectTab(null)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono transition-all ${
          selectedTabId === null
            ? 'bg-indigo-900/80 border-indigo-600 text-white font-bold shadow-md'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
        }`}
      >
        <Monitor className="w-3.5 h-3.5 text-cyan-400" />
        <span>MAIN STUDIO (:99)</span>
      </button>

      {/* Divider */}
      {activeTabs.length > 0 && <span className="text-slate-700">|</span>}

      {/* Active Torn-Off Tabs */}
      {activeTabs.map((tab) => {
        const isSelected = selectedTabId === tab.tabId;
        return (
          <div
            key={tab.tabId}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg border transition-all ${
              isSelected
                ? 'bg-purple-950 border-purple-500 text-purple-200 font-semibold shadow-md'
                : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <button
              onClick={() => onSelectTab(tab.tabId)}
              className="flex items-center gap-1.5 font-mono text-left"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>{tab.displayStr}</span>
              <span className="text-[10px] text-slate-400">[{tab.componentType.replace('_', ' ')}]</span>
            </button>

            {/* Open in Real Browser Tab / Pop-out Window */}
            <button
              onClick={() => onOpenStandaloneWindow(tab)}
              className="p-1 hover:bg-purple-900/60 rounded text-purple-300 hover:text-white transition-colors"
              title="Open in Standalone Browser Window/Tab"
            >
              <ExternalLink className="w-3 h-3" />
            </button>

            {/* Close / Kill Tab Process */}
            <button
              onClick={() => onCloseTab(tab.tabId)}
              className="p-1 hover:bg-rose-950/80 rounded text-slate-500 hover:text-rose-400 transition-colors"
              title="Terminate Sandbox Process (Kill X11 Session)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Add New Tab Quick Button */}
      {isPopoutAllowed && (
        <button
          onClick={onSpawnDefaultTab}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 text-[11px] transition-colors"
          title="Spawn new isolated Virtual Display Tab"
        >
          <Plus className="w-3.5 h-3.5 text-slate-400" />
          <span>New Sandbox Tab</span>
        </button>
      )}
    </nav>
  );
};
