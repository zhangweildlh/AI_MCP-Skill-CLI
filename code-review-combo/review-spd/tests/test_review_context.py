#!/usr/bin/env python3
"""
L2 契约测试：review-context.py (code-review-combo / review-spd)

这些测试在临时目录中构建「用完即弃」的 git 仓库，以子进程方式调用
review-context.py，并断言其产出的 Markdown 契约。它们锁定了：

- C-1 修复（--path 子目录收敛）的回归保护
- 非 git 目录的报错契约（rc=1 + 固定错误信息）
- 三种收集模式（uncommitted / commit-range / branch）的基本契约

运行：在 review-spd/ 目录下执行 `uv run python tests/test_review_context.py`
（无依赖，纯标准库即可运行）。
"""

import datetime
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "review-context.py"


def run_script(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """在 `repo` 内运行脚本，返回 CompletedProcess。"""
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=str(repo),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def git(repo: Path, *args: str) -> str:
    """在 `repo` 内执行 git 命令，失败即抛。"""
    return subprocess.run(
        ["git", *args],
        cwd=str(repo),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    ).stdout.strip()


def make_repo() -> Path:
    """创建一个最小、配置完整的临时 git 仓库（默认分支 main）。"""
    repo = Path(tempfile.mkdtemp(prefix="rc-ctx-"))
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.name", "Test")
    git(repo, "config", "user.email", "test@example.com")
    git(repo, "config", "commit.gpgsign", "false")
    return repo


def write(repo: Path, rel: str, content: str) -> None:
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def write_bytes(repo: Path, rel: str, data: bytes) -> None:
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def commit_file(repo: Path, rel: str, content: str, *, date: str | None = None,
                message: str = "c") -> None:
    """Write `rel`, stage everything, and commit (optionally back-dated).

    `date` is any git-acceptable date string (e.g. an ISO 8601 timestamp); when
    given it is applied to both author and committer dates so commit-range tests
    can produce commits at controlled points in time.
    """
    write(repo, rel, content)
    env = None
    if date is not None:
        env = {**os.environ, "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
    subprocess.run(
        ["git", "add", "-A"],
        cwd=str(repo), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=True, env=env,
    )
    subprocess.run(
        ["git", "commit", "-q", "-m", message],
        cwd=str(repo), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        check=True, env=env,
    )


class TestUncommitted(unittest.TestCase):
    def test_uncommitted_collects_tracked_change(self):
        repo = make_repo()
        write(repo, "a.txt", "line1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        write(repo, "a.txt", "line1\nline2\n")
        proc = run_script(repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `uncommitted`", proc.stdout)
        self.assertIn("a.txt", proc.stdout)

    def test_uncommitted_includes_untracked(self):
        repo = make_repo()
        write(repo, "init.txt", "x\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        write(repo, "new.txt", "fresh\n")
        proc = run_script(repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("new.txt", proc.stdout)
        self.assertIn("## Untracked Files", proc.stdout)


class TestNonGit(unittest.TestCase):
    def test_non_git_returns_rc1(self):
        d = Path(tempfile.mkdtemp(prefix="rc-nogit-"))
        proc = run_script(d)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("not inside a git repository", proc.stderr)


class TestPathScope(unittest.TestCase):
    """C-1 回归：--path 必须把审查范围收敛到子目录。"""

    def test_path_limits_scope_to_subdir(self):
        repo = make_repo()
        write(repo, "sub/kept.txt", "v1\n")
        write(repo, "other/ignored.txt", "v1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        write(repo, "sub/kept.txt", "v2\n")
        write(repo, "other/ignored.txt", "v2\n")
        proc = run_script(repo, "--path", "sub")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("sub/kept.txt", proc.stdout)
        self.assertNotIn("other/ignored.txt", proc.stdout)

    def test_without_path_scans_whole_repo(self):
        repo = make_repo()
        write(repo, "sub/kept.txt", "v1\n")
        write(repo, "other/ignored.txt", "v1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        write(repo, "sub/kept.txt", "v2\n")
        write(repo, "other/ignored.txt", "v2\n")
        proc = run_script(repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("sub/kept.txt", proc.stdout)
        self.assertIn("other/ignored.txt", proc.stdout)


class TestCommitRange(unittest.TestCase):
    def test_commit_range_collects_commits(self):
        repo = make_repo()
        write(repo, "f.txt", "1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        write(repo, "f.txt", "2\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "feature work")
        proc = run_script(repo, "--since", "1 day ago")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `commit-range`", proc.stdout)
        self.assertIn("feature work", proc.stdout)

    def test_commit_range_only_since_collects(self):
        repo = make_repo()
        commit_file(repo, "f.txt", "1\n", message="init")
        commit_file(repo, "f.txt", "2\n", message="recent work")
        proc = run_script(repo, "--since", "1 day ago")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `commit-range`", proc.stdout)
        self.assertIn("recent work", proc.stdout)

    def test_commit_range_only_until_collects(self):
        repo = make_repo()
        # Back-date a commit so it lands inside [default 3 days ago .. --until 1 day ago].
        when = (datetime.datetime.now() - datetime.timedelta(days=2)).isoformat()
        commit_file(repo, "f.txt", "1\n", date=when, message="old work")
        proc = run_script(repo, "--until", "1 day ago")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `commit-range`", proc.stdout)
        self.assertIn("old work", proc.stdout)

    def test_commit_range_empty_past_range_has_no_changes(self):
        repo = make_repo()
        commit_file(repo, "f.txt", "1\n", message="init")
        proc = run_script(repo, "--since", "10 years ago", "--until", "9 years ago")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `commit-range`", proc.stdout)
        self.assertIn("Has changes: `no`", proc.stdout)


class TestBranch(unittest.TestCase):
    def test_branch_review_collects_diff(self):
        repo = make_repo()
        write(repo, "f.txt", "1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "init")
        git(repo, "checkout", "-q", "-b", "feature")
        write(repo, "f.txt", "2\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "feature work")
        proc = run_script(repo, "--branch", "feature", "--base", "main")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `branch`", proc.stdout)
        self.assertIn("feature work", proc.stdout)

    def test_branch_autodetect_base_without_origin(self):
        # Repo has a local `main` and no `origin/*`; base must fall back to `main`.
        repo = make_repo()
        commit_file(repo, "f.txt", "1\n", message="init")
        git(repo, "checkout", "-q", "-b", "feature")
        commit_file(repo, "f.txt", "2\n", message="feature work")
        proc = run_script(repo, "--branch", "feature")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `branch`", proc.stdout)
        self.assertIn("Base: `main`", proc.stdout)
        self.assertIn("feature work", proc.stdout)

    def test_branch_not_found(self):
        repo = make_repo()
        commit_file(repo, "f.txt", "1\n", message="init")
        proc = run_script(repo, "--branch", "doesnotexist")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("branch/ref not found", proc.stderr)

    def test_base_not_found(self):
        repo = make_repo()
        commit_file(repo, "f.txt", "1\n", message="init")
        git(repo, "checkout", "-q", "-b", "feature")
        commit_file(repo, "f.txt", "2\n", message="feature work")
        proc = run_script(repo, "--branch", "feature", "--base", "nonexistent")
        self.assertEqual(proc.returncode, 1)
        self.assertIn("base ref not found", proc.stderr)


class TestUntrackedBoundaries(unittest.TestCase):
    """Untracked-file diff boundaries: binary and oversized content must be omitted."""

    def test_untracked_binary_omitted(self):
        repo = make_repo()
        commit_file(repo, "init.txt", "x\n", message="init")
        write_bytes(repo, "b.bin", b"abc\x00def")
        proc = run_script(repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("binary content", proc.stdout)
        # The raw binary bytes must not be dumped into the unified diff.
        self.assertNotIn("abc", proc.stdout)

    def test_untracked_large_omitted(self):
        repo = make_repo()
        commit_file(repo, "init.txt", "x\n", message="init")
        write_bytes(repo, "big.bin", b"z" * (200_001))
        proc = run_script(repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("larger than", proc.stdout)
        self.assertIn("200000", proc.stdout)


class TestEmptyRepo(unittest.TestCase):
    """git init + untracked file, but no commits yet (no HEAD)."""

    def test_uncommitted_without_commits_does_not_crash(self):
        repo = make_repo()  # only `git init`; no commit yet
        write(repo, "a.txt", "x\n")
        proc = run_script(repo)
        # Must exit cleanly even though `git diff HEAD` has no HEAD to compare against.
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Mode: `uncommitted`", proc.stdout)
        self.assertIn("a.txt", proc.stdout)
        self.assertIn("Has changes: `yes`", proc.stdout)


class TestPathScopeExtended(unittest.TestCase):
    """Additional --path scoping contracts beyond the C-1 regression pair."""

    def test_nested_subdir_scope(self):
        repo = make_repo()
        commit_file(repo, "sub/deep/x.txt", "v1\n", message="init")
        commit_file(repo, "sub/y.txt", "v1\n", message="init2")
        write(repo, "sub/deep/x.txt", "v2\n")
        write(repo, "sub/y.txt", "v2\n")
        proc = run_script(repo, "--path", "sub/deep")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("sub/deep/x.txt", proc.stdout)
        self.assertNotIn("sub/y.txt", proc.stdout)

    def test_nonexistent_subdir_scope(self):
        repo = make_repo()
        commit_file(repo, "a.txt", "v1\n", message="init")
        write(repo, "a.txt", "v2\n")
        proc = run_script(repo, "--path", "nonexistent")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        # Nothing lives under a non-existent directory, so no repo file appears.
        self.assertNotIn("a.txt", proc.stdout)

    def test_untracked_outside_path_excluded(self):
        repo = make_repo()
        commit_file(repo, "sub/kept.txt", "v1\n", message="init")
        commit_file(repo, "other/ign.txt", "v1\n", message="init2")
        write(repo, "sub/kept.txt", "v2\n")
        write(repo, "other/untracked.txt", "u\n")
        proc = run_script(repo, "--path", "sub")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("sub/kept.txt", proc.stdout)
        self.assertNotIn("other/untracked.txt", proc.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
