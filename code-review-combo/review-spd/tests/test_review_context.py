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


if __name__ == "__main__":
    unittest.main(verbosity=2)
