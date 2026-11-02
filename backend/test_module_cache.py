import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

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

if __name__ == "__main__":
    unittest.main()
