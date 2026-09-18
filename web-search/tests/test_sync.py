#!/usr/env python3
"""sync_anysearch 孤儿文件剪枝（_compute_orphans + --prune）回归测试（stdlib unittest）。

不触网、不读写真实密钥、不 git 操作。通过在临时目录构造「vendored 副本」与自定义 ALLOWLIST，
验证 code-review-combo 审计发现 F1 的修复：
  * _compute_orphans 正确识别不在 ALLOWLIST 的本地孤儿文件，且保留 ALLOWLIST / 受保护文件；
  * --prune 时 _apply 实际删除孤儿文件；
  * 默认（无 --prune）时 _apply 不删除孤儿文件（仅报告），向后兼容。

运行：
    uv run --with requests python -m unittest web-search.tests.test_sync -v
    uv run --with requests python -m unittest discover -s web-search/tests -v
"""
import importlib.util
import os
import shutil
import tempfile
import unittest

WEB_SEARCH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYNC_SCRIPT = os.path.join(WEB_SEARCH, "scripts", "sync_anysearch.py")


def _load_sync():
    spec = importlib.util.spec_from_file_location("sync_anysearch_ut", SYNC_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_vendor(allowlist, files):
    """在临时目录按 allowlist 与 files 构造「vendored 副本」骨架。"""
    d = tempfile.mkdtemp()
    for rel in files:
        p = os.path.join(d, rel)
        parent = os.path.dirname(p)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write("x")
    return d


class OrphanComputeTests(unittest.TestCase):
    def test_compute_orphans_detects_extra(self):
        mod = _load_sync()
        d = _make_vendor(
            ["kept.md", "scripts/kept2.py"],
            ["kept.md", "orphan.txt", "scripts/kept2.py", "scripts/orphan2.py"],
        )
        try:
            orphans = mod._compute_orphans(
                d, ["kept.md", "scripts/kept2.py"], mod.PROTECTED_LOCAL_FILES
            )
            self.assertIn("orphan.txt", orphans)
            self.assertIn("scripts/orphan2.py", orphans)
            self.assertNotIn("kept.md", orphans)
            self.assertNotIn("scripts/kept2.py", orphans)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_compute_orphans_keeps_protected(self):
        mod = _load_sync()
        d = _make_vendor(
            ["kept.md"], ["kept.md", ".upstream_version", ".gitattributes", "orphan.txt"]
        )
        try:
            orphans = mod._compute_orphans(d, ["kept.md"], mod.PROTECTED_LOCAL_FILES)
            self.assertIn("orphan.txt", orphans)
            self.assertNotIn(".upstream_version", orphans)
            self.assertNotIn(".gitattributes", orphans)
        finally:
            shutil.rmtree(d, ignore_errors=True)


class OrphanApplyTests(unittest.TestCase):
    def test_apply_prune_deletes_orphan(self):
        mod = _load_sync()
        d = _make_vendor(["kept.md"], ["kept.md", "orphan.txt"])
        mod.ANYSEARCH_DIR = d  # 让 _apply 面向临时目录操作
        mod.VERSION_FILE = os.path.join(d, ".upstream_version")  # 重定向基线文件，避免污染真实副本
        try:
            orphans = mod._compute_orphans(d, ["kept.md"], mod.PROTECTED_LOCAL_FILES)
            failures = mod._apply(
                writes=[], deletes=[], orphans=orphans, ref="main",
                version="v", commit="c", dry_run=False, prune=True, subprocess_run=None,
            )
            self.assertEqual(failures, [])
            self.assertFalse(os.path.exists(os.path.join(d, "orphan.txt")),
                             "孤儿文件应被 --prune 删除")
            self.assertTrue(os.path.exists(os.path.join(d, "kept.md")),
                            "ALLOWLIST 内文件不应被删")
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_apply_no_prune_keeps_orphan(self):
        mod = _load_sync()
        d = _make_vendor(["kept.md"], ["kept.md", "orphan.txt"])
        mod.ANYSEARCH_DIR = d  # 让 _apply 面向临时目录操作
        mod.VERSION_FILE = os.path.join(d, ".upstream_version")  # 重定向基线文件，避免污染真实副本
        try:
            orphans = mod._compute_orphans(d, ["kept.md"], mod.PROTECTED_LOCAL_FILES)
            failures = mod._apply(
                writes=[], deletes=[], orphans=orphans, ref="main",
                version="v", commit="c", dry_run=False, prune=False, subprocess_run=None,
            )
            self.assertEqual(failures, [])
            self.assertTrue(os.path.exists(os.path.join(d, "orphan.txt")),
                            "默认无 --prune 时孤儿文件不应被删除（向后兼容）")
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
