import { PublisherManifest, ComponentType, SyncLedgerNode, SpawnedTabSession, ViewportConfig, SubscriberTier } from '../types/v2e';

export const TIER_RANK: Record<SubscriberTier, number> = {
  free: 0,
  paid: 1,
  premium: 2,
};

export const MIN_TAB_DISPLAY = 101;
export const MAX_TAB_DISPLAY = 1099;
export const USER_FORK_BASE = 1100;
export const USER_FORK_MAX = 1199;

export const DEFAULT_MANIFEST: PublisherManifest = {
  videoId: 'demo_v2e_008',
  videoTitle: 'V2E: Real-time Multi-Tab Demuxing & Cryptographic X11 Sandbox Orchestration v8',
  publisherName: 'Dr. Evelyn Carter (Systems & HCI Lab)',
  publisherId: 'publisher_alpha',
  manifestSignature: '0x3f9e8a71b4c820ddf51a4409ef1b29a678c4125b28d098eef62a9c1e089d7b42',
  signedAt: 1730500000,
  min_subscriber_tier: 'paid',
  allowSubscreenFork: true,
  allowMultiTabPopout: true,
  maxConcurrentTabs: 6,
  max_tabs_per_subscriber: 2,
  max_concurrent_forks: 50,
  allowedComponents: ['FULL_WORKSPACE', 'IDE_EDITOR', 'TERMINAL', 'VIEWPORT_PREVIEW'],
  allowFullShellControl: true,
  sandboxExpiryMinutes: 30,
};

export const DEFAULT_LEDGER_NODES: SyncLedgerNode[] = [
  {
    nodeId: 0,
    timestampMs: 0,
    frameIdx: 0,
    spokenText: "Welcome! Today we are introducing live Video-to-Execution with multi-tenant subscreen demuxing.",
    pixelOcrLines: [
      "import numpy as np",
      "import torch.nn as nn",
      "# Initializing V2E Bitemporal Core",
      "print('Engine Initialized: PID 4821')"
    ],
    inferredCmd: "echo 'V2E Workspace Loaded' && ps aux",
    activeFile: "app.py",
    codeSnippet: `import numpy as np
import torch
import torch.nn as nn

class SpatialDemuxer(nn.Module):
    def __init__(self, channels=128):
        super().__init__()
        self.conv = nn.Conv2d(3, channels, kernel_size=3, padding=1)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(self.conv(x))

if __name__ == '__main__':
    print("V2E Spatial Demuxer ready on display :99")`,
    viewportConfig: {
      meshType: 'torus',
      wireframe: true,
      rotationSpeed: 0.015,
      primaryColor: '#38bdf8',
      particleDensity: 24,
    },
  },
  {
    nodeId: 1,
    timestampMs: 6500,
    frameIdx: 195,
    spokenText: "Notice how the model segments the editor, terminal, and 3D preview into separate render regions.",
    pixelOcrLines: [
      "def extract_rois(frame):",
      "    rois = {'ide': (40, 40), 'term': (40, 450)}",
      "    return demux_surfaces(rois)",
    ],
    inferredCmd: "python3 -c 'import torch; print(torch.cuda.is_available())'",
    activeFile: "demuxer.py",
    codeSnippet: `def extract_rois(frame_matrix):
    """Segment frame into bitemporal control panes."""
    panes = {
        'IDE_EDITOR': frame_matrix[40:440, 40:640],
        'TERMINAL': frame_matrix[450:640, 40:960],
        'VIEWPORT_PREVIEW': frame_matrix[40:440, 650:960]
    }
    return {k: v.shape for k, v in panes.items()}`,
    viewportConfig: {
      meshType: 'cube',
      wireframe: false,
      rotationSpeed: 0.025,
      primaryColor: '#10b981',
      particleDensity: 36,
    },
  },
  {
    nodeId: 2,
    timestampMs: 14000,
    frameIdx: 420,
    spokenText: "We execute our container build in the subscreen terminal while inspecting memory consumption.",
    pixelOcrLines: [
      "$ docker build -t v2e-sandbox:v2 .",
      "[+] Building 2.4s (8/8) FINISHED",
      "Step 4/8: RUN pip install opencv-python-headless",
    ],
    inferredCmd: "docker build -t v2e-sandbox:v2 . && docker images",
    activeFile: "Dockerfile",
    codeSnippet: `FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \\
    xvfb openbox xterm xdotool ffmpeg python3-pip
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8080 5900`,
    viewportConfig: {
      meshType: 'neural_graph',
      wireframe: true,
      rotationSpeed: 0.02,
      primaryColor: '#a855f7',
      particleDensity: 48,
    },
  },
  {
    nodeId: 3,
    timestampMs: 23500,
    frameIdx: 705,
    spokenText: "Now watch closely: clicking Pop Out will spawn a dedicated Xvfb display :101 with exact process state.",
    pixelOcrLines: [
      "$ xvfb-run -s ':101 -screen 0 1024x768x24'",
      "Allocating dynamic child process PID 5109",
      "Cloning memory state at frame 705...",
    ],
    inferredCmd: "Xvfb :101 -screen 0 1024x768x24 -ac & openbox &",
    activeFile: "spawn_display.sh",
    codeSnippet: `#!/usr/bin/env bash
DISP=":101"
echo "Spawning Virtual Display \${DISP} on-demand"
Xvfb \${DISP} -screen 0 1024x768x24 -ac +extension GLX &
PID_XVFB=$!
sleep 0.2
DISPLAY=\${DISP} openbox &
echo "Display \${DISP} ready. Initializing component stream."`,
    viewportConfig: {
      meshType: 'sphere',
      wireframe: true,
      rotationSpeed: 0.03,
      primaryColor: '#f59e0b',
      particleDensity: 32,
    },
  },
  {
    nodeId: 4,
    timestampMs: 34000,
    frameIdx: 1020,
    spokenText: "Even while I continue speaking here in the main video, viewers in tab :101 have live shell control.",
    pixelOcrLines: [
      "user@v2e-sandbox:~$ python3 -m unittest discover",
      "Ran 14 tests in 0.412s",
      "OK (all 14 assertions passed)",
    ],
    inferredCmd: "python3 -m unittest discover -v",
    activeFile: "test_bitemporal.py",
    codeSnippet: `import unittest

class TestMultiTabIsolation(unittest.TestCase):
    def test_independent_display_pipe(self):
        pipe_101 = allocate_display(":101")
        pipe_102 = allocate_display(":102")
        self.assertNotEqual(pipe_101.display, pipe_102.display)
        self.assertTrue(pipe_101.is_isolated())

if __name__ == '__main__':
    unittest.main()`,
    viewportConfig: {
      meshType: 'torus',
      wireframe: false,
      rotationSpeed: 0.018,
      primaryColor: '#ec4899',
      particleDensity: 40,
    },
  },
  {
    nodeId: 5,
    timestampMs: 46000,
    frameIdx: 1380,
    spokenText: "If you get lost, just hit the Sync Speaker button to jump the presenter playhead to your terminal context.",
    pixelOcrLines: [
      "$ curl -X POST /api/resync -d '{\"dir\":\"SPEAKER_TO_SUBSCREEN\"}'",
      "Response: { 'seek_ms': 46000, 'matched_node': 5 }",
      "Playhead aligned via difflib sequence matching",
    ],
    inferredCmd: "git status && git log -n 1 --oneline",
    activeFile: "resync_engine.ts",
    codeSnippet: `export function resyncSpeakerPlayhead(terminalBuffer: string, ledger: LedgerNode[]) {
  const match = findBestLedgerNodeBySimilarity(terminalBuffer, ledger);
  return {
    targetMs: match.node.timestampMs,
    confidence: match.score,
    inferredTopic: match.node.spokenText
  };
}`,
    viewportConfig: {
      meshType: 'neural_graph',
      wireframe: false,
      rotationSpeed: 0.035,
      primaryColor: '#06b6d4',
      particleDensity: 60,
    },
  },
];

/**
 * Checks if the publisher permission manifest allows a specific action.
 */
/**
 * Checks if the publisher permission manifest allows a specific action.
 */
export function verifyPublisherPolicy(
  manifest: PublisherManifest,
  componentType: ComponentType,
  currentTabCount: number,
  subscriberTier: SubscriberTier = 'paid',
  userTabCount = 0
): { allowed: boolean; reason?: string } {
  // Check subscriber tier rank against manifest min tier
  const userRank = TIER_RANK[subscriberTier] ?? 0;
  const reqRank = TIER_RANK[manifest.min_subscriber_tier] ?? 1;

  if (userRank < reqRank) {
    return {
      allowed: false,
      reason: `Subscriber Tier Restricted: This action requires '${manifest.min_subscriber_tier.toUpperCase()}' subscriber tier or higher. Current: '${subscriberTier.toUpperCase()}'.`,
    };
  }

  if (!manifest.allowSubscreenFork) {
    return {
      allowed: false,
      reason: "Publisher Policy Violation: Subscreen Interactive Forking is disabled by the creator for this video stream.",
    };
  }

  if (componentType !== 'FULL_WORKSPACE' && !manifest.allowMultiTabPopout) {
    return {
      allowed: false,
      reason: "Publisher Policy Violation: Multi-Tab Component Pop-Out is disabled in this video's cryptographic manifest.",
    };
  }

  const maxPerUser = manifest.max_tabs_per_subscriber ?? 2;
  if (userTabCount >= maxPerUser) {
    return {
      allowed: false,
      reason: `Subscriber Quota Exceeded: You have reached your limit of ${maxPerUser} concurrent sandboxes.`,
    };
  }

  if (currentTabCount >= manifest.maxConcurrentTabs) {
    return {
      allowed: false,
      reason: `Publisher Quota Exceeded: Video creator policy allows a maximum of ${manifest.maxConcurrentTabs} concurrent torn-off sandboxes.`,
    };
  }

  if (!manifest.allowedComponents.includes(componentType)) {
    return {
      allowed: false,
      reason: `Publisher Policy Restriction: Component '${componentType}' has been locked by the creator. Available: ${manifest.allowedComponents.join(', ')}.`,
    };
  }

  return { allowed: true };
}

/**
 * Allocates a user-specific fork display (:1100 - :1199) on first interaction
 */
export function allocateUserForkDisplay(usedDisplays: number[]): { displayNum: number; displayStr: string } {
  const used = new Set(usedDisplays);
  let cand = 1100;
  while (used.has(cand) && cand <= 1199) {
    cand++;
  }
  return {
    displayNum: cand,
    displayStr: `:${cand}`,
  };
}

/**
 * Allocates a virtual X11 display string (:101, :102, ...)
 */
/**
 * Allocates a virtual X11 display string (:101, :102, ... up to :1099)
 * Enforces P1-I bounds so tabs are strictly disjoint from :1100-:1199 user forks.
 */
export function allocateVirtualDisplay(
  existingTabs: { displayNum: number }[],
  startDisplay = MIN_TAB_DISPLAY,
  maxDisplay = MAX_TAB_DISPLAY
): { displayNum: number; displayStr: string } {
  const usedNumbers = new Set(existingTabs.map((t) => t.displayNum));
  let candidate = startDisplay;
  while (usedNumbers.has(candidate) && candidate <= maxDisplay) {
    candidate++;
  }
  if (candidate > maxDisplay) {
    throw new Error(`Tab display number range (:${MIN_TAB_DISPLAY}-:${maxDisplay}) exhausted`);
  }
  return {
    displayNum: candidate,
    displayStr: `:${candidate}`,
  };
}

/**
 * P1-M: Resolves capability token authoritatively.
 * When server returns null, stale tokens are revoked and cleared.
 */
export function resolveAuthoritativeToken(
  serverToken: string | null | undefined,
  currentClientToken: string | null
): string | null {
  if (serverToken === undefined) {
    return currentClientToken;
  }
  return serverToken || null;
}

/**
 * Calculates string similarity using token overlap and character bigrams.
 */
export function calculateSimilarityScore(query: string, candidate: string): number {
  const qClean = query.toLowerCase().trim();
  const cClean = candidate.toLowerCase().trim();

  if (!qClean || !cClean) return 0;
  if (qClean === cClean) return 1.0;
  if (cClean.includes(qClean) || qClean.includes(cClean)) return 0.85;

  const qWords = new Set(qClean.split(/[\s,.;:_$#/'"()\[\]{}]+/).filter((w) => w.length > 2));
  const cWords = new Set(cClean.split(/[\s,.;:_$#/'"()\[\]{}]+/).filter((w) => w.length > 2));

  if (qWords.size === 0 || cWords.size === 0) return 0.1;

  let intersection = 0;
  for (const word of qWords) {
    if (cWords.has(word)) {
      intersection++;
    }
  }

  const jaccard = intersection / (qWords.size + cWords.size - intersection);
  return Math.min(1.0, Math.max(0.0, jaccard));
}

/**
 * Finds the closest ledger node based on OCR line matches and inferred command similarity.
 */
export function findBestLedgerNodeBySimilarity(
  queryText: string,
  ledger: SyncLedgerNode[]
): { node: SyncLedgerNode; score: number } {
  if (!ledger || ledger.length === 0) {
    throw new Error('Ledger is empty');
  }

  let bestNode = ledger[0];
  let bestScore = -1;

  for (const node of ledger) {
    const combinedCandidate = `${node.inferredCmd} ${node.pixelOcrLines.join(' ')} ${node.spokenText} ${node.activeFile}`;
    const score = calculateSimilarityScore(queryText, combinedCandidate);
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  return { node: bestNode, score: Math.round(bestScore * 100) / 100 };
}

/**
 * Finds the active node at a given millisecond timestamp.
 */
export function findLedgerNodeAtTimestamp(timestampMs: number, ledger: SyncLedgerNode[]): SyncLedgerNode {
  if (!ledger.length) {
    throw new Error('Ledger is empty');
  }
  let target = ledger[0];
  for (const node of ledger) {
    if (node.timestampMs <= timestampMs) {
      target = node;
    } else {
      break;
    }
  }
  return target;
}

/**
 * Simulates bash shell command execution.
 */
export function executeSimulatedShellCommand(
  rawCmd: string,
  currentDir = '/app/v2e-sandbox',
  history: string[] = []
): { stdout: string[]; exitCode: number; newDir: string } {
  const trimmed = rawCmd.trim();
  if (!trimmed) {
    return { stdout: [], exitCode: 0, newDir: currentDir };
  }

  const parts = trimmed.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case 'ls':
    case 'dir':
      return {
        stdout: [
          'total 48',
          'drwxr-xr-x 4 root root 4096 Nov 01 13:29 .',
          'drwxr-xr-x 3 root root 4096 Nov 01 13:25 ..',
          '-rw-r--r-- 1 root root  532 Nov 01 13:28 app.py',
          '-rw-r--r-- 1 root root  312 Nov 01 13:27 demuxer.py',
          '-rw-r--r-- 1 root root  280 Nov 01 13:26 Dockerfile',
          '-rwxr-xr-x 1 root root  415 Nov 01 13:27 spawn_display.sh',
          '-rw-r--r-- 1 root root  890 Nov 01 13:28 test_bitemporal.py',
          'drwxr-xr-x 2 root root 4096 Nov 01 13:28 build/',
          '-rw-r--r-- 1 root root  128 Nov 01 13:29 requirements.txt',
        ],
        exitCode: 0,
        newDir: currentDir,
      };

    case 'pwd':
      return { stdout: [currentDir], exitCode: 0, newDir: currentDir };

    case 'whoami':
      return { stdout: ['v2e-developer (sandbox user 1000)'], exitCode: 0, newDir: currentDir };

    case 'uname':
      return {
        stdout: ['Linux v2e-display-pool 6.6.137-v2e-x86_64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'],
        exitCode: 0,
        newDir: currentDir,
      };

    case 'ps':
      return {
        stdout: [
          'PID   TTY      TIME     CMD',
          '1     ?        00:00:01 init_orchestrator',
          '104   ?        00:00:03 Xvfb :99 -screen 0 1024x768x24',
          '105   ?        00:00:00 openbox --display :99',
          '201   ?        00:00:02 xterm -T "V2E Subscreen Master"',
          '5109  pts/1    00:00:00 bash (current isolated sandbox)',
        ],
        exitCode: 0,
        newDir: currentDir,
      };

    case 'echo':
      return { stdout: [args.replace(/^['"]|['"]$/g, '')], exitCode: 0, newDir: currentDir };

    case 'python3':
    case 'python':
      if (args.includes('--version') || args.includes('-V')) {
        return { stdout: ['Python 3.12.3 (main, Apr 10 2024, 05:33:42) [GCC 13.2.0] on linux'], exitCode: 0, newDir: currentDir };
      }
      if (args.includes('-c')) {
        return {
          stdout: [
            'PyTorch 2.3.0+cu121 initialized.',
            'CUDA available: True (NVIDIA RTX A5000, Compute 8.6)',
            'Display pipeline connected via SHM buffer.'
          ],
          exitCode: 0,
          newDir: currentDir,
        };
      }
      return {
        stdout: [
          'Python 3.12.3 interactive session loaded.',
          'Type "help()", "copyright()", or "license()" for more information.',
          '>>> [Interactive eval complete: 0 warnings, 0 errors]'
        ],
        exitCode: 0,
        newDir: currentDir,
      };

    case 'cat':
      if (args.includes('app.py') || args.includes('demuxer.py')) {
        return {
          stdout: [
            '# V2E Spatial Demuxer & X11 Display Streamer',
            'import cv2, numpy as np, torch',
            'print("Streaming buffer on :101 to :110...")'
          ],
          exitCode: 0,
          newDir: currentDir,
        };
      }
      return { stdout: [`Contents of ${args || 'file'}: [File read successfully. 18 lines, 420 bytes]`], exitCode: 0, newDir: currentDir };

    case 'git':
      if (args.includes('status')) {
        return {
          stdout: [
            'On branch main',
            'Your branch is up to date with \'origin/main\'.',
            'Changes to be committed: none',
            'Untracked files: (sandbox_snapshot_101.raw)',
          ],
          exitCode: 0,
          newDir: currentDir,
        };
      }
      return { stdout: ['git version 2.43.0'], exitCode: 0, newDir: currentDir };

    case 'docker':
      return {
        stdout: [
          'REPOSITORY          TAG       IMAGE ID       CREATED         SIZE',
          'v2e-sandbox         v2        d3a95f7c11b0   2 minutes ago   388MB',
          'ubuntu              24.04     5930b2c1f5d2   3 weeks ago     77.8MB'
        ],
        exitCode: 0,
        newDir: currentDir,
      };

    case 'clear':
      return { stdout: ['__CLEAR__'], exitCode: 0, newDir: currentDir };

    case 'help':
      return {
        stdout: [
          'V2E Multi-Tab Virtual Shell v2.4 (Openbox/X11 Pipe)',
          'Available sandbox commands:',
          '  ls, pwd, whoami, uname, ps, echo, python3, cat, git, docker, clear, help',
          'Tip: Any command executed updates your terminal footprint for 1-click Speaker Resync!'
        ],
        exitCode: 0,
        newDir: currentDir,
      };

    default:
      return {
        stdout: [`${cmd}: command executed in virtual display buffer. [Exit 0]`],
        exitCode: 0,
        newDir: currentDir,
      };
  }
}

/**
 * V8 Item 1: Evaluates ledger access claims and immediately evicts any previously
 * issued capability tokens from both validCapTokens and userActiveTokens if the subscriber
 * has been downgraded or no longer passes the manifest/scope/tier gate.
 */
export interface SubscriberClaimsInput {
  userId: string;
  publisherId: string;
  tier: SubscriberTier;
  scope: string[];
  exp: number;
}

export function evaluateLedgerAccess(
  claims: SubscriberClaimsInput | null,
  manifest: PublisherManifest,
  clientCapToken: string | null,
  userActiveTokens: Map<string, string>,
  validCapTokens: Map<string, { token: string; userId: string; tier: string }>
): {
  canPopout: boolean;
  capToken: string | null;
  reason?: string;
  evicted: boolean;
} {
  if (!claims) {
    return { canPopout: false, capToken: null, reason: 'Anonymous viewer', evicted: false };
  }

  const userRank = TIER_RANK[claims.tier] ?? 0;
  const reqRank = TIER_RANK[manifest.min_subscriber_tier] ?? 1;
  let canPopout = false;
  let reason: string | undefined;

  if (userRank < reqRank) {
    reason = `Requires tier '${manifest.min_subscriber_tier}'`;
  } else if (!claims.scope.includes('popout')) {
    reason = "Token scope missing 'popout'";
  } else if (!manifest.allowMultiTabPopout) {
    reason = 'Publisher disabled pop-outs for this video';
  } else {
    canPopout = true;
  }

  let evicted = false;
  let capToken: string | null = null;

  if (!canPopout) {
    // Evict any cached token if user no longer qualifies (V8 roadmap item 1)
    const prev = userActiveTokens.get(claims.userId);
    if (prev) {
      validCapTokens.delete(prev);
      userActiveTokens.delete(claims.userId);
      evicted = true;
    }
    if (clientCapToken) {
      if (validCapTokens.has(clientCapToken)) {
        validCapTokens.delete(clientCapToken);
        evicted = true;
      }
    }
    capToken = null;
  } else {
    // If user qualifies, issue or rotate capability token
    if (clientCapToken && validCapTokens.has(clientCapToken)) {
      const existing = validCapTokens.get(clientCapToken)!;
      if (existing.userId === claims.userId && existing.tier === claims.tier) {
        capToken = clientCapToken;
      }
    }
    if (!capToken) {
      capToken = `v2e_cap_${claims.userId}_${claims.tier}_${Date.now()}`;
      validCapTokens.set(capToken, { token: capToken, userId: claims.userId, tier: claims.tier });
      userActiveTokens.set(claims.userId, capToken);
    }
  }

  return { canPopout, capToken, reason, evicted };
}

/**
 * V8 Item 2: Narrow xauth_lock scope simulation.
 * Per-sandbox .Xauthority files in /tmp/v2e_sandbox_{disp_num}/.Xauthority are isolated
 * and run outside the lock; only the merge into MASTER_XAUTH_PATH requires xauth_lock.
 */
export function simulateXauthPreparation(
  dispNum: number,
  masterKeyring: Set<string>,
  sandboxStore: Map<number, { xauthPath: string; cookie: string }>
): { perSandboxSuccess: boolean; masterLockedMergeSuccess: boolean } {
  const dispStr = `:${dispNum}`;
  const cookie = `cookie_${dispNum}_${Math.random().toString(16).slice(2, 10)}`;
  const xauthPath = `/tmp/v2e_sandbox_${dispNum}/.Xauthority`;

  // 1. Per-sandbox xauth runs OUTSIDE the lock
  sandboxStore.set(dispNum, { xauthPath, cookie });

  // 2. Only the merge into MASTER_XAUTH_PATH needs the lock
  masterKeyring.add(`${dispStr}:${cookie}`);

  return { perSandboxSuccess: true, masterLockedMergeSuccess: true };
}

/**
 * V8 Item 3: Trunk tmux session liveness check in /api/healthz.
 * Verifies X11 socket, manifest initialization, and trunk tmux session 'main' responsiveness.
 */
export interface TrunkHealthState {
  x11SocketExists: boolean;
  manifestInitialized: boolean;
  tmuxSessionAlive: boolean;
}

export function evaluateHealthz(state: TrunkHealthState): {
  statusCode: 200 | 503;
  healthy: boolean;
  message: string;
} {
  if (!state.x11SocketExists) {
    return { statusCode: 503, healthy: false, message: 'Xvfb :99 socket missing' };
  }
  if (!state.manifestInitialized) {
    return { statusCode: 503, healthy: false, message: 'Publisher manifest not loaded' };
  }
  if (!state.tmuxSessionAlive) {
    return { statusCode: 503, healthy: false, message: "Trunk tmux session 'main' not responding" };
  }
  return { statusCode: 200, healthy: true, message: 'Trunk :99 & tmux: HEALTHY' };
}

