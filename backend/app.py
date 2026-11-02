import asyncio
import base64
import difflib
import heapq
import json
import os
import re
import secrets
import shutil
import stat
import subprocess
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Deque, Dict, List, Optional, Set, Tuple

import cv2
import jwt
import mss
import numpy as np
import pytesseract
from cachetools import TTLCache
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from jwt import PyJWTError
from pydantic import BaseModel, Field

from module_cache import LinkedModule, VerifiedModuleCache

VIDEO_PATH = "/app/videos/demo.mp4"
LEDGER_CACHE_PATH = "/app/videos/demo.mp4.ledger.json"
MASTER_XAUTH_PATH = "/app/.v2e_master_xauth"
TRUNK_XAUTH_PATH = "/tmp/v2e_trunk_home/.Xauthority"
TRUNK_HOME_DIR = "/tmp/v2e_trunk_home"

DISPLAY_REGEX = re.compile(r"^:(99|[1-9]\d{2,3})$")
MIN_TAB_DISPLAY = 101
MAX_TAB_DISPLAY = 1099
USER_FORK_BASE = 1100
USER_FORK_MAX = 1199
TRUNK_UID = 65534

BEACON_GRACE_SECONDS = float(os.environ.get("V2E_BEACON_GRACE_SEC", "6.0"))
XVFB_READY_TIMEOUT_SEC = float(os.environ.get("V2E_XVFB_READY_TIMEOUT_SEC", "5.0"))

os.environ["XAUTHORITY"] = MASTER_XAUTH_PATH

_capture_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="x11_shm")
_ocr_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ocr")
_tls = threading.local()

TIER_RANK = {"free": 0, "paid": 1, "premium": 2}

@dataclass
class PublisherManifest:
    video_id: str
    publisher_id: str
    signed_at: int
    min_subscriber_tier: str = "paid"
    max_concurrent_tabs: int = 6
    max_tabs_per_subscriber: int = 2
    max_concurrent_forks: int = 50
    allow_subscreen_fork: bool = True
    allow_multi_tab_popout: bool = True
    allowed_components: Optional[List[str]] = None
    linked_modules: Optional[List[LinkedModule]] = None

    def __post_init__(self):
        if self.allowed_components is None:
            self.allowed_components = ["FULL_WORKSPACE", "IDE_EDITOR", "TERMINAL", "VIEWPORT_PREVIEW"]
        if self.linked_modules is None:
            self.linked_modules = []
        else:
            normalized: List[LinkedModule] = []
            for item in self.linked_modules:
                mod = item if isinstance(item, LinkedModule) else LinkedModule(**item)
                mod.validate_schema()
                normalized.append(mod)
            self.linked_modules = normalized

@dataclass
class SubscriberClaims:
    user_id: str
    publisher_id: str
    tier: str
    scope: List[str]
    exp: int

@dataclass
class CapabilityToken:
    token: str
    user_id: str
    tier: str
    issued_at: float

@dataclass
class SubComponentROI:
    component_id: str
    label: str
    bbox: Tuple[int, int, int, int]
    target_win_geom: Tuple[int, int, int, int]

@dataclass
class SyncLedgerNode:
    node_id: int
    timestamp_ms: int
    frame_idx: int
    spoken_text: str
    pixel_ocr_lines: List[str]
    inferred_cmd: str

@dataclass
class UserWorkspace:
    user_id: str
    tier: str = "free"
    speaker_playing: bool = True
    workspace_forked: bool = False
    forked_at_ms: int = 0
    user_cmd_history: Deque[str] = field(default_factory=lambda: deque(maxlen=50))
    fork_display: Optional[str] = None
    fork_tmux_socket: Optional[str] = None
    fork_xauth_path: Optional[str] = None
    fork_home_dir: Optional[str] = None
    fork_xvfb_proc: Optional[subprocess.Popen] = None
    fork_wm_proc: Optional[subprocess.Popen] = None
    fork_app_proc: Optional[subprocess.Popen] = None
    last_touched: float = 0.0

@dataclass
class SpawnedTabSession:
    tab_id: str
    owner_user_id: str
    display_num: int
    display_str: str
    tmux_socket: str
    xauth_path: str
    home_dir: str
    component_type: str
    replay_from_ms: int
    cloned_scrollback_lines: int
    module_id: Optional[str]
    created_at: float
    last_touched: float
    xvfb_proc: Optional[subprocess.Popen] = None
    wm_proc: Optional[subprocess.Popen] = None
    app_proc: Optional[subprocess.Popen] = None

class PointerEventRequest(BaseModel):
    px: int
    py: int
    video_width: int = Field(default=1280, ge=1)
    video_height: int = Field(default=720, ge=1)
    current_speaker_ms: int = Field(default=0, ge=0)
    target_display: Optional[str] = None

class KeyEventRequest(BaseModel):
    key_text: str = Field(..., max_length=512)
    target_display: Optional[str] = None

class ResyncRequest(BaseModel):
    direction: str
    speaker_ms: int = Field(default=0, ge=0)
    user_terminal_text: Optional[str] = ""
    target_display: Optional[str] = None

class SpawnTabRequest(BaseModel):
    component_type: str = "FULL_WORKSPACE"
    replay_from_ms: int = Field(default=0, ge=0)
    clone_live_fork_state: bool = True
    module_id: Optional[str] = None

class HardenedBitemporalEngine:
    def __init__(self):
        self.display_trunk = ":99"
        self.sandbox_w = 1024
        self.sandbox_h = 768
        self.manifest: Optional[PublisherManifest] = None
        self.module_cache: VerifiedModuleCache = VerifiedModuleCache()
        self.speaker_roi = (980, 480, 260, 200)
        self.workspace_roi = (40, 40, 920, 600)
        self.sub_components: Dict[str, SubComponentROI] = {
            "FULL_WORKSPACE":   SubComponentROI("FULL_WORKSPACE", "Full Subscreen", (40, 40, 920, 600), (0, 0, 1024, 768)),
            "IDE_EDITOR":       SubComponentROI("IDE_EDITOR", "Code Editor",     (40, 40, 600, 400), (0, 0, 1024, 620)),
            "TERMINAL":         SubComponentROI("TERMINAL", "Bash Terminal",     (40, 450, 920, 190), (0, 120, 1024, 648)),
            "VIEWPORT_PREVIEW": SubComponentROI("VIEWPORT_PREVIEW", "Live Output", (650, 40, 310, 400), (64, 32, 896, 704)),
        }
        self.ledger: List[SyncLedgerNode] = []
        self.tab_lock = asyncio.Lock()
        self.workspace_lock = asyncio.Lock()
        self.xauth_lock = threading.Lock()
        self.active_tabs: Dict[str, SpawnedTabSession] = {}
        self.workspaces: Dict[str, UserWorkspace] = {}
        self.display_xauth: Dict[str, str] = {":99": TRUNK_XAUTH_PATH}
        self.display_home: Dict[str, str] = {":99": TRUNK_HOME_DIR}
        self.display_epoch: Dict[str, int] = {":99": 1}
        self._epoch_counter: int = 1
        self.free_display_heap: List[int] = []
        self.next_display_num: int = MIN_TAB_DISPLAY
        self.user_fork_displays_in_use: Set[int] = set()
        self.tab_ttl_seconds: float = 900.0
        self.workspace_ttl_seconds: float = 1800.0
        self.valid_cap_tokens: TTLCache = TTLCache(maxsize=10_000, ttl=3600)
        self.user_active_token: Dict[str, str] = {}
        self.ws_tickets: TTLCache = TTLCache(maxsize=4_000, ttl=60)
        self.sse_subscribers: Dict[asyncio.Queue, Optional[str]] = {}
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None

    def issue_or_rotate_capability_token(self, claims: SubscriberClaims, existing_token: Optional[str] = None) -> str:
        if existing_token and existing_token in self.valid_cap_tokens:
            cap = self.valid_cap_tokens[existing_token]
            if cap.user_id == claims.user_id and cap.tier == claims.tier:
                return existing_token
        prev = self.user_active_token.get(claims.user_id)
        if prev:
            self.valid_cap_tokens.pop(prev, None)
        token = secrets.token_urlsafe(32)
        self.valid_cap_tokens[token] = CapabilityToken(
            token=token, user_id=claims.user_id, tier=claims.tier, issued_at=time.time(),
        )
        self.user_active_token[claims.user_id] = token
        return token

    def resolve_cap_token(self, token: Optional[str]) -> CapabilityToken:
        if not token or token not in self.valid_cap_tokens:
            raise HTTPException(401, "Invalid or expired capability token")
        return self.valid_cap_tokens[token]

    def issue_ws_ticket(self, user_id: str) -> str:
        ticket = secrets.token_urlsafe(32)
        self.ws_tickets[ticket] = {"user_id": user_id}
        return ticket

    def validate_display(self, display: Optional[str]) -> str:
        target = display or self.display_trunk
        if not DISPLAY_REGEX.fullmatch(target):
            raise HTTPException(400, f"Invalid X11 display: {target}")
        return target

    def _assert_display_ownership(self, disp: str, user_id: Optional[str]) -> None:
        if disp == self.display_trunk:
            return
        for tab in self.active_tabs.values():
            if tab.display_str == disp:
                if user_id is None or tab.owner_user_id != user_id:
                    raise HTTPException(403, "Sandbox belongs to another subscriber")
                return
        for ws in self.workspaces.values():
            if ws.fork_display == disp:
                if user_id is None or ws.user_id != user_id:
                    raise HTTPException(403, "Fork belongs to another subscriber")
                return
        raise HTTPException(404, "No active sandbox on this display")

    def serialize_linked_modules(self) -> List[Dict[str, object]]:
        if not self.manifest or not self.manifest.linked_modules:
            return []
        out: List[Dict[str, object]] = []
        for m in self.manifest.linked_modules:
            d = asdict(m)
            d["available"] = m.module_id in self.module_cache.verified_modules
            d["disabled_reason"] = self.module_cache.refused_modules.get(m.module_id)
            out.append(d)
        return out

    def notify_sse_subscribers(self):
        if not self.manifest or not self._main_loop or not self._main_loop.is_running():
            return
        manifest_dict = asdict(self.manifest)
        linked_mods = self.serialize_linked_modules()

        def _deliver():
            for q, user_id in list(self.sse_subscribers.items()):
                user_tabs = [
                    {
                        "tab_id": t.tab_id, "component_type": t.component_type, "display_str": t.display_str,
                        "cloned_scrollback_lines": t.cloned_scrollback_lines, "module_id": t.module_id,
                    }
                    for t in self.active_tabs.values()
                    if user_id is not None and t.owner_user_id == user_id
                ]
                ws_obj = self.workspaces.get(user_id) if user_id else None
                payload = json.dumps({
                    "manifest": manifest_dict, "linked_modules": linked_mods, "active_tabs": user_tabs,
                    "workspace_forked": bool(ws_obj and ws_obj.workspace_forked),
                    "speaker_playing": bool(ws_obj.speaker_playing) if ws_obj else True,
                    "fork_display": ws_obj.fork_display if ws_obj else None,
                })
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    pass
        try:
            self._main_loop.call_soon_threadsafe(_deliver)
        except RuntimeError:
            pass

    def load_or_build_transcript(self, video_path: str) -> List[SyncLedgerNode]:
        if os.path.exists(LEDGER_CACHE_PATH):
            try:
                with open(LEDGER_CACHE_PATH, "r", encoding="utf-8") as f:
                    self.ledger = [SyncLedgerNode(**item) for item in json.load(f)]
                return self.ledger
            except Exception:
                pass
        if not os.path.exists(video_path):
            return []
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        prev_gray, nodes, frame_idx, node_counter = None, [], 0, 0
        synthetic = [
            ("Initializing workspace environment and listing files", "echo 'Init Workspace' && ls -la"),
            ("Checking Python runtime version and active processes", "python3 --version && ps aux"),
            ("Compiling module and verifying build artifacts", "echo 'Build Passed [OK]' && date"),
            ("Running test suite inside isolated container", "uname -a && uptime"),
        ]
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % 15 == 0:
                ts_ms = int((frame_idx / fps) * 1000.0)
                wx, wy, ww, wh = self.workspace_roi
                gray = cv2.cvtColor(frame[wy:wy + wh, wx:wx + ww], cv2.COLOR_BGR2GRAY)
                ocr_lines: List[str] = []
                if prev_gray is None or np.mean(cv2.absdiff(gray, prev_gray)) > 2.0:
                    prev_gray = gray
                    try:
                        raw = pytesseract.image_to_string(gray).strip()
                        ocr_lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
                    except Exception:
                        ocr_lines = []
                spoken, cmd = synthetic[node_counter % len(synthetic)]
                if not ocr_lines:
                    ocr_lines = [cmd, f"frame_{frame_idx}_state"]
                nodes.append(SyncLedgerNode(
                    node_id=node_counter, timestamp_ms=ts_ms, frame_idx=frame_idx,
                    spoken_text=spoken, pixel_ocr_lines=ocr_lines, inferred_cmd=cmd,
                ))
                node_counter += 1
            frame_idx += 1
        cap.release()
        self.ledger = nodes
        try:
            with open(LEDGER_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump([asdict(n) for n in nodes], f)
        except Exception:
            pass
        return nodes

    @staticmethod
    def _sandbox_ids(disp_num: int) -> Tuple[int, int]:
        if disp_num == 99:
            return TRUNK_UID, TRUNK_UID
        uid = 10000 + disp_num
        return uid, uid

    def _sandbox_user_kwargs(self, disp_num: int) -> dict:
        uid, gid = self._sandbox_ids(disp_num)
        return {"user": uid, "group": gid, "extra_groups": []}

    def _prepare_sandbox_dir_sync(self, disp_num: int) -> Tuple[str, str, str]:
        uid, gid = self._sandbox_ids(disp_num)
        disp_str = f":{disp_num}"
        home = f"/tmp/v2e_sandbox_{disp_num}"
        shutil.rmtree(home, ignore_errors=True)
        os.makedirs(home, mode=0o700, exist_ok=True)
        os.chown(home, uid, gid)

        socket_path = os.path.join(home, "tmux.sock")
        xauth_path = os.path.join(home, ".Xauthority")
        cookie = secrets.token_hex(16)

        subprocess.run(
            ["xauth", "-f", xauth_path, "add", disp_str, ".", cookie],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if os.path.exists(xauth_path):
            os.chmod(xauth_path, 0o600)
            os.chown(xauth_path, uid, gid)

        with self.xauth_lock:
            subprocess.run(
                ["xauth", "-f", MASTER_XAUTH_PATH, "add", disp_str, ".", cookie],
                check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            if os.path.exists(MASTER_XAUTH_PATH):
                os.chmod(MASTER_XAUTH_PATH, 0o600)

        self._epoch_counter += 1
        self.display_epoch[disp_str] = self._epoch_counter
        self.display_xauth[disp_str] = xauth_path
        self.display_home[disp_str] = home
        return home, socket_path, xauth_path

    async def _prepare_sandbox_dir(self, disp_num: int) -> Tuple[str, str, str]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._prepare_sandbox_dir_sync, disp_num)

    def _cleanup_sandbox_xauth_sync(self, disp_str: str, home_dir: Optional[str]):
        self.display_epoch.pop(disp_str, None)
        self.display_xauth.pop(disp_str, None)
        self.display_home.pop(disp_str, None)
        with self.xauth_lock:
            subprocess.run(
                ["xauth", "-f", MASTER_XAUTH_PATH, "remove", disp_str],
                check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        if home_dir:
            shutil.rmtree(home_dir, ignore_errors=True)

    async def _cleanup_sandbox_xauth(self, disp_str: str, home_dir: Optional[str]):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._cleanup_sandbox_xauth_sync, disp_str, home_dir)

    def _sandbox_env(self, display: str, home: str, xauth_path: str) -> dict:
        allow = {"LANG"}
        base = {k: os.environ[k] for k in allow if k in os.environ}
        base.update({
            "DISPLAY": display, "HOME": home, "XAUTHORITY": xauth_path, "USER": "sandbox",
            "TERM": "xterm-256color", "PATH": "/usr/local/bin:/usr/bin:/bin", "TMPDIR": home,
        })
        return base

    async def _wait_x11_socket(self, disp_num: int, xvfb_proc: subprocess.Popen, timeout: float = XVFB_READY_TIMEOUT_SEC):
        sock_path = f"/tmp/.X11-unix/X{disp_num}"
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if xvfb_proc.poll() is not None:
                raise HTTPException(500, f"Xvfb :{disp_num} exited prematurely")
            try:
                st = os.stat(sock_path)
                if stat.S_ISSOCK(st.st_mode):
                    return
            except FileNotFoundError:
                pass
            await asyncio.sleep(0.02)
        raise HTTPException(500, f"Timed out waiting for Xvfb socket {sock_path}")

    def _run_x11_argv(self, display: str, argv: List[str]) -> str:
        disp = self.validate_display(display)
        disp_num = int(disp.split(":")[1])
        home = self.display_home.get(disp, TRUNK_HOME_DIR)
        xauth = self.display_xauth.get(disp, TRUNK_XAUTH_PATH)
        env = self._sandbox_env(disp, home, xauth)
        user_kw = self._sandbox_user_kwargs(disp_num)
        res = subprocess.run(
            argv, env=env, check=False, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **user_kw,
        )
        return res.stdout.strip()

    def _capture_tmux_scrollback(self, socket_path: str, disp_num: int = 99) -> str:
        disp_str = f":{disp_num}"
        home = self.display_home.get(disp_str, TRUNK_HOME_DIR)
        xauth = self.display_xauth.get(disp_str, TRUNK_XAUTH_PATH)
        env = self._sandbox_env(disp_str, home, xauth)
        user_kw = self._sandbox_user_kwargs(disp_num)
        res = subprocess.run(
            ["tmux", "-S", socket_path, "capture-pane", "-p", "-S", "-120"],
            env=env, check=False, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, **user_kw,
        )
        return res.stdout if res.returncode == 0 else ""

    def _get_workspace(self, user_id: str, tier: str = "free") -> UserWorkspace:
        ws = self.workspaces.get(user_id)
        if not ws:
            ws = UserWorkspace(user_id=user_id, tier=tier)
            self.workspaces[user_id] = ws
        ws.last_touched = time.time()
        return ws

    async def _ensure_user_fork(self, cap: CapabilityToken, fork_ms: int) -> UserWorkspace:
        async with self.workspace_lock:
            ws = self.workspaces.get(cap.user_id)
            if ws and ws.fork_display:
                ws.last_touched = time.time()
                return ws

            active_forks = sum(1 for w in self.workspaces.values() if w.fork_display)
            if active_forks >= (self.manifest.max_concurrent_forks or 50):
                raise HTTPException(503, "User fork pool exhausted — try again shortly")

            disp_num = USER_FORK_BASE
            while disp_num in self.user_fork_displays_in_use and disp_num <= USER_FORK_MAX:
                disp_num += 1
            if disp_num > USER_FORK_MAX:
                raise HTTPException(503, "User fork display range exhausted")
            self.user_fork_displays_in_use.add(disp_num)
            disp_str = f":{disp_num}"

            home = f"/tmp/v2e_sandbox_{disp_num}"
            xvfb: Optional[subprocess.Popen] = None
            wm: Optional[subprocess.Popen] = None
            app: Optional[subprocess.Popen] = None

            try:
                home, socket_path, xauth_path = await self._prepare_sandbox_dir(disp_num)
                env = self._sandbox_env(disp_str, home, xauth_path)
                user_kw = self._sandbox_user_kwargs(disp_num)

                xvfb = subprocess.Popen(
                    ["Xvfb", disp_str, "-screen", "0", f"{self.sandbox_w}x{self.sandbox_h}x24",
                     "-auth", xauth_path, "-nolisten", "tcp", "+extension", "GLX", "-noreset"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )
                await self._wait_x11_socket(disp_num, xvfb)

                wm = subprocess.Popen(["openbox"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
                await asyncio.sleep(0.1)

                subprocess.run(
                    ["tmux", "-S", socket_path, "new-session", "-d", "-s", "main", "-x", "120", "-y", "36"],
                    env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )

                trunk_socket = f"/tmp/tmux-{TRUNK_UID}/v2e_trunk"
                captured = self._capture_tmux_scrollback(trunk_socket, disp_num=99)
                scrollback_lines = [ln for ln in captured.splitlines() if ln.strip()]

                replay_cmd = "echo 'Workspace Ready'"
                for node in self.ledger:
                    if node.timestamp_ms <= fork_ms:
                        replay_cmd = node.inferred_cmd
                    else:
                        break

                def send(text: str):
                    subprocess.run(["tmux", "-S", socket_path, "send-keys", "-t", "main", "-l", text],
                                   env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
                    subprocess.run(["tmux", "-S", socket_path, "send-keys", "-t", "main", "Enter"],
                                   env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)

                send(f"# === FORK {disp_str} @ {fork_ms}ms — {len(scrollback_lines)} lines cloned ===")
                send(replay_cmd)

                win_title = f"V2E_FORK_{disp_num}"
                app = subprocess.Popen(
                    ["xterm", "-geometry", "120x36+0+0", "-bg", "#0b0f17", "-fg", "#3fb950",
                     "-T", win_title, "-e", "tmux", "-S", socket_path, "attach-session", "-t", "main"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )
                await asyncio.sleep(0.15)

                win_ids = self._run_x11_argv(disp_str, ["xdotool", "search", "--name", f"^{re.escape(win_title)}$"]).splitlines()
                if win_ids:
                    wid = win_ids[0].strip()
                    self._run_x11_argv(disp_str, ["xdotool", "windowmove", wid, "0", "0"])
                    self._run_x11_argv(disp_str, ["xdotool", "windowsize", wid, "1024", "768"])

                ws = self.workspaces.get(cap.user_id) or UserWorkspace(user_id=cap.user_id, tier=cap.tier)
                ws.tier = cap.tier
                ws.fork_display = disp_str
                ws.fork_tmux_socket = socket_path
                ws.fork_xauth_path = xauth_path
                ws.fork_home_dir = home
                ws.fork_xvfb_proc = xvfb
                ws.fork_wm_proc = wm
                ws.fork_app_proc = app
                ws.workspace_forked = True
                ws.forked_at_ms = fork_ms
                ws.last_touched = time.time()
                self.workspaces[cap.user_id] = ws
                self.notify_sse_subscribers()
                return ws
            except Exception:
                await self._terminate_proc(app)
                await self._terminate_proc(wm)
                await self._terminate_proc(xvfb)
                await self._cleanup_sandbox_xauth(disp_str, home)
                self.user_fork_displays_in_use.discard(disp_num)
                raise

    async def spawn_detached_tab_sandbox(self, req: SpawnTabRequest, cap: CapabilityToken) -> SpawnedTabSession:
        async with self.tab_lock:
            if TIER_RANK[cap.tier] < TIER_RANK[self.manifest.min_subscriber_tier]:
                raise HTTPException(403, f"Requires tier '{self.manifest.min_subscriber_tier}' or higher")
            if not self.manifest.allow_subscreen_fork or not self.manifest.allow_multi_tab_popout:
                raise HTTPException(403, "Publisher has disabled pop-out tabs")
            user_tabs = sum(1 for t in self.active_tabs.values() if t.owner_user_id == cap.user_id)
            if user_tabs >= self.manifest.max_tabs_per_subscriber:
                raise HTTPException(429, f"Per-subscriber tab limit ({self.manifest.max_tabs_per_subscriber}) reached")
            if len(self.active_tabs) >= self.manifest.max_concurrent_tabs:
                raise HTTPException(429, "Global tab pool exhausted")
            if req.component_type not in (self.manifest.allowed_components or []):
                raise HTTPException(403, f"Component '{req.component_type}' restricted")

            if req.module_id is not None:
                if req.module_id in self.module_cache.refused_modules:
                    reason = self.module_cache.refused_modules[req.module_id]
                    raise HTTPException(403, f"Module '{req.module_id}' disabled: {reason}")
                if req.module_id not in self.module_cache.verified_modules:
                    raise HTTPException(404, f"Module '{req.module_id}' not available")

            if self.free_display_heap:
                disp_num = heapq.heappop(self.free_display_heap)
            else:
                if self.next_display_num > MAX_TAB_DISPLAY:
                    raise HTTPException(503, "Tab display number range (:101-:1099) exhausted")
                disp_num = self.next_display_num
                self.next_display_num += 1

            disp_str = f":{disp_num}"
            tab_id = f"tab_{disp_num}_{uuid.uuid4().hex[:6]}"
            home = f"/tmp/v2e_sandbox_{disp_num}"
            xvfb: Optional[subprocess.Popen] = None
            wm: Optional[subprocess.Popen] = None
            app: Optional[subprocess.Popen] = None
            linked_mod: Optional[LinkedModule] = None

            try:
                home, socket_path, xauth_path = await self._prepare_sandbox_dir(disp_num)
                env = self._sandbox_env(disp_str, home, xauth_path)
                user_kw = self._sandbox_user_kwargs(disp_num)
                uid, gid = self._sandbox_ids(disp_num)

                if req.module_id is not None:
                    try:
                        loop = asyncio.get_running_loop()
                        linked_mod = await loop.run_in_executor(
                            None, self.module_cache.materialize_into_sandbox,
                            req.module_id, Path(home), uid, gid,
                        )
                    except Exception as e:
                        raise HTTPException(503, f"Module materialization failed: {e}") from e

                xvfb = subprocess.Popen(
                    ["Xvfb", disp_str, "-screen", "0", f"{self.sandbox_w}x{self.sandbox_h}x24",
                     "-auth", xauth_path, "-nolisten", "tcp", "+extension", "GLX", "-noreset"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )
                await self._wait_x11_socket(disp_num, xvfb)

                wm = subprocess.Popen(["openbox"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
                await asyncio.sleep(0.1)

                subprocess.run(
                    ["tmux", "-S", socket_path, "new-session", "-d", "-s", "main", "-x", "120", "-y", "36"],
                    env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )

                source_socket = f"/tmp/tmux-{TRUNK_UID}/v2e_trunk"
                source_disp_num = 99
                if req.clone_live_fork_state and cap.user_id:
                    user_ws = self.workspaces.get(cap.user_id)
                    if user_ws and user_ws.fork_tmux_socket and user_ws.fork_display:
                        source_socket = user_ws.fork_tmux_socket
                        source_disp_num = int(user_ws.fork_display.split(":")[1])

                captured = self._capture_tmux_scrollback(source_socket, disp_num=source_disp_num)
                scrollback_lines = [ln for ln in captured.splitlines() if ln.strip()]

                replay_cmd = "echo 'Workspace Ready'"
                for node in self.ledger:
                    if node.timestamp_ms <= req.replay_from_ms:
                        replay_cmd = node.inferred_cmd
                    else:
                        break

                def send(text: str):
                    subprocess.run(["tmux", "-S", socket_path, "send-keys", "-t", "main", "-l", text],
                                   env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
                    subprocess.run(["tmux", "-S", socket_path, "send-keys", "-t", "main", "Enter"],
                                   env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)

                if linked_mod is not None:
                    send(f"# === MODULE {linked_mod.module_id} ({linked_mod.commit_sha[:12]}) ({disp_str}) @ {req.replay_from_ms}ms ===")
                    send(f"cd ~/workspace && ls -la && echo '--- {linked_mod.entrypoint_file} ---' && head -n 40 -- {linked_mod.entrypoint_file}")
                else:
                    send(f"# === CLONED {req.component_type} ({disp_str}) @ {req.replay_from_ms}ms ===")
                    if scrollback_lines:
                        send(f"# Prior state: {len(scrollback_lines)} lines")
                    send(replay_cmd)

                fg = {"IDE_EDITOR": "#58a6ff", "VIEWPORT_PREVIEW": "#f59e0b"}.get(req.component_type, "#3fb950")
                win_title = f"V2E_{tab_id}"
                app = subprocess.Popen(
                    ["xterm", "-geometry", "120x36+0+0", "-bg", "#0b0f17", "-fg", fg,
                     "-T", win_title, "-e", "tmux", "-S", socket_path, "attach-session", "-t", "main"],
                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw,
                )
                await asyncio.sleep(0.15)

                roi = self.sub_components.get(req.component_type, self.sub_components["FULL_WORKSPACE"])
                wx, wy, ww, wh = roi.target_win_geom
                win_ids = self._run_x11_argv(disp_str, ["xdotool", "search", "--name", f"^{re.escape(win_title)}$"]).splitlines()
                if win_ids:
                    wid = win_ids[0].strip()
                    self._run_x11_argv(disp_str, ["xdotool", "windowmove", wid, str(wx), str(wy)])
                    self._run_x11_argv(disp_str, ["xdotool", "windowsize", wid, str(ww), str(wh)])

                now = time.time()
                session = SpawnedTabSession(
                    tab_id=tab_id, owner_user_id=cap.user_id, display_num=disp_num,
                    display_str=disp_str, tmux_socket=socket_path, xauth_path=xauth_path, home_dir=home,
                    component_type=req.component_type, replay_from_ms=req.replay_from_ms,
                    cloned_scrollback_lines=len(scrollback_lines), module_id=linked_mod.module_id if linked_mod else None,
                    created_at=now, last_touched=now, xvfb_proc=xvfb, wm_proc=wm, app_proc=app,
                )
                self.active_tabs[tab_id] = session
                self.notify_sse_subscribers()
                return session
            except Exception:
                self.active_tabs.pop(tab_id, None)
                await self._terminate_proc(app)
                await self._terminate_proc(wm)
                await self._terminate_proc(xvfb)
                await self._cleanup_sandbox_xauth(disp_str, home)
                heapq.heappush(self.free_display_heap, disp_num)
                raise

    async def _terminate_proc(self, proc: Optional[subprocess.Popen], timeout: float = 3.0):
        if proc is None:
            return
        loop = asyncio.get_running_loop()
        try:
            proc.terminate()
            await loop.run_in_executor(None, lambda: proc.wait(timeout=timeout))
        except subprocess.TimeoutExpired:
            proc.kill()
            await loop.run_in_executor(None, proc.wait)
        except ProcessLookupError:
            pass

    async def close_and_reap_tab(self, tab_id: str, requested_by: Optional[str] = None, requesting_user: Optional[str] = None, grace_seconds: float = BEACON_GRACE_SECONDS) -> Dict[str, object]:
        if requested_by == "beacon" and grace_seconds > 0:
            await asyncio.sleep(grace_seconds)
            s = self.active_tabs.get(tab_id)
            if s and (time.time() - s.last_touched) < grace_seconds:
                return {"status": "REVIVED", "tab_id": tab_id}

        async with self.tab_lock:
            session = self.active_tabs.get(tab_id)
            if not session:
                raise HTTPException(404, "Tab not found or already closed")
            if requesting_user is not None and session.owner_user_id != requesting_user:
                raise HTTPException(403, "Cannot close another subscriber's tab")
            self.active_tabs.pop(tab_id, None)

            user_kw = self._sandbox_user_kwargs(session.display_num)
            env = self._sandbox_env(session.display_str, session.home_dir, session.xauth_path)
            await self._terminate_proc(session.app_proc)
            subprocess.run(["tmux", "-S", session.tmux_socket, "kill-server"], env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
            await self._terminate_proc(session.wm_proc)
            await self._terminate_proc(session.xvfb_proc)

            await self._cleanup_sandbox_xauth(session.display_str, session.home_dir)
            heapq.heappush(self.free_display_heap, session.display_num)
            self.notify_sse_subscribers()
            return {"status": "REAPED", "tab_id": tab_id, "recycled_display": session.display_str}

    async def _reap_workspace(self, user_id: str):
        async with self.workspace_lock:
            ws = self.workspaces.get(user_id)
            if not ws or not ws.fork_display:
                return
            disp_str = ws.fork_display
            disp_num = int(disp_str.split(":")[1])
            user_kw = self._sandbox_user_kwargs(disp_num)
            env = self._sandbox_env(disp_str, ws.fork_home_dir or "/tmp", ws.fork_xauth_path or "")

            await self._terminate_proc(ws.fork_app_proc)
            if ws.fork_tmux_socket:
                subprocess.run(["tmux", "-S", ws.fork_tmux_socket, "kill-server"], env=env, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **user_kw)
            await self._terminate_proc(ws.fork_wm_proc)
            await self._terminate_proc(ws.fork_xvfb_proc)

            await self._cleanup_sandbox_xauth(disp_str, ws.fork_home_dir)
            self.user_fork_displays_in_use.discard(disp_num)
            ws.fork_display = None
            ws.fork_tmux_socket = None
            ws.fork_xauth_path = None
            ws.fork_home_dir = None
            ws.fork_xvfb_proc = ws.fork_wm_proc = ws.fork_app_proc = None
            ws.workspace_forked = False
            self.notify_sse_subscribers()

    async def reap_expired_loop(self):
        while True:
            await asyncio.sleep(30.0)
            now = time.time()
            for tid, s in list(self.active_tabs.items()):
                if (now - s.last_touched) > self.tab_ttl_seconds:
                    try:
                        await self.close_and_reap_tab(tid, grace_seconds=0)
                    except Exception:
                        pass
            for uid, ws in list(self.workspaces.items()):
                if ws.fork_display and (now - ws.last_touched) > self.workspace_ttl_seconds:
                    try:
                        await self._reap_workspace(uid)
                    except Exception:
                        pass

    def capture_x11_shm_jpeg(self, display: str) -> bytes:
        disp = self.validate_display(display)
        cur_epoch = self.display_epoch.get(disp)
        if cur_epoch is None:
            return self._blank_jpeg(disp)

        cache = getattr(_tls, "mss_cache", None)
        if cache is None:
            cache = {}
            _tls.mss_cache = cache

        entry = cache.get(disp)
        if entry is None or entry[1] != cur_epoch:
            if entry is not None:
                try: entry[0].close()
                except Exception: pass
            try:
                cache[disp] = (mss.mss(display=disp), cur_epoch)
            except Exception:
                cache.pop(disp, None)
                return self._blank_jpeg(disp)

        sct = cache[disp][0]
        try:
            mon = sct.monitors[1]
            if mon["width"] != self.sandbox_w or mon["height"] != self.sandbox_h:
                sct.close()
                cache.pop(disp, None)
                return self._blank_jpeg(disp)

            sct_img = sct.grab(mon)
            frame = np.frombuffer(sct_img.bgra, dtype=np.uint8).reshape(sct_img.height, sct_img.width, 4)
            bgr = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok:
                return buf.tobytes()
        except Exception:
            try: sct.close()
            except Exception: pass
            cache.pop(disp, None)
        return self._blank_jpeg(disp)

    def _blank_jpeg(self, disp: str) -> bytes:
        blank = np.zeros((self.sandbox_h, self.sandbox_w, 3), dtype=np.uint8)
        cv2.putText(blank, f"Sandbox {disp} Active", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (56, 189, 248), 2)
        _, buf = cv2.imencode(".jpg", blank)
        return buf.tobytes()

    async def route_pointer(self, req: PointerEventRequest, cap: CapabilityToken) -> Dict[str, object]:
        ws = self._get_workspace(cap.user_id, cap.tier)
        if req.target_display:
            disp = self.validate_display(req.target_display)
            self._assert_display_ownership(disp, cap.user_id)
            if disp == self.display_trunk:
                raise HTTPException(403, "Cannot click directly into shared trunk")
            local_x = int((req.px / float(max(req.video_width, 1))) * self.sandbox_w)
            local_y = int((req.py / float(max(req.video_height, 1))) * self.sandbox_h)
            self._run_x11_argv(disp, ["xdotool", "mousemove", str(local_x), str(local_y), "click", "1"])
            for s in self.active_tabs.values():
                if s.display_str == disp:
                    s.last_touched = time.time()
            return {"hit_target": "DETACHED_TAB", "speaker_playing": ws.speaker_playing, "workspace_forked": ws.workspace_forked, "fork_display": disp, "sandbox_xy": [local_x, local_y]}

        sx = int(req.px * (1280.0 / max(req.video_width, 1)))
        sy = int(req.py * (720.0 / max(req.video_height, 1)))
        px, py, pw, ph = self.speaker_roi
        wx, wy, ww, wh = self.workspace_roi

        if px <= sx <= px + pw and py <= sy <= py + ph:
            ws.speaker_playing = not ws.speaker_playing
            return {"hit_target": "SPEAKER_STREAM", "speaker_playing": ws.speaker_playing, "workspace_forked": ws.workspace_forked}

        if wx <= sx <= wx + ww and wy <= sy <= wy + wh:
            if TIER_RANK[cap.tier] < TIER_RANK[self.manifest.min_subscriber_tier]:
                return {"hit_target": "RESTRICTED", "speaker_playing": ws.speaker_playing, "workspace_forked": ws.workspace_forked, "message": f"Requires tier '{self.manifest.min_subscriber_tier}'"}
            if not self.manifest.allow_subscreen_fork:
                return {"hit_target": "RESTRICTED", "speaker_playing": ws.speaker_playing, "workspace_forked": ws.workspace_forked, "message": "Publisher disabled interactive forking"}

            ws = await self._ensure_user_fork(cap, req.current_speaker_ms)
            local_x = int(((sx - wx) / float(ww)) * self.sandbox_w)
            local_y = int(((sy - wy) / float(wh)) * self.sandbox_h)
            self._run_x11_argv(ws.fork_display, ["xdotool", "mousemove", str(local_x), str(local_y), "click", "1"])
            ws.last_touched = time.time()
            return {"hit_target": "WORKSPACE_SUBSCREEN", "speaker_playing": ws.speaker_playing, "workspace_forked": True, "fork_display": ws.fork_display, "sandbox_xy": [local_x, local_y]}

        return {"hit_target": "BACKGROUND", "speaker_playing": ws.speaker_playing, "workspace_forked": ws.workspace_forked}

    def send_keystrokes(self, text: str, cap: CapabilityToken, target_display: Optional[str] = None) -> Dict[str, object]:
        disp = self.validate_display(target_display)
        self._assert_display_ownership(disp, cap.user_id)
        ws = self._get_workspace(cap.user_id, cap.tier)
        if disp == self.display_trunk:
            raise HTTPException(403, "Cannot type into the shared trunk")
        if ws.fork_display == disp:
            ws.workspace_forked = True
        ws.user_cmd_history.append(text)
        ws.last_touched = time.time()
        for s in self.active_tabs.values():
            if s.display_str == disp:
                s.last_touched = time.time()
        self._run_x11_argv(disp, ["xdotool", "type", "--delay", "10", "--", text])
        self._run_x11_argv(disp, ["xdotool", "key", "Return"])
        self.notify_sse_subscribers()
        return {"status": "EXECUTED", "display": disp, "command": text}

    async def resync(self, req: ResyncRequest, cap: CapabilityToken) -> Dict[str, object]:
        if not self.ledger:
            self.load_or_build_transcript(VIDEO_PATH)
        disp = self.validate_display(req.target_display)
        self._assert_display_ownership(disp, cap.user_id)
        ws = self._get_workspace(cap.user_id, cap.tier)

        if req.direction == "SUBSCREEN_TO_SPEAKER":
            target = self.ledger[0]
            for node in self.ledger:
                if node.timestamp_ms <= req.speaker_ms:
                    target = node
                else: break
            if disp != self.display_trunk:
                self._run_x11_argv(disp, ["xdotool", "type", "--delay", "8", "--", target.inferred_cmd])
                self._run_x11_argv(disp, ["xdotool", "key", "Return"])
            if ws.fork_display == disp:
                ws.workspace_forked = False
            ws.last_touched = time.time()
            self.notify_sse_subscribers()
            return {"direction": "SUBSCREEN_TO_SPEAKER", "synced_timestamp_ms": target.timestamp_ms, "restored_command": target.inferred_cmd, "workspace_forked": ws.workspace_forked}

        recent_cmds = list(ws.user_cmd_history)[-2:]
        query = (req.user_terminal_text or " ".join(recent_cmds)).strip()
        best_node, best_score = self.ledger[0], -1.0
        for node in self.ledger:
            cand = " ".join(node.pixel_ocr_lines) + " " + node.inferred_cmd
            s = difflib.SequenceMatcher(None, query.lower(), cand.lower()).ratio()
            if s > best_score:
                best_score, best_node = s, node
        return {"direction": "SPEAKER_TO_SUBSCREEN", "seek_speaker_ms": best_node.timestamp_ms, "matched_command": best_node.inferred_cmd, "similarity": round(best_score, 3)}

engine = HardenedBitemporalEngine()
PUBLISHER_MANIFEST_PUBKEY: Optional[Ed25519PublicKey] = None
PUBLISHER_AUTH_PUBKEY: Optional[Ed25519PublicKey] = None

def load_ed25519_pubkey(secret_file: str, env_var: str, required: bool) -> Optional[Ed25519PublicKey]:
    val: Optional[str] = None
    secret_path = Path(secret_file)
    if secret_path.is_file():
        val = secret_path.read_text(encoding="utf-8").strip()
    else:
        val = os.environ.get(env_var)
    if not val:
        if required:
            raise RuntimeError(f"FATAL: neither {secret_file} nor {env_var} is set (V2E_REQUIRE_AUTH=1)")
        return None
    try:
        pem = val.encode() if "BEGIN PUBLIC KEY" in val else base64.b64decode(val)
        key = load_pem_public_key(pem)
        if not isinstance(key, Ed25519PublicKey):
            raise ValueError(f"loaded key is {type(key).__name__}, expected Ed25519PublicKey")
        print(f"[V2E-v8] loaded {secret_file} OK")
        return key
    except Exception as e:
        hint = ("expected PEM ('-----BEGIN PUBLIC KEY-----') or base64-encoded PEM, not raw hex" if "BEGIN PUBLIC KEY" not in val else "PEM header present, check key algorithm is Ed25519")
        msg = f"{secret_file} / {env_var} invalid ({hint}): {e}"
        if required:
            raise RuntimeError(f"FATAL: {msg}")
        print(f"[V2E-v8] WARN: {msg}")
        return None

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine._main_loop = asyncio.get_running_loop()
    global PUBLISHER_MANIFEST_PUBKEY, PUBLISHER_AUTH_PUBKEY
    require_auth = os.environ.get("V2E_REQUIRE_AUTH", "1") == "1"
    PUBLISHER_MANIFEST_PUBKEY = load_ed25519_pubkey("/run/secrets/publisher_manifest_pub", "PUBLISHER_MANIFEST_PUBKEY_PEM", require_auth)
    PUBLISHER_AUTH_PUBKEY = load_ed25519_pubkey("/run/secrets/publisher_auth_pub", "PUBLISHER_AUTH_PUBKEY_PEM", require_auth)

    manifest_file = Path("/app/manifests/demo_manifest.json")
    sig_file = Path("/app/manifests/demo_manifest.sig")
    if manifest_file.exists() and sig_file.exists() and PUBLISHER_MANIFEST_PUBKEY:
        try:
            body = manifest_file.read_bytes()
            sig = sig_file.read_bytes()
            PUBLISHER_MANIFEST_PUBKEY.verify(sig, body)
            engine.manifest = PublisherManifest(**json.loads(body))
            print(f"[V2E-v8] verified manifest for video={engine.manifest.video_id}")
        except (InvalidSignature, Exception) as e:
            raise RuntimeError(f"FATAL: invalid publisher manifest signature: {e}")
    else:
        if require_auth:
            raise RuntimeError("FATAL: no signed manifest found (V2E_REQUIRE_AUTH=1)")
        engine.manifest = PublisherManifest(video_id="demo_v2e_008", publisher_id="publisher_alpha", signed_at=int(time.time()), min_subscriber_tier="paid")
        print("[V2E-v8] WARN: unsigned demo manifest (dev mode)")

    engine.module_cache = VerifiedModuleCache()
    if engine.manifest.linked_modules:
        try:
            await engine._main_loop.run_in_executor(None, engine.module_cache.ingest_all_at_startup, engine.manifest.linked_modules, True)
        except Exception as e:
            raise RuntimeError(f"module cache ingest failed: {e}") from e

    await engine._main_loop.run_in_executor(_ocr_pool, engine.load_or_build_transcript, VIDEO_PATH)
    reaper = asyncio.create_task(engine.reap_expired_loop())
    try:
        yield
    finally:
        reaper.cancel()
        for tid in list(engine.active_tabs.keys()):
            try: await engine.close_and_reap_tab(tid, grace_seconds=0)
            except Exception: pass
        for uid in list(engine.workspaces.keys()):
            try: await engine._reap_workspace(uid)
            except Exception: pass

app = FastAPI(title="V2E SOTA Multi-Tab Bitemporal Engine v8", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

async def verify_subscriber_optional(authorization: Optional[str] = Header(default=None)) -> Optional[SubscriberClaims]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    if PUBLISHER_AUTH_PUBKEY is None:
        raise HTTPException(503, "Subscriber auth not configured")
    try:
        payload = jwt.decode(authorization[7:], PUBLISHER_AUTH_PUBKEY, algorithms=["EdDSA"], audience="v2e-engine", issuer="publisher-auth")
    except PyJWTError:
        raise HTTPException(401, "Invalid or expired subscriber token")
    if payload.get("publisher_id") != engine.manifest.publisher_id:
        raise HTTPException(403, "Subscriber token is for a different publisher")
    return SubscriberClaims(user_id=payload["sub"], publisher_id=payload["publisher_id"], tier=payload.get("tier", "free"), scope=payload.get("scope", []), exp=payload["exp"])

async def get_cap_token_from_header(x_v2e_cap_token: Optional[str] = Header(default=None)) -> CapabilityToken:
    return engine.resolve_cap_token(x_v2e_cap_token)

@app.get("/api/healthz")
def healthcheck():
    try:
        st = os.stat("/tmp/.X11-unix/X99")
        if not stat.S_ISSOCK(st.st_mode): raise HTTPException(503, "Trunk X11 socket not bound")
    except FileNotFoundError:
        raise HTTPException(503, "Trunk X11 socket missing")
    if engine.manifest is None: raise HTTPException(503, "Manifest not initialized")
    res = subprocess.run(["tmux", "-S", f"/tmp/tmux-{TRUNK_UID}/v2e_trunk", "has-session", "-t", "main"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, user=TRUNK_UID, group=TRUNK_UID, extra_groups=[])
    if res.returncode != 0: raise HTTPException(503, "Trunk tmux session dead")
    return {"status": "ok", "video_id": engine.manifest.video_id}

@app.get("/")
def serve_ui(): return FileResponse("static/index.html")

@app.get("/tab/{tab_id}")
def serve_detached_tab_ui(tab_id: str):
    if tab_id not in engine.active_tabs: raise HTTPException(404, "Detached tab not found")
    return FileResponse("static/index.html")

@app.get("/api/video")
def serve_video():
    if not os.path.exists(VIDEO_PATH): raise HTTPException(404, "Demo video not found")
    return FileResponse(VIDEO_PATH, media_type="video/mp4")

@app.get("/api/ledger")
def get_ledger(claims: Optional[SubscriberClaims] = Depends(verify_subscriber_optional), x_v2e_cap_token: Optional[str] = Header(default=None)):
    cap_token = None
    can_popout = False
    reason: Optional[str] = None
    ws = None
    subscriber_info = None
    eff_user_id: Optional[str] = None

    if claims is not None:
        eff_user_id = claims.user_id
        subscriber_info = {"user_id": claims.user_id, "tier": claims.tier}
        if TIER_RANK[claims.tier] < TIER_RANK[engine.manifest.min_subscriber_tier]: reason = f"Requires tier '{engine.manifest.min_subscriber_tier}'"
        elif "popout" not in claims.scope: reason = "Token scope missing 'popout'"
        elif not engine.manifest.allow_multi_tab_popout: reason = "Publisher disabled pop-outs for this video"
        else:
            cap_token = engine.issue_or_rotate_capability_token(claims, existing_token=x_v2e_cap_token)
            can_popout = True
            ws = engine.workspaces.get(claims.user_id)
    elif x_v2e_cap_token and x_v2e_cap_token in engine.valid_cap_tokens:
        cap_obj = engine.valid_cap_tokens[x_v2e_cap_token]
        eff_user_id = cap_obj.user_id
        cap_token = cap_obj.token
        subscriber_info = {"user_id": cap_obj.user_id, "tier": cap_obj.tier}
        can_popout = (TIER_RANK[cap_obj.tier] >= TIER_RANK[engine.manifest.min_subscriber_tier] and bool(engine.manifest.allow_multi_tab_popout))
        if not can_popout: reason = "Pop-outs restricted by publisher manifest"
        ws = engine.workspaces.get(cap_obj.user_id)
    else:
        reason = "Sign in with a paid subscription to unlock pop-outs"

    user_tabs = [{"tab_id": t.tab_id, "component_type": t.component_type, "display_str": t.display_str, "cloned_scrollback_lines": t.cloned_scrollback_lines, "module_id": t.module_id} for t in engine.active_tabs.values() if eff_user_id and t.owner_user_id == eff_user_id]
    return {"capability_token": cap_token, "subscriber": subscriber_info, "can_popout": can_popout, "popout_disabled_reason": reason, "manifest": asdict(engine.manifest), "linked_modules": engine.serialize_linked_modules(), "speaker_roi": engine.speaker_roi, "workspace_roi": engine.workspace_roi, "sub_components": [asdict(c) for c in engine.sub_components.values()], "active_tabs": user_tabs, "workspace_forked": bool(ws and ws.workspace_forked), "fork_display": ws.fork_display if ws else None, "nodes": [asdict(n) for n in engine.ledger]}

@app.get("/api/ledger/stream")
async def stream_ledger_events(ticket: Optional[str] = Query(default=None), claims: Optional[SubscriberClaims] = Depends(verify_subscriber_optional)):
    user_id = claims.user_id if claims else None
    if not user_id and ticket:
        entry = engine.ws_tickets.pop(ticket, None)
        if entry: user_id = entry["user_id"]
    q: asyncio.Queue = asyncio.Queue(maxsize=16)
    engine.sse_subscribers[q] = user_id
    async def gen():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError: pass
        finally: engine.sse_subscribers.pop(q, None)
    return StreamingResponse(gen(), media_type="text/event-stream")

@app.post("/api/ws-ticket")
async def issue_ws_ticket(cap: CapabilityToken = Depends(get_cap_token_from_header)):
    ticket = engine.issue_ws_ticket(cap.user_id)
    return {"ticket": ticket, "expires_in": 60}

@app.post("/api/tabs/spawn")
async def spawn_new_tab(req: SpawnTabRequest, cap: CapabilityToken = Depends(get_cap_token_from_header)):
    session = await engine.spawn_detached_tab_sandbox(req, cap)
    return {"status": "SPAWNED", "tab_url": f"/tab/{session.tab_id}?tab_id={session.tab_id}&display={session.display_str}&component={session.component_type}&ms={session.replay_from_ms}" + (f"&module_id={session.module_id}" if session.module_id else ""), "session": {"tab_id": session.tab_id, "display_str": session.display_str, "component_type": session.component_type, "cloned_scrollback_lines": session.cloned_scrollback_lines, "module_id": session.module_id}}

@app.post("/api/tabs/{tab_id}/touch", status_code=204)
async def touch_tab(tab_id: str, cap: CapabilityToken = Depends(get_cap_token_from_header)):
    session = engine.active_tabs.get(tab_id)
    if not session or session.owner_user_id != cap.user_id: raise HTTPException(404, "Tab not found")
    session.last_touched = time.time()
    return Response(status_code=204)

@app.post("/api/tabs/{tab_id}/close")
async def close_tab(tab_id: str, requested_by: Optional[str] = Query(default=None), x_v2e_cap_token: Optional[str] = Header(default=None), token: Optional[str] = Query(default=None)):
    eff = x_v2e_cap_token or token
    cap = engine.resolve_cap_token(eff)
    return await engine.close_and_reap_tab(tab_id, requested_by=requested_by, requesting_user=cap.user_id)

@app.post("/api/pointer")
async def handle_pointer(req: PointerEventRequest, cap: CapabilityToken = Depends(get_cap_token_from_header)):
    return await engine.route_pointer(req, cap)

@app.post("/api/keyboard")
async def handle_keyboard(req: KeyEventRequest, cap: CapabilityToken = Depends(get_cap_token_from_header)):
    return engine.send_keystrokes(req.key_text, cap, req.target_display)

@app.post("/api/resync")
async def handle_resync(req: ResyncRequest, cap: CapabilityToken = Depends(get_cap_token_from_header)):
    return await engine.resync(req, cap)

@app.websocket("/ws/subscreen")
async def stream_subscreen(websocket: WebSocket, ticket: str, display: Optional[str] = None):
    entry = engine.ws_tickets.pop(ticket, None)
    if not entry or not entry.get("user_id"):
        await websocket.close(code=1008)
        return
    user_id = entry["user_id"]
    await websocket.accept()
    loop = asyncio.get_running_loop()
    interval = 1.0 / 20.0
    last = 0.0
    last_checked_disp: Optional[str] = None
    try:
        while True:
            if display: target = display
            else:
                ws_obj = engine.workspaces.get(user_id)
                target = ws_obj.fork_display if (ws_obj and ws_obj.workspace_forked) else engine.display_trunk
            if target != last_checked_disp:
                engine._assert_display_ownership(target, user_id)
                last_checked_disp = target
            now = time.monotonic()
            wait = interval - (now - last)
            if wait > 0: await asyncio.sleep(wait)
            jpeg = await loop.run_in_executor(_capture_pool, engine.capture_x11_shm_jpeg, target)
            await websocket.send_bytes(jpeg)
            await websocket.receive_text()
            last = time.monotonic()
    except (WebSocketDisconnect, RuntimeError): pass
    except HTTPException: await websocket.close(code=1008)
