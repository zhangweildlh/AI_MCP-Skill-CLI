#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_anysearch_upstream.py 单元测试（标准库 unittest + mock，无真实网络）。

覆盖 code-review-combo 审计发现（2026-08-18）：
  - medium bug 修复：gh 获取上游状态失败时，不得误判为"上游有更新"，
    须分流为独立 UNKNOWN 态（exit 2），而非 exit 1。
  - low other 修复：stdout 全部 ASCII（[OK]/[WARN]/[HINT]），无 emoji。
  - low test：补齐 blob 级逻辑 + gh 失败分支 + git_blob 计算的自动化测试。

运行：
  python -m unittest scripts.smoke.test_check_anysearch_upstream -v
"""

import importlib.util
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCRIPT = os.path.join(REPO_ROOT, "scripts", "check_anysearch_upstream.py")

# 动态加载被测脚本为独立模块（避免作为包导入的副作用）
_spec = importlib.util.spec_from_file_location("check_up", SCRIPT)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def _load_manifest_map():
    with open(mod.MANIFEST, "r", encoding="utf-8") as f:
        m = json.load(f)
    return {i["rel"]: i for i in m["files"]}


_MANIFEST_MAP = _load_manifest_map()


def _rel_from_path(path):
    """从本地工作副本绝对路径解析 rel（与 MANIFEST rel 一致，含 scripts/ 前缀）。"""
    rel_norm = os.path.normpath(path)
    base = os.path.normpath(REPO_ROOT)
    rel = os.path.relpath(rel_norm, base)
    return rel.replace(os.sep, "/")


def _fake_gh_ok(args):
    """模拟 gh 正常：按 rel 返回 MANIFEST.upstream_blob。"""
    api_path = args[1]
    rel = api_path.split("/contents/", 1)[1]
    return _MANIFEST_MAP[rel]["upstream_blob"], None


def _fake_gh_fail(args):
    """模拟 gh 失败（未认证/网络/API 异常）：返回 (None, err)。"""
    return None, "gh: command failed (auth or network)"


class TestCheckUpstream(unittest.TestCase):
    def _run_with(self, gh_side, blob_side):
        with mock.patch.object(mod, "run_gh", side_effect=gh_side), \
             mock.patch.object(mod, "git_blob", side_effect=blob_side):
            buf = io.StringIO()
            with redirect_stdout(buf):
                with self.assertRaises(SystemExit) as cm:
                    mod.main()
            return cm.exception.code, buf.getvalue()

    def test_all_consistent_ok(self):
        """上游 blob 一致 + 本地补丁完好 -> exit 0，输出含 [OK]，无 emoji。"""
        code, out = self._run_with(
            _fake_gh_ok,
            lambda p: _MANIFEST_MAP[_rel_from_path(p)]["patched_local_blob"],
        )
        self.assertEqual(code, 0)
        self.assertIn("[OK]", out)
        self.assertNotIn("⚠", out)
        self.assertNotIn("✅", out)

    def test_upstream_moved_warn(self):
        """上游返回新 blob -> upstream_moved，exit 1，含 [WARN] 上游有更新。"""
        def gh_new(args):
            return "f" * 40, None

        code, out = self._run_with(
            gh_new,
            lambda p: _MANIFEST_MAP[_rel_from_path(p)]["patched_local_blob"],
        )
        self.assertEqual(code, 1)
        self.assertIn("[WARN]", out)
        self.assertIn("上游有更新", out)

    def test_gh_unreachable_unknown(self):
        """gh 失败 -> 不误判上游更新，分流 UNKNOWN，exit 2，含 [HINT] 无法获取上游状态。"""
        code, out = self._run_with(
            _fake_gh_fail,
            lambda p: _MANIFEST_MAP[_rel_from_path(p)]["patched_local_blob"],
        )
        self.assertEqual(code, 2)
        self.assertIn("无法获取上游状态", out)
        self.assertNotIn("上游有更新", out)

    def test_local_drift_warn(self):
        """gh 正常但本地工作副本 blob 与 patched_local_blob 不符 -> 本地漂移，exit 1。"""
        code, out = self._run_with(
            _fake_gh_ok,
            lambda p: "0" * 40,
        )
        self.assertEqual(code, 1)
        self.assertIn("本地补丁漂移", out)

    def test_git_blob_computes(self):
        """git_blob 对真实文件计算非空 40 位 SHA（集成 git hash-object）。"""
        sha = mod.git_blob(mod.MANIFEST)
        self.assertIsInstance(sha, str)
        self.assertEqual(len(sha), 40)


if __name__ == "__main__":
    unittest.main()
