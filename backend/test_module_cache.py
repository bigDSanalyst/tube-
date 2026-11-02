import asyncio
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Ensure backend/ is on sys.path whether invoked from repo root or backend/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from module_cache import (
    CANONICAL_TREE_HASH_VERSION,
    LinkedModule,
    VerifiedModuleCache,
    compute_canonical_tree_sha256,
    compute_git_commit_tree_sha256,
)


def _git(cwd: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", "-C", str(cwd)] + list(args),
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    return res.stdout.strip()


class TestVerifiedModuleCacheV91(unittest.TestCase):
    def setUp(self):
        self.tmp_root = Path(tempfile.mkdtemp(prefix="/tmp/v2e_test_"))
        self.cache_dir = self.tmp_root / "cache"
        self.repo_dir = self.tmp_root / "publisher_repo"
        self.sandbox_home = self.tmp_root / "sandbox_101"
        self.repo_dir.mkdir(parents=True)
        self.sandbox_home.mkdir(parents=True)

        _git(self.repo_dir, "init")
        _git(self.repo_dir, "config", "user.email", "pub@example.com")
        _git(self.repo_dir, "config", "user.name", "Publisher")
        _git(self.repo_dir, "config", "uploadpack.allowReachableSHA1InWant", "true")
        _git(self.repo_dir, "config", "uploadpack.allowAnySHA1InWant", "true")

    def tearDown(self):
        shutil.rmtree(self.tmp_root, ignore_errors=True)

    def test_1_valid_module_ingest_and_materialize(self):
        src_sub = self.repo_dir / "src"
        src_sub.mkdir()
        main_py = src_sub / "pipeline.py"
        main_py.write_text("print('hello v9.1')\n", encoding="utf-8")
        run_sh = self.repo_dir / "run.sh"
        run_sh.write_text("#!/bin/sh\npython3 src/pipeline.py\n", encoding="utf-8")
        os.chmod(run_sh, 0o755)

        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "initial")
        commit_sha = _git(self.repo_dir, "rev-parse", "HEAD")
        tree_sha256 = compute_git_commit_tree_sha256(self.repo_dir, commit_sha)

        mod = LinkedModule(
            module_id="demo_v1",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=commit_sha,
            tree_sha256=tree_sha256,
            entrypoint_file="src/pipeline.py",
            timestamp_ms=14000,
        )
        cache = VerifiedModuleCache(cache_root=self.cache_dir)
        cache.ingest_all_at_startup([mod], require_all=True)

        uid, gid = os.getuid(), os.getgid()
        cache.materialize_into_sandbox("demo_v1", self.sandbox_home, uid, gid)

        mat_py = self.sandbox_home / "workspace" / "src" / "pipeline.py"
        mat_sh = self.sandbox_home / "workspace" / "run.sh"
        self.assertTrue(mat_py.is_file())
        self.assertEqual(stat.S_IMODE(os.lstat(mat_py).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.lstat(mat_sh).st_mode), 0o700)

    def test_2_mode_bits_distinguish_0600_vs_0644_and_detect_tampering(self):
        f = self.repo_dir / "secret.env.example"
        f.write_text("API_KEY=placeholder\n", encoding="utf-8")
        os.chmod(f, 0o600)
        h_600 = compute_canonical_tree_sha256(self.repo_dir)
        os.chmod(f, 0o644)
        h_644 = compute_canonical_tree_sha256(self.repo_dir)
        self.assertNotEqual(h_600, h_644)

    def test_3_symlink_to_etc_passwd_rejected_and_cleaned(self):
        (self.repo_dir / "main.py").write_text("x = 1\n", encoding="utf-8")
        os.symlink("/etc/passwd", self.repo_dir / "leak.txt")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "add symlink")
        commit_sha = _git(self.repo_dir, "rev-parse", "HEAD")

        mod = LinkedModule(
            module_id="evil_symlink",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=commit_sha,
            tree_sha256="a" * 64,
            entrypoint_file="main.py",
            timestamp_ms=0,
        )
        cache = VerifiedModuleCache(cache_root=self.cache_dir)
        with self.assertRaises(RuntimeError):
            cache.ingest_all_at_startup([mod], require_all=True)
        self.assertFalse((self.cache_dir / "evil_symlink").exists())

    def test_4_post_ingest_symlink_injection_caught_at_materialize(self):
        (self.repo_dir / "main.py").write_text("print(1)\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "ok")
        commit_sha = _git(self.repo_dir, "rev-parse", "HEAD")
        tree_sha256 = compute_git_commit_tree_sha256(self.repo_dir, commit_sha)

        mod = LinkedModule(
            module_id="tamper_mod",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=commit_sha,
            tree_sha256=tree_sha256,
            entrypoint_file="main.py",
            timestamp_ms=0,
        )
        cache = VerifiedModuleCache(cache_root=self.cache_dir)
        cache.ingest_all_at_startup([mod], require_all=True)

        os.symlink("/etc/hosts", self.cache_dir / "tamper_mod" / "injected_link")
        with self.assertRaises((ValueError, RuntimeError)):
            cache.materialize_into_sandbox("tamper_mod", self.sandbox_home, os.getuid(), os.getgid())

    def test_5_rolling_module_drift_refused(self):
        (self.repo_dir / "main.py").write_text("v1\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "v1")
        sha_v1 = _git(self.repo_dir, "rev-parse", "HEAD")
        tree_v1 = compute_git_commit_tree_sha256(self.repo_dir, sha_v1)

        (self.repo_dir / "main.py").write_text("v2\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "v2")

        mod = LinkedModule(
            module_id="rolling_mod",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=sha_v1,
            tree_sha256=tree_v1,
            entrypoint_file="main.py",
            timestamp_ms=0,
            cache_policy="rolling",
        )
        cache = VerifiedModuleCache(cache_root=self.cache_dir)
        cache.ingest_all_at_startup([mod], require_all=False)
        self.assertIn("rolling_mod", cache.refused_modules)
        with self.assertRaises(RuntimeError):
            cache.materialize_into_sandbox("rolling_mod", self.sandbox_home, os.getuid(), os.getgid())

    def test_6_immutable_but_repushed_tree_fails_tree_sha256(self):
        (self.repo_dir / "main.py").write_text("v1\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "v1")
        sha_v1 = _git(self.repo_dir, "rev-parse", "HEAD")

        mod = LinkedModule(
            module_id="immutable_tamper",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=sha_v1,
            tree_sha256="b" * 64,
            entrypoint_file="main.py",
            timestamp_ms=0,
            cache_policy="immutable",
        )
        cache = VerifiedModuleCache(cache_root=self.cache_dir)
        with self.assertRaises(RuntimeError):
            cache.ingest_all_at_startup([mod], require_all=True)
        self.assertFalse((self.cache_dir / "immutable_tamper").exists())

    def test_7_manifest_json_dict_to_linked_module_bridge(self):
        from app import PublisherManifest

        (self.repo_dir / "app.py").write_text("print('bridge')\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "bridge")
        sha = _git(self.repo_dir, "rev-parse", "HEAD")
        tree_hash = compute_git_commit_tree_sha256(self.repo_dir, sha)

        raw_manifest = {
            "video_id": "vid_009",
            "publisher_id": "pub_alpha",
            "signed_at": 1700000000,
            "linked_modules": [
                {
                    "module_id": "mod_bridge",
                    "repo_url": f"file://{self.repo_dir}",
                    "commit_sha": sha,
                    "tree_sha256": tree_hash,
                    "entrypoint_file": "app.py",
                    "timestamp_ms": 5000,
                }
            ],
        }
        with self.assertRaises(AttributeError):
            _ = [m.module_id for m in raw_manifest["linked_modules"]]

        pm = PublisherManifest(**raw_manifest)
        self.assertIsInstance(pm.linked_modules[0], LinkedModule)
        serialized = asdict(pm.linked_modules[0])
        self.assertEqual(serialized["module_id"], "mod_bridge")
        self.assertEqual(serialized["tree_sha256_algo"], CANONICAL_TREE_HASH_VERSION)

    def test_8_step3b_single_heap_push_on_materialize_failure_and_step4_serialization(self):
        from fastapi import HTTPException
        from app import CapabilityToken, HardenedBitemporalEngine, PublisherManifest, SpawnTabRequest

        (self.repo_dir / "main.py").write_text("print('ok')\n", encoding="utf-8")
        _git(self.repo_dir, "add", ".")
        _git(self.repo_dir, "commit", "-m", "init")
        sha = _git(self.repo_dir, "rev-parse", "HEAD")
        tree_hash = compute_git_commit_tree_sha256(self.repo_dir, sha)

        mod = LinkedModule(
            module_id="mod_live",
            repo_url=f"file://{self.repo_dir}",
            commit_sha=sha,
            tree_sha256=tree_hash,
            entrypoint_file="main.py",
            timestamp_ms=1000,
        )

        eng = HardenedBitemporalEngine()
        eng.manifest = PublisherManifest(
            video_id="vid_009",
            publisher_id="pub_alpha",
            signed_at=1700000000,
            linked_modules=[mod],
        )
        eng.module_cache = VerifiedModuleCache(cache_root=self.cache_dir)
        eng.module_cache.ingest_all_at_startup(eng.manifest.linked_modules, require_all=True)

        serialized_mods = eng.serialize_linked_modules()
        self.assertEqual(len(serialized_mods), 1)
        self.assertTrue(serialized_mods[0]["available"])

        os.symlink("/etc/passwd", self.cache_dir / "mod_live" / "tamper_link")

        cap = CapabilityToken(token="tok_1", user_id="user_1", tier="paid", issued_at=1.0)
        req = SpawnTabRequest(component_type="FULL_WORKSPACE", replay_from_ms=1000, module_id="mod_live")

        async def _run():
            with patch("app.subprocess.Popen") as mock_popen, \
                 patch.object(eng, "_prepare_sandbox_dir", new=AsyncMock(return_value=(str(self.sandbox_home), "/tmp/s", "/tmp/x"))), \
                 patch.object(eng, "_cleanup_sandbox_xauth", new=AsyncMock()):
                with self.assertRaises(HTTPException) as ctx:
                    await eng.spawn_detached_tab_sandbox(req, cap)
                self.assertEqual(ctx.exception.status_code, 503)
                mock_popen.assert_not_called()

        asyncio.run(_run())
        self.assertEqual(eng.free_display_heap, [101])


if __name__ == "__main__":
    unittest.main()
