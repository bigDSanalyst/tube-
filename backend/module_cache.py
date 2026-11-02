import hashlib
import os
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

CANONICAL_TREE_HASH_VERSION = "v9.1-mode-included"

SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SAFE_SHA1_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SAFE_RELPATH_RE = re.compile(r"^[A-Za-z0-9_./-]{1,256}$")

MODULE_CACHE_ROOT = Path("/tmp/v2e_module_cache")

@dataclass
class LinkedModule:
    module_id: str
    repo_url: str
    commit_sha: str
    tree_sha256: str
    entrypoint_file: str
    timestamp_ms: int
    cache_policy: str = "immutable"
    tree_sha256_algo: str = CANONICAL_TREE_HASH_VERSION

    def validate_schema(self) -> None:
        if not SAFE_ID_RE.fullmatch(self.module_id):
            raise ValueError(f"Invalid module_id: {self.module_id}")
        if not SAFE_SHA1_RE.fullmatch(self.commit_sha):
            raise ValueError(f"commit_sha must be 40-char lowercase hex: {self.commit_sha}")
        if not SAFE_SHA256_RE.fullmatch(self.tree_sha256):
            raise ValueError(f"tree_sha256 must be 64-char lowercase hex: {self.tree_sha256}")
        if self.tree_sha256_algo not in TREE_HASH_DISPATCH:
            raise ValueError(f"Unsupported tree_sha256_algo: {self.tree_sha256_algo}")
        if not SAFE_RELPATH_RE.fullmatch(self.entrypoint_file):
            raise ValueError(f"Unsafe characters in entrypoint_file: {self.entrypoint_file}")
        rel = Path(self.entrypoint_file)
        if rel.is_absolute() or ".." in rel.parts:
            raise ValueError(f"Path traversal in entrypoint_file: {self.entrypoint_file}")
        if self.cache_policy not in ("immutable", "rolling"):
            raise ValueError(f"Invalid cache_policy: {self.cache_policy}")
        if not (
            self.repo_url.startswith("https://")
            or self.repo_url.startswith("file:///app/")
            or self.repo_url.startswith("file:///tmp/")
        ):
            raise ValueError(f"Unsupported repo_url scheme: {self.repo_url}")

def compute_canonical_tree_sha256_v9_1(root_dir: Path) -> str:
    root_resolved = root_dir.resolve()
    entries: List[bytes] = []

    for dirpath, dirnames, filenames in os.walk(root_resolved, followlinks=False):
        if ".git" in dirnames:
            dirnames.remove(".git")
        dirnames.sort()
        for dname in dirnames:
            dpath = Path(dirpath) / dname
            dst = os.lstat(dpath)
            if not stat.S_ISDIR(dst.st_mode):
                raise ValueError(f"Non-directory / symlink directory forbidden in module tree: {dpath}")

        for fname in sorted(filenames):
            fpath = Path(dirpath) / fname
            st = os.lstat(fpath)
            if not stat.S_ISREG(st.st_mode):
                raise ValueError(f"Non-regular file forbidden in module tree: {fpath}")
            if (st.st_mode & stat.S_ISUID) or (st.st_mode & stat.S_ISGID):
                raise ValueError(f"setuid/setgid forbidden in module tree: {fpath}")
            rel_posix = fpath.relative_to(root_resolved).as_posix()
            file_hash = hashlib.sha256(fpath.read_bytes()).digest()
            mode_str = f"{st.st_mode & 0o7777:04o}"
            header = f"{rel_posix}\0{mode_str}\0".encode("utf-8")
            entries.append(header + file_hash)

    entries.sort()
    outer = hashlib.sha256()
    for entry in entries:
        outer.update(entry)
    return outer.hexdigest()

TREE_HASH_DISPATCH: Dict[str, Callable[[Path], str]] = {
    CANONICAL_TREE_HASH_VERSION: compute_canonical_tree_sha256_v9_1,
}

compute_canonical_tree_sha256 = compute_canonical_tree_sha256_v9_1

def extract_git_archive_deterministic(bare_or_repo_dir: Path, commit_sha: str, target_dir: Path) -> None:
    with tempfile.NamedTemporaryFile(prefix="v2e_archive_", suffix=".tar", delete=False) as tf:
        tar_path = Path(tf.name)
    try:
        with open(tar_path, "wb") as tf_out:
            subprocess.run(
                [
                    "git",
                    "-c", "core.hooksPath=/dev/null",
                    "-C", str(bare_or_repo_dir),
                    "archive", "--format=tar", commit_sha,
                ],
                check=True, stdout=tf_out, stderr=subprocess.PIPE, timeout=30,
            )
        old_umask = os.umask(0o022)
        try:
            with tarfile.open(tar_path, "r:") as tar:
                tar.extractall(path=target_dir, filter="data")
        finally:
            os.umask(old_umask)
    finally:
        tar_path.unlink(missing_ok=True)

def compute_git_commit_tree_sha256(repo_dir: Path, commit_sha: str, algo: str = CANONICAL_TREE_HASH_VERSION) -> str:
    hasher = TREE_HASH_DISPATCH[algo]
    with tempfile.TemporaryDirectory(prefix="v2e_sign_") as tmp:
        tmp_path = Path(tmp)
        extract_git_archive_deterministic(repo_dir, commit_sha, tmp_path)
        return hasher(tmp_path)

def _compute_stat_fingerprint(root_dir: Path) -> bytes:
    h = hashlib.sha256()
    root_resolved = root_dir.resolve()
    root_st = os.lstat(root_resolved)
    h.update(f"ROOT:{root_st.st_ino}:{root_st.st_mtime_ns}\0".encode())

    for dirpath, dirnames, filenames in os.walk(root_resolved, followlinks=False):
        dirnames.sort()
        for dname in dirnames:
            dp = Path(dirpath) / dname
            st = os.lstat(dp)
            h.update(f"D:{dp.relative_to(root_resolved).as_posix()}:{st.st_ino}:{st.st_mtime_ns}:{st.st_mode}\0".encode())
        for fname in sorted(filenames):
            fp = Path(dirpath) / fname
            st = os.lstat(fp)
            h.update(f"F:{fp.relative_to(root_resolved).as_posix()}:{st.st_ino}:{st.st_mtime_ns}:{st.st_size}:{st.st_mode}\0".encode())
    return h.digest()

class VerifiedModuleCache:
    def __init__(self, cache_root: Path = MODULE_CACHE_ROOT):
        self.cache_root = cache_root
        self.verified_modules: Dict[str, LinkedModule] = {}
        self.refused_modules: Dict[str, str] = {}
        self.last_verified: Dict[str, Tuple[bytes, str]] = {}

    def ingest_all_at_startup(self, modules: List[LinkedModule], require_all: bool = True) -> None:
        self.cache_root.mkdir(parents=True, mode=0o700, exist_ok=True)
        try:
            os.chown(self.cache_root, 0, 0)
        except PermissionError:
            pass

        for mod in modules:
            try:
                self._ingest_single(mod)
                print(f"[V2E-v9.1] module={mod.module_id} verified tree_sha256={mod.tree_sha256[:12]}...")
            except Exception as e:
                self.refused_modules[mod.module_id] = str(e)
                print(f"[V2E-v9.1] ERROR: module={mod.module_id} refused: {e}")
                if require_all and mod.cache_policy == "immutable":
                    raise RuntimeError(f"FATAL: immutable module '{mod.module_id}' failed verification: {e}")

    def _ingest_single(self, mod: LinkedModule) -> None:
        mod.validate_schema()
        hasher = TREE_HASH_DISPATCH[mod.tree_sha256_algo]

        if mod.cache_policy == "rolling":
            res = subprocess.run(
                ["git", "ls-remote", mod.repo_url, "HEAD"],
                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15,
            )
            remote_sha = res.stdout.split()[0].strip() if res.stdout.strip() else ""
            if remote_sha != mod.commit_sha:
                raise RuntimeError(f"rolling drift: remote HEAD is {remote_sha}, manifest pins {mod.commit_sha} (re-sign required)")

        bare_dir = self.cache_root / f"_bare_{mod.module_id}"
        target_dir = self.cache_root / mod.module_id
        shutil.rmtree(bare_dir, ignore_errors=True)
        shutil.rmtree(target_dir, ignore_errors=True)
        bare_dir.mkdir(mode=0o700)
        target_dir.mkdir(mode=0o700)

        try:
            git_safe_flags = ["git", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=always"]
            subprocess.run(git_safe_flags + ["init", "--bare", str(bare_dir)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10)
            subprocess.run(git_safe_flags + ["-C", str(bare_dir), "fetch", "--no-tags", "--depth", "1", mod.repo_url, mod.commit_sha], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)

            obj_type = subprocess.run(["git", "-C", str(bare_dir), "cat-file", "-t", mod.commit_sha], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5).stdout.strip()
            if obj_type != "commit":
                raise RuntimeError(f"Pinned SHA {mod.commit_sha} is a {obj_type}, not a commit")

            rev = subprocess.run(["git", "-C", str(bare_dir), "rev-parse", "FETCH_HEAD^{commit}"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5).stdout.strip()
            if rev != mod.commit_sha:
                raise RuntimeError(f"FETCH_HEAD^{{commit}} ({rev}) != pinned commit_sha ({mod.commit_sha})")

            extract_git_archive_deterministic(bare_dir, mod.commit_sha, target_dir)

            actual_sha256 = hasher(target_dir)
            if actual_sha256 != mod.tree_sha256:
                raise RuntimeError(f"tree_sha256 mismatch: expected {mod.tree_sha256}, computed {actual_sha256}")

            ep = target_dir / mod.entrypoint_file
            if os.path.islink(ep):
                raise RuntimeError(f"entrypoint_file '{mod.entrypoint_file}' cannot be a symlink")
            ep_resolved = ep.resolve()
            if not ep_resolved.is_relative_to(target_dir.resolve()) or not ep_resolved.is_file():
                raise RuntimeError(f"entrypoint_file '{mod.entrypoint_file}' not found in verified tree")

            self.verified_modules[mod.module_id] = mod
            self.last_verified[mod.module_id] = (_compute_stat_fingerprint(target_dir), actual_sha256)
        finally:
            shutil.rmtree(bare_dir, ignore_errors=True)
            if mod.module_id not in self.verified_modules:
                shutil.rmtree(target_dir, ignore_errors=True)

    def materialize_into_sandbox(self, module_id: str, sandbox_home: Path, uid: int, gid: int) -> LinkedModule:
        if module_id in self.refused_modules:
            raise RuntimeError(f"Module '{module_id}' is disabled: {self.refused_modules[module_id]}")
        mod = self.verified_modules.get(module_id)
        if not mod:
            raise KeyError(f"Unknown module_id: {module_id}")

        src_dir = self.cache_root / mod.module_id
        hasher = TREE_HASH_DISPATCH[mod.tree_sha256_algo]

        cur_fp = _compute_stat_fingerprint(src_dir)
        cached_fp, cached_hash = self.last_verified.get(mod.module_id, (b"", ""))
        if cur_fp != cached_fp or cached_hash != mod.tree_sha256:
            current_hash = hasher(src_dir)
            if current_hash != mod.tree_sha256:
                raise RuntimeError(f"Runtime integrity check failed for module '{module_id}'")
            self.last_verified[mod.module_id] = (_compute_stat_fingerprint(src_dir), current_hash)

        dst_dir = sandbox_home / "workspace"
        shutil.rmtree(dst_dir, ignore_errors=True)
        shutil.copytree(src_dir, dst_dir, symlinks=True)

        try:
            for root, dirs, files in os.walk(dst_dir, followlinks=False):
                if os.path.islink(root):
                    raise RuntimeError(f"Symlink directory forbidden in sandbox tree: {root}")
                os.chown(root, uid, gid)
                os.chmod(root, 0o700)
                for d in dirs:
                    dp = os.path.join(root, d)
                    if os.path.islink(dp):
                        raise RuntimeError(f"Symlink directory forbidden in sandbox tree: {dp}")
                    os.chown(dp, uid, gid)
                    os.chmod(dp, 0o700)
                for f in files:
                    fp = os.path.join(root, f)
                    if os.path.islink(fp):
                        raise RuntimeError(f"Symlink forbidden in verified tree: {fp}")
                    st = os.lstat(fp)
                    if not stat.S_ISREG(st.st_mode):
                        raise RuntimeError(f"Non-regular file forbidden in verified tree: {fp}")
                    os.chown(fp, uid, gid)
                    mode = 0o700 if (st.st_mode & stat.S_IXUSR) else 0o600
                    os.chmod(fp, mode)
        except Exception:
            shutil.rmtree(dst_dir, ignore_errors=True)
            raise

        return mod
