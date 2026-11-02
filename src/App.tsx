/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PublisherManifest,
  ComponentType,
  SyncLedgerNode,
  SpawnedTabSession,
  ViewportConfig,
  BroadcastMessage,
  SubscriberTier,
} from './types/v2e';
import {
  DEFAULT_MANIFEST,
  DEFAULT_LEDGER_NODES,
  verifyPublisherPolicy,
  allocateVirtualDisplay,
  findBestLedgerNodeBySimilarity,
  findLedgerNodeAtTimestamp,
} from './utils/bitemporalLogic';

import { PublisherGovernanceBar } from './components/PublisherGovernanceBar';
import { MultiTabManager } from './components/MultiTabManager';
import { PresenterPiPCutout } from './components/PresenterPiPCutout';
import { InteractiveSubscreen } from './components/InteractiveSubscreen';
import { VideoTimelinePlayer } from './components/VideoTimelinePlayer';
import { DigitalPixelTranscript } from './components/DigitalPixelTranscript';
import { ResyncControls } from './components/ResyncControls';
import { PublisherPolicyModal } from './components/PublisherPolicyModal';
import { DetachedTabWindow } from './components/DetachedTabWindow';

import { Play, Pause, ExternalLink, Sparkles, Monitor, Radio, SplitSquareVertical } from 'lucide-react';

export default function App() {
  // Check URL parameters for detached mode (e.g. ?display=:101&component=IDE_EDITOR&tab_id=...)
  const searchParams = new URLSearchParams(window.location.search);
  const urlDisplay = searchParams.get('display');
  const urlComponent = searchParams.get('component') as ComponentType | null;
  const urlTabId = searchParams.get('tab_id') || searchParams.get('tabId');
  const urlMs = searchParams.get('ms') ? parseInt(searchParams.get('ms')!, 10) : 0;
  const isAutostart = searchParams.get('autostart') === '1';

  // Publisher Governance Manifest & Subscriber Role
  const [manifest, setManifest] = useState<PublisherManifest>(DEFAULT_MANIFEST);
  const [subscriberTier, setSubscriberTier] = useState<SubscriberTier>('paid');
  const [policyViolationReason, setPolicyViolationReason] = useState<string | null>(null);

  // Presenter / Main Video State
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const durationMs = 52000; // 52 seconds total presentation loop
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isSpeakerPlaying, setIsSpeakerPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  // Active Ledger Nodes
  const ledgerNodes = DEFAULT_LEDGER_NODES;
  const activeNode = findLedgerNodeAtTimestamp(currentTimeMs, ledgerNodes);

  // Interactive Subscreen Sandbox State
  const [isWorkspaceForked, setIsWorkspaceForked] = useState<boolean>(false);
  const [workspaceDisplay, setWorkspaceDisplay] = useState<string>(':99');
  const [codeContent, setCodeContent] = useState<string>(activeNode.codeSnippet);
  const [activeFile, setActiveFile] = useState<string>(activeNode.activeFile);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    '$ echo "V2E Engine Initialized on Trunk Display :99"',
    'V2E Engine Initialized on Trunk Display :99',
    '$ ps aux | grep xvfb',
    '104 ? 00:00:03 Xvfb :99 -screen 0 1024x768x24 -ac',
  ]);
  const [viewportConfig, setViewportConfig] = useState<ViewportConfig>(activeNode.viewportConfig);
  const [lastMatchedScore, setLastMatchedScore] = useState<number | undefined>(undefined);

  // Spawned Multi-Tab Sessions Pool
  const [activeTabs, setActiveTabs] = useState<SpawnedTabSession[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  // Cross-Tab BroadcastChannels
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('v2e_bitemporal_bus');
      broadcastChannelRef.current = bc;

      bc.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        const data = event.data;
        if (data.type === 'SEEK_MAIN_SPEAKER') {
          setCurrentTimeMs(data.ms);
          setIsPlaying(true);
        } else if (data.type === 'POLICY_UPDATED') {
          setManifest(data.manifest);
        }
      };

      // v6 speaker heartbeat channel
      const speakerBc = new BroadcastChannel('v2e_speaker');
      const speakerTimer = setInterval(() => {
        try {
          speakerBc.postMessage({ speakerMs: currentTimeMs, ts: Date.now() });
        } catch (_) {}
      }, 500);

      return () => {
        clearInterval(speakerTimer);
        bc.close();
        speakerBc.close();
      };
    }
  }, [currentTimeMs]);

  // Sync subscreen content with video timeline if not yet forked by user
  useEffect(() => {
    if (!isWorkspaceForked) {
      setCodeContent(activeNode.codeSnippet);
      setActiveFile(activeNode.activeFile);
      setViewportConfig(activeNode.viewportConfig);
    }
  }, [activeNode, isWorkspaceForked]);

  // Video Presentation Timer Loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTimeMs((prev) => {
        const next = prev + 100 * playbackRate;
        if (next >= durationMs) {
          return 0; // loop
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, playbackRate, durationMs]);

  // Handle URL Detached Tab initial setup if opened directly in new browser tab
  useEffect(() => {
    if (urlDisplay && urlTabId) {
      const node = findLedgerNodeAtTimestamp(urlMs, ledgerNodes);
      const directSession: SpawnedTabSession = {
        tabId: urlTabId,
        displayNum: parseInt(urlDisplay.replace(':', ''), 10) || 101,
        displayStr: urlDisplay,
        componentType: urlComponent || 'FULL_WORKSPACE',
        forkedFromMs: urlMs,
        initialCmd: node.inferredCmd,
        codeContent: node.codeSnippet,
        terminalHistory: [`$ ${node.inferredCmd}`, `Sandbox initialized at ${(urlMs / 1000).toFixed(1)}s`],
        viewportConfig: node.viewportConfig,
        createdAt: Date.now(),
        processStatus: 'RUNNING',
        pid: 5100 + Math.floor(Math.random() * 800),
      };

      setActiveTabs([directSession]);
      setSelectedTabId(urlTabId);
    }
  }, [urlDisplay, urlTabId, urlComponent, urlMs]);

  // Pop-Out Component to Tab Engine (Enforces Publisher ACL & Subscriber Tier)
  const spawnComponentTab = (componentType: ComponentType, customTimestampMs?: number) => {
    const check = verifyPublisherPolicy(manifest, componentType, activeTabs.length, subscriberTier, activeTabs.length);
    if (!check.allowed) {
      setPolicyViolationReason(check.reason || 'Publisher Policy Violation');
      return;
    }

    const targetMs = customTimestampMs !== undefined ? customTimestampMs : currentTimeMs;
    const node = findLedgerNodeAtTimestamp(targetMs, ledgerNodes);
    let displayNum: number;
    let displayStr: string;

    try {
      const allocated = allocateVirtualDisplay(activeTabs, 101);
      displayNum = allocated.displayNum;
      displayStr = allocated.displayStr;
    } catch (err: any) {
      setPolicyViolationReason(err.message || 'Display pool exhausted');
      return;
    }

    const tabId = `tab_${displayNum}_${Math.random().toString(36).slice(2, 7)}`;

    const newSession: SpawnedTabSession = {
      tabId,
      displayNum,
      displayStr,
      componentType,
      forkedFromMs: targetMs,
      initialCmd: node.inferredCmd,
      codeContent: componentType === 'IDE_EDITOR' ? codeContent : node.codeSnippet,
      terminalHistory: [
        `$ echo "Spawning isolated Virtual Display ${displayStr} at ${(targetMs / 1000).toFixed(1)}s"`,
        `Allocating UID ${10000 + displayNum}... Xauth cookie merged into master keyring (P0-F/P0-G).`,
        `$ ${node.inferredCmd}`,
      ],
      viewportConfig: { ...viewportConfig },
      createdAt: Date.now(),
      lastTouched: Date.now(),
      processStatus: 'RUNNING',
      pid: 5100 + displayNum,
      displayEpoch: 1,
    };

    setActiveTabs((prev) => [...prev, newSession]);
    setSelectedTabId(tabId);

    // Broadcast across other tabs
    broadcastChannelRef.current?.postMessage({
      type: 'TAB_SPAWNED',
      session: newSession,
    });

    // Try to open a real standalone browser window/tab with URL parameters
    const tabUrl = `${window.location.origin}${window.location.pathname}?tab_id=${tabId}&display=${encodeURIComponent(
      displayStr
    )}&component=${componentType}&ms=${targetMs}`;

    try {
      window.open(tabUrl, '_blank');
    } catch {
      // Popup blocker handled seamlessly by in-app tab bar
    }
  };

  // Close Tab Session (Kill virtual display)
  const closeTabSession = (tabId: string) => {
    setActiveTabs((prev) => prev.filter((t) => t.tabId !== tabId));
    if (selectedTabId === tabId) {
      setSelectedTabId(null);
    }
    broadcastChannelRef.current?.postMessage({
      type: 'TAB_CLOSED',
      tabId,
    });
  };

  // Open standalone popup window for an existing active tab
  const openStandaloneWindow = (tab: SpawnedTabSession) => {
    const tabUrl = `${window.location.origin}${window.location.pathname}?tab_id=${tab.tabId}&display=${encodeURIComponent(
      tab.displayStr
    )}&component=${tab.componentType}&ms=${tab.forkedFromMs}`;
    window.open(tabUrl, '_blank');
  };

  // Decoupled Presenter Tap
  const toggleSpeakerPlayback = () => {
    setIsSpeakerPlaying((prev) => !prev);
  };

  // Subscreen Interaction Fork
  const forkSubscreen = () => {
    if (!manifest.allowSubscreenFork) {
      setPolicyViolationReason('Publisher Policy Violation: Subscreen Interactive Forking is locked by the video creator.');
      return;
    }
    setIsWorkspaceForked(true);
    setWorkspaceDisplay(':100');
  };

  // Subscreen terminal execution
  const handleTerminalCommand = (cmd: string, output: string[]) => {
    forkSubscreen();
    setTerminalHistory((prev) => [...prev, `$ ${cmd}`, ...output]);
  };

  // Re-sync: Sync Subscreen -> Speaker (restore subscreen state to match video playhead)
  const handleSyncSubscreenToSpeaker = () => {
    setIsWorkspaceForked(false);
    setWorkspaceDisplay(':99');
    setCodeContent(activeNode.codeSnippet);
    setActiveFile(activeNode.activeFile);
    setViewportConfig(activeNode.viewportConfig);
    setTerminalHistory((prev) => [
      ...prev,
      `$ # [RE-SYNC] Restored subscreen state to playhead ${(currentTimeMs / 1000).toFixed(1)}s`,
      `Trunk display :99 synchronized with presenter timeline.`,
    ]);
  };

  // Re-sync: Sync Speaker -> Subscreen (search user command/text and seek video)
  const handleSyncSpeakerToSubscreen = (queryText: string) => {
    const query = queryText || terminalHistory.slice(-3).join(' ') || codeContent;
    const match = findBestLedgerNodeBySimilarity(query, ledgerNodes);
    setLastMatchedScore(match.score);
    setCurrentTimeMs(match.node.timestampMs);
    setIsPlaying(true);
    setIsSpeakerPlaying(true);
  };

  // Quick Inject from Transcript into Subscreen Terminal
  const handleInjectCommand = (cmd: string) => {
    forkSubscreen();
    setTerminalHistory((prev) => [...prev, `$ ${cmd}`, `Command injected from timeline node.`]);
  };

  // If a torn-off tab is currently selected in Detached mode view
  const currentSelectedSession = activeTabs.find((t) => t.tabId === selectedTabId);

  // If URL has display query parameter and we are directly in standalone tab mode
  if (urlDisplay && currentSelectedSession) {
    return (
      <DetachedTabWindow
        session={currentSelectedSession}
        ledger={ledgerNodes}
        onUpdateSession={(updated) => {
          setActiveTabs((prev) => prev.map((t) => (t.tabId === updated.tabId ? updated : t)));
        }}
        onBroadcastSeek={(ms) => {
          broadcastChannelRef.current?.postMessage({
            type: 'SEEK_MAIN_SPEAKER',
            ms,
          });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. PUBLISHER PERMISSION GOVERNANCE BAR */}
      <PublisherGovernanceBar
        manifest={manifest}
        onUpdateManifest={(updated) => {
          setManifest(updated);
          broadcastChannelRef.current?.postMessage({
            type: 'POLICY_UPDATED',
            manifest: updated,
          });
        }}
        activeTabsCount={activeTabs.length}
        currentDisplay={selectedTabId && currentSelectedSession ? currentSelectedSession.displayStr : workspaceDisplay}
        subscriberTier={subscriberTier}
        onChangeSubscriberTier={setSubscriberTier}
      />

      {/* 2. MULTI-TAB DISPLAY POOL & TEAR-OFF WORKSPACE MANAGER */}
      <MultiTabManager
        activeTabs={activeTabs}
        selectedTabId={selectedTabId}
        onSelectTab={setSelectedTabId}
        onCloseTab={closeTabSession}
        onOpenStandaloneWindow={openStandaloneWindow}
        onSpawnDefaultTab={() => spawnComponentTab('FULL_WORKSPACE')}
        isPopoutAllowed={verifyPublisherPolicy(manifest, 'FULL_WORKSPACE', activeTabs.length, subscriberTier, activeTabs.length).allowed}
      />

      {/* 3. MAIN WORKSPACE / SELECTED TAB DISPLAY AREA */}
      {selectedTabId && currentSelectedSession ? (
        // Detached Tab Session View right inside Studio
        <div className="flex-1 overflow-hidden">
          <DetachedTabWindow
            session={currentSelectedSession}
            ledger={ledgerNodes}
            onUpdateSession={(updated) => {
              setActiveTabs((prev) => prev.map((t) => (t.tabId === updated.tabId ? updated : t)));
            }}
            onBroadcastSeek={(ms) => {
              setCurrentTimeMs(ms);
              setIsPlaying(true);
            }}
            onReturnToStudio={() => setSelectedTabId(null)}
          />
        </div>
      ) : (
        // Standard Studio View: Video Presentation + Interactive Subscreen + Digital Transcript Drawer
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Main Stage: Video Viewport & Interactive Subscreen */}
          <main className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto">
            {/* Upper Stage: Main Video Presentation with Presenter PiP Cutout & Subscreen Workspace */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 flex-1 min-h-[500px]">
              {/* Left / Center: Interactive Subscreen Workspace (9 cols on xl) */}
              <div className="xl:col-span-8 flex flex-col h-full min-h-[460px]">
                <InteractiveSubscreen
                  activeFile={activeFile}
                  codeContent={codeContent}
                  onCodeChange={(code) => {
                    forkSubscreen();
                    setCodeContent(code);
                  }}
                  onResetCode={handleSyncSubscreenToSpeaker}
                  terminalHistory={terminalHistory}
                  onCommandExecuted={handleTerminalCommand}
                  onClearTerminal={() => setTerminalHistory([])}
                  viewportConfig={viewportConfig}
                  onUpdateViewportConfig={(cfg) => {
                    forkSubscreen();
                    setViewportConfig(cfg);
                  }}
                  onPopOutComponent={(type) => spawnComponentTab(type)}
                  isPopoutAllowed={(type) =>
                    verifyPublisherPolicy(manifest, type, activeTabs.length, subscriberTier, activeTabs.length).allowed
                  }
                  displayStr={workspaceDisplay}
                  isForked={isWorkspaceForked}
                  onForkSubscreen={forkSubscreen}
                />
              </div>

              {/* Right Side: Presenter Stream Video & Broadcast Controls (4 cols on xl) */}
              <div className="xl:col-span-4 flex flex-col gap-3">
                {/* Presenter PiP Stream Box with Tap-to-Decouple */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-between shadow-xl">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-amber-400" />
                      PRESENTER STREAM (PiP CUTOUT)
                    </span>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-mono">
                      Z-Index 30
                    </span>
                  </div>

                  <PresenterPiPCutout
                    isSpeakerPlaying={isSpeakerPlaying}
                    onToggleSpeakerPlay={toggleSpeakerPlayback}
                    isMuted={isMuted}
                    onToggleMute={() => setIsMuted(!isMuted)}
                    currentSpokenText={activeNode.spokenText}
                    timestampSec={currentTimeMs / 1000}
                  />

                  <div className="w-full mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Facecam & Audio Feed</span>
                    <span className="text-amber-400 font-medium">Decoupled Architecture</span>
                  </div>
                </div>

                {/* Video Playhead Timeline Controls */}
                <VideoTimelinePlayer
                  currentTimeMs={currentTimeMs}
                  durationMs={durationMs}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  onTogglePlay={() => setIsPlaying(!isPlaying)}
                  onSeek={(ms) => {
                    setCurrentTimeMs(ms);
                  }}
                  onChangePlaybackRate={setPlaybackRate}
                  ledgerNodes={ledgerNodes}
                  activeNodeId={activeNode.nodeId}
                  isSpeakerPaused={!isSpeakerPlaying}
                />
              </div>
            </div>

            {/* Bottom: Bidirectional Re-Sync & Sandbox Controls */}
            <ResyncControls
              isSpeakerPlaying={isSpeakerPlaying}
              isForked={isWorkspaceForked}
              currentDisplay={workspaceDisplay}
              onSyncSubscreenToSpeaker={handleSyncSubscreenToSpeaker}
              onSyncSpeakerToSubscreen={handleSyncSpeakerToSubscreen}
              onExecuteCommand={(cmd) => handleTerminalCommand(cmd, ['Executed via quick control bar.'])}
              lastMatchedSimilarity={lastMatchedScore}
            />
          </main>

          {/* Right Drawer: Bitemporal Digital Pixel Transcript Ledger */}
          <div className="w-full lg:w-96 flex-shrink-0 h-[380px] lg:h-auto">
            <DigitalPixelTranscript
              nodes={ledgerNodes}
              activeNodeId={activeNode.nodeId}
              onSeekSpeaker={(ms) => {
                setCurrentTimeMs(ms);
                setIsPlaying(true);
              }}
              onPopOutAtNode={(node) => spawnComponentTab('TERMINAL', node.timestampMs)}
              onInjectCmd={handleInjectCommand}
              isPopoutAllowed={
                verifyPublisherPolicy(manifest, 'TERMINAL', activeTabs.length, subscriberTier, activeTabs.length).allowed
              }
              activeTabs={activeTabs}
            />
          </div>
        </div>
      )}

      {/* Publisher Policy Violation Dialog / Modal */}
      {policyViolationReason && (
        <PublisherPolicyModal
          reason={policyViolationReason}
          manifest={manifest}
          onClose={() => setPolicyViolationReason(null)}
          onGrantPermissionQuick={() => {
            setManifest({
              ...manifest,
              allowSubscreenFork: true,
              allowMultiTabPopout: true,
              maxConcurrentTabs: Math.max(6, manifest.maxConcurrentTabs + 2),
              allowedComponents: ['FULL_WORKSPACE', 'IDE_EDITOR', 'TERMINAL', 'VIEWPORT_PREVIEW'],
            });
          }}
        />
      )}
    </div>
  );
}
