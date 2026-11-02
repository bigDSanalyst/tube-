export type ComponentType = 'FULL_WORKSPACE' | 'IDE_EDITOR' | 'TERMINAL' | 'VIEWPORT_PREVIEW';

export type SubscriberTier = 'free' | 'paid' | 'premium';

export interface PublisherManifest {
  videoId: string;
  videoTitle: string;
  publisherName: string;
  publisherId?: string;
  manifestSignature: string;
  signedAt?: number;
  min_subscriber_tier: SubscriberTier;
  allowSubscreenFork: boolean;
  allowMultiTabPopout: boolean;
  maxConcurrentTabs: number;
  max_tabs_per_subscriber?: number;
  max_concurrent_forks?: number;
  allowedComponents: ComponentType[];
  allowFullShellControl: boolean;
  sandboxExpiryMinutes: number;
}

export interface SubscriberClaims {
  userId: string;
  publisherId: string;
  tier: SubscriberTier;
  scope: string[];
  exp: number;
}

export interface CapabilityToken {
  token: string;
  userId: string;
  tier: SubscriberTier;
  issuedAt: number;
}

export interface SubComponentROI {
  componentId: ComponentType;
  label: string;
  description: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  displayHint: string;
}

export interface ViewportConfig {
  meshType: 'torus' | 'cube' | 'sphere' | 'neural_graph';
  wireframe: boolean;
  rotationSpeed: number;
  primaryColor: string;
  particleDensity: number;
}

export interface SyncLedgerNode {
  nodeId: number;
  timestampMs: number;
  frameIdx: number;
  spokenText: string;
  pixelOcrLines: string[];
  inferredCmd: string;
  activeFile: string;
  codeSnippet: string;
  viewportConfig: ViewportConfig;
}

export interface SpawnedTabSession {
  tabId: string;
  displayNum: number;
  displayStr: string; // e.g. ":101"
  componentType: ComponentType;
  forkedFromMs: number;
  initialCmd: string;
  codeContent: string;
  terminalHistory: string[];
  viewportConfig: ViewportConfig;
  createdAt: number;
  lastTouched?: number;
  processStatus: 'RUNNING' | 'PAUSED' | 'TERMINATED';
  pid: number;
  displayEpoch?: number;
  xauthPath?: string;
  homeDir?: string;
  ownerUserId?: string;
}

export interface PointerEventRequest {
  px: number;
  py: number;
  videoWidth: number;
  videoHeight: number;
  currentSpeakerMs: number;
  targetDisplay?: string;
}

export type BroadcastMessage =
  | { type: 'SEEK_MAIN_SPEAKER'; ms: number }
  | { type: 'TAB_SPAWNED'; session: SpawnedTabSession }
  | { type: 'TAB_CLOSED'; tabId: string }
  | { type: 'POLICY_UPDATED'; manifest: PublisherManifest }
  | { type: 'HEARTBEAT'; tabId: string }
  | { type: 'TOUCH_TAB'; tabId: string };
