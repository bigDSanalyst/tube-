import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MANIFEST,
  DEFAULT_LEDGER_NODES,
  verifyPublisherPolicy,
  allocateVirtualDisplay,
  calculateSimilarityScore,
  findBestLedgerNodeBySimilarity,
  findLedgerNodeAtTimestamp,
  executeSimulatedShellCommand,
  resolveAuthoritativeToken,
  evaluateLedgerAccess,
  simulateXauthPreparation,
  evaluateHealthz,
  MAX_TAB_DISPLAY,
} from './bitemporalLogic';

test('Publisher Policy: allows standard operations under default policy', () => {
  const check = verifyPublisherPolicy(DEFAULT_MANIFEST, 'IDE_EDITOR', 1, 'paid', 0);
  assert.equal(check.allowed, true);
  assert.equal(check.reason, undefined);
});

test('Publisher Policy: blocks free tier when min_subscriber_tier is paid', () => {
  const check = verifyPublisherPolicy(DEFAULT_MANIFEST, 'IDE_EDITOR', 0, 'free', 0);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Subscriber Tier Restricted/);
});

test('Publisher Policy: blocks user exceeding max_tabs_per_subscriber', () => {
  const check = verifyPublisherPolicy(DEFAULT_MANIFEST, 'IDE_EDITOR', 1, 'paid', 2);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Subscriber Quota Exceeded/);
});

test('Publisher Policy: blocks subscreen interaction when allowSubscreenFork is false', () => {
  const restrictedManifest = { ...DEFAULT_MANIFEST, allowSubscreenFork: false };
  const check = verifyPublisherPolicy(restrictedManifest, 'IDE_EDITOR', 0);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Subscreen Interactive Forking is disabled/);
});

test('Publisher Policy: blocks popout when allowMultiTabPopout is false', () => {
  const noPopoutManifest = { ...DEFAULT_MANIFEST, allowMultiTabPopout: false };
  const check = verifyPublisherPolicy(noPopoutManifest, 'TERMINAL', 0);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Multi-Tab Component Pop-Out is disabled/);
});

test('Publisher Policy: blocks creation exceeding maxConcurrentTabs', () => {
  const smallQuotaManifest = { ...DEFAULT_MANIFEST, maxConcurrentTabs: 2 };
  const check = verifyPublisherPolicy(smallQuotaManifest, 'TERMINAL', 2);
  assert.equal(check.allowed, false);
  assert.match(check.reason || '', /Publisher Quota Exceeded/);
});

test('Publisher Policy: enforces allowedComponents white-list', () => {
  const restrictedManifest = {
    ...DEFAULT_MANIFEST,
    allowedComponents: ['IDE_EDITOR', 'TERMINAL'] as any,
  };
  const checkViewport = verifyPublisherPolicy(restrictedManifest, 'VIEWPORT_PREVIEW', 0);
  assert.equal(checkViewport.allowed, false);
  assert.match(checkViewport.reason || '', /Component 'VIEWPORT_PREVIEW' has been locked/);
});

test('Virtual Display Allocator: allocates sequential :101, :102 without collisions', () => {
  const initial = allocateVirtualDisplay([]);
  assert.equal(initial.displayNum, 101);
  assert.equal(initial.displayStr, ':101');

  const next = allocateVirtualDisplay([{ displayNum: 101 }, { displayNum: 102 }]);
  assert.equal(next.displayNum, 103);
  assert.equal(next.displayStr, ':103');
});

test('Similarity Score: detects matching tokens and keywords', () => {
  const score1 = calculateSimilarityScore('python3 torch cuda', 'python3 -c import torch; cuda');
  assert.ok(score1 > 0.4);

  const exact = calculateSimilarityScore('docker build', 'docker build');
  assert.equal(exact, 1.0);
});

test('Resync Matching: finds closest ledger node for docker command', () => {
  const match = findBestLedgerNodeBySimilarity('docker build -t v2e-sandbox:v2', DEFAULT_LEDGER_NODES);
  assert.equal(match.node.nodeId, 2);
  assert.equal(match.node.timestampMs, 14000);
  assert.ok(match.score > 0.3);
});

test('Timestamp Seek: retrieves appropriate node for video timeline', () => {
  const nodeAtStart = findLedgerNodeAtTimestamp(0, DEFAULT_LEDGER_NODES);
  assert.equal(nodeAtStart.nodeId, 0);

  const nodeAt25s = findLedgerNodeAtTimestamp(25000, DEFAULT_LEDGER_NODES);
  assert.equal(nodeAt25s.nodeId, 3);
  assert.equal(nodeAt25s.timestampMs, 23500);
});

test('Shell Emulator: executes ls, ps, python commands and handles clear', () => {
  const resLs = executeSimulatedShellCommand('ls');
  assert.equal(resLs.exitCode, 0);
  assert.ok(resLs.stdout.length > 2);

  const resClear = executeSimulatedShellCommand('clear');
  assert.deepEqual(resClear.stdout, ['__CLEAR__']);

  const resEcho = executeSimulatedShellCommand('echo "Hello World"');
  assert.deepEqual(resEcho.stdout, ['Hello World']);
});

test('Virtual Display Allocator: rejects allocation beyond MAX_TAB_DISPLAY (P1-I)', () => {
  assert.throws(
    () => {
      allocateVirtualDisplay([], MAX_TAB_DISPLAY + 1, MAX_TAB_DISPLAY);
    },
    /exhausted/
  );
});

test('Token Resolver: enforces authoritative server response and clears stale tokens (P1-M)', () => {
  // Stale client token present, but server returns null -> must clear to null
  const cleared = resolveAuthoritativeToken(null, 'stale_token_123');
  assert.equal(cleared, null);

  // Server returns new valid token -> must adopt new token
  const updated = resolveAuthoritativeToken('fresh_token_456', 'stale_token_123');
  assert.equal(updated, 'fresh_token_456');

  // Server omitted field (undefined) -> retains local
  const retained = resolveAuthoritativeToken(undefined, 'current_token');
  assert.equal(retained, 'current_token');
});

test('V8 Item 1: Evicts stale capability token on tier downgrade or scope loss', () => {
  const userActiveTokens = new Map<string, string>();
  const validCapTokens = new Map<string, { token: string; userId: string; tier: string }>();

  // 1. Initial valid paid subscriber
  const userA = {
    userId: 'user_42',
    publisherId: 'publisher_alpha',
    tier: 'paid' as const,
    scope: ['popout', 'fork'],
    exp: 1800000000,
  };

  const initialRes = evaluateLedgerAccess(userA, DEFAULT_MANIFEST, null, userActiveTokens, validCapTokens);
  assert.equal(initialRes.canPopout, true);
  assert.equal(initialRes.evicted, false);
  assert.ok(initialRes.capToken);
  const issuedToken = initialRes.capToken!;
  assert.equal(userActiveTokens.get('user_42'), issuedToken);
  assert.equal(validCapTokens.has(issuedToken), true);

  // 2. Subscriber is downgraded to 'free' tier -> must evict cached token from both maps
  const downgradedUser = { ...userA, tier: 'free' as const };
  const downgradeRes = evaluateLedgerAccess(downgradedUser, DEFAULT_MANIFEST, issuedToken, userActiveTokens, validCapTokens);
  assert.equal(downgradeRes.canPopout, false);
  assert.equal(downgradeRes.evicted, true);
  assert.equal(downgradeRes.capToken, null);
  assert.equal(userActiveTokens.has('user_42'), false);
  assert.equal(validCapTokens.has(issuedToken), false);

  // 3. User loses 'popout' scope -> evict token
  const noPopoutUser = { ...userA, scope: ['view_only'] };
  userActiveTokens.set('user_42', 'some_token');
  validCapTokens.set('some_token', { token: 'some_token', userId: 'user_42', tier: 'paid' });

  const scopeLossRes = evaluateLedgerAccess(noPopoutUser, DEFAULT_MANIFEST, 'some_token', userActiveTokens, validCapTokens);
  assert.equal(scopeLossRes.canPopout, false);
  assert.equal(scopeLossRes.evicted, true);
  assert.equal(userActiveTokens.has('user_42'), false);
  assert.equal(validCapTokens.has('some_token'), false);
});

test('V8 Item 2: Narrow xauth_lock scope allows isolated per-sandbox xauth generation', () => {
  const masterKeyring = new Set<string>();
  const sandboxStore = new Map<number, { xauthPath: string; cookie: string }>();

  const res1 = simulateXauthPreparation(101, masterKeyring, sandboxStore);
  assert.equal(res1.perSandboxSuccess, true);
  assert.equal(res1.masterLockedMergeSuccess, true);
  assert.equal(sandboxStore.has(101), true);
  assert.equal(masterKeyring.size, 1);

  const res2 = simulateXauthPreparation(102, masterKeyring, sandboxStore);
  assert.equal(res2.perSandboxSuccess, true);
  assert.equal(sandboxStore.has(102), true);
  assert.equal(masterKeyring.size, 2);
});

test('V8 Item 3: Trunk tmux liveness verification in /api/healthz', () => {
  // All healthy
  const healthy = evaluateHealthz({
    x11SocketExists: true,
    manifestInitialized: true,
    tmuxSessionAlive: true,
  });
  assert.equal(healthy.statusCode, 200);
  assert.equal(healthy.healthy, true);
  assert.match(healthy.message, /HEALTHY/);

  // Tmux session dead
  const deadTmux = evaluateHealthz({
    x11SocketExists: true,
    manifestInitialized: true,
    tmuxSessionAlive: false,
  });
  assert.equal(deadTmux.statusCode, 503);
  assert.equal(deadTmux.healthy, false);
  assert.match(deadTmux.message, /Trunk tmux session 'main' not responding/);

  // Missing X11 socket
  const deadX11 = evaluateHealthz({
    x11SocketExists: false,
    manifestInitialized: true,
    tmuxSessionAlive: true,
  });
  assert.equal(deadX11.statusCode, 503);
  assert.equal(deadX11.healthy, false);
});


