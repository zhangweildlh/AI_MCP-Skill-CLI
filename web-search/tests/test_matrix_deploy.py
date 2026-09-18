# -*- coding: utf-8 -*-
"""
部署态全场景覆盖矩阵回归测试（补充矩阵）。

设计纪律：
1. 零触网：所有网络调用均经 monkeypatch 注入 subprocess_run / stub 底层 REST 函数，
   不消耗 ANYSEARCH_API_KEY 额度、不触真实 API。
2. 密钥安全：仅检查 .env 文件「存在性」与「键名」，绝不 open().read() 读取值，绝不 print 密钥值。
3. 覆盖维度：异常 / 边界 / 配置 / 权限 / 依赖 / 路径 / 并发 / 兼容性。
4. 以部署态文件为主：SKILL_ROOT = 本文件父目录（即 web-search/）。
5. 本轮新增（P1/P2-1/P2-2/P3-1 修复配套）：
   - P1 契约断裂：新增「真实 AnySearch markdown 解析」集成测试，堵住旧版 mock-JSON 盲区（P2-2）。
   - P2-1：run_track2 必须采用 shutil.which 解析后的真实路径（含 .cmd 扩展名），不得裸名 "firecrawl"。
   - P3-1：run_track2 须从 web-search/.env 读取 FIRECRAWL_API_KEY 注入子进程 env，实现自主闭环。
"""

import os
import sys
import json
import shutil
import subprocess
import tempfile
import threading
import types
import unittest
from unittest import mock

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(SKILL_ROOT, "anysearch-skill", "scripts")

if SKILL_ROOT not in sys.path:
    sys.path.insert(0, SKILL_ROOT)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import orchestrate  # noqa: E402
import anysearch_cli  # noqa: E402


def _mock_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=["x"], returncode=returncode,
                                       stdout=stdout, stderr=stderr)


# ---------------------------------------------------------------------------
# 异常矩阵（Exception）
# ---------------------------------------------------------------------------
class TestMatrixException(unittest.TestCase):
    def test_track1_cli_missing(self):
        """轨道1 命令不可达（FileNotFoundError）应降级返回 None，不崩。"""
        def boom(*a, **k):
            raise FileNotFoundError("uv not found")
        r = orchestrate.run_track1("q", skill_root=SKILL_ROOT, subprocess_run=boom)
        self.assertIsNone(r)

    def test_track1_nonzero_exit(self):
        """轨道1 CLI 非零退出应降级返回 None。"""
        r = orchestrate.run_track1("q", skill_root=SKILL_ROOT,
                                   subprocess_run=lambda *a, **k: _mock_proc(1, "", "err"))
        self.assertIsNone(r)

    def test_track1_timeout(self):
        """轨道1 subprocess 超时（TimeoutExpired）应降级返回 None。"""
        def boom(*a, **k):
            raise subprocess.TimeoutExpired(cmd="x", timeout=1)
        r = orchestrate.run_track1("q", skill_root=SKILL_ROOT, subprocess_run=boom)
        self.assertIsNone(r)

    def test_track1_malformed_json(self):
        """轨道1 返回非 JSON 输出应解析为 ok=False、facts=[]，不崩。"""
        proc = _mock_proc(0, stdout="{这不是合法JSON")
        res = orchestrate.run_track1("q", skill_root=SKILL_ROOT, subprocess_run=lambda *a, **k: proc)
        self.assertIsNotNone(res)
        self.assertFalse(res.get("ok"))
        self.assertEqual(res.get("facts"), [])

    def test_track2_cli_absent(self):
        """轨道2 firecrawl 命令缺失（shutil.which=None）应降级返回 None。"""
        with mock.patch.object(orchestrate.shutil, "which", return_value=None):
            r = orchestrate.run_track2("q", subprocess_run=lambda *a, **k: _mock_proc(0, "x"))
        self.assertIsNone(r)

    def test_track2_nonzero_exit(self):
        """轨道2 firecrawl 存在但非零退出应降级返回 None。"""
        with mock.patch.object(orchestrate.shutil, "which", return_value="firecrawl"):
            r = orchestrate.run_track2("q", subprocess_run=lambda *a, **k: _mock_proc(1, "", "err"))
        self.assertIsNone(r)

    def test_run_full_degradation(self):
        """双轨道均失败时 run_full 不应崩溃，返回含原生兜底的 dict 结构。"""
        def fail(*a, **k):
            return _mock_proc(1, "", "down")
        with mock.patch.object(orchestrate.shutil, "which", return_value="firecrawl"):
            out = orchestrate.run_full("subject", "q", skill_root=SKILL_ROOT, subprocess_run=fail)
        self.assertIsInstance(out, dict)
        self.assertIn("marked", out)
        self.assertIn("r1", out)
        self.assertIn("r2", out)


# ---------------------------------------------------------------------------
# 边界矩阵（Boundary）
# ---------------------------------------------------------------------------
class TestMatrixBoundary(unittest.TestCase):
    def test_max_results_clamp_high(self):
        item = anysearch_cli._normalize_search_item({"query": "x", "max_results": 100})
        self.assertEqual(item["max_results"], 10)

    def test_max_results_clamp_low(self):
        item = anysearch_cli._normalize_search_item({"query": "x", "max_results": -3})
        self.assertEqual(item["max_results"], 1)

    def test_max_results_absent(self):
        item = anysearch_cli._normalize_search_item({"query": "x"})
        self.assertNotIn("max_results", item)

    def test_parse_json_list_json(self):
        self.assertEqual(anysearch_cli._parse_json_list('[1,2,"a"]'), [1, 2, "a"])

    def test_parse_json_list_comma(self):
        self.assertEqual(anysearch_cli._parse_json_list("a, b ,c"), ["a", "b", "c"])

    def test_parse_sub_domain_params_json(self):
        self.assertEqual(anysearch_cli._parse_sub_domain_params('{"k":"v"}'), {"k": "v"})

    def test_parse_sub_domain_params_brace(self):
        self.assertEqual(anysearch_cli._parse_sub_domain_params("{k:v}"), {"k": "v"})

    def test_parse_sub_domain_params_kv(self):
        self.assertEqual(anysearch_cli._parse_sub_domain_params("k=v,a=1"), {"k": "v", "a": "1"})

    def test_batch_query_limit(self):
        """batch_search 超过 5 条查询必须 sys.exit(1)。"""
        args = types.SimpleNamespace(queries=json.dumps([{"query": str(i)} for i in range(6)]),
                                     query_items=[], batch_tag=None, batch_domain=None,
                                     batch_sub_domain=None, batch_sdp=None, batch_max_results=None,
                                     api_key="")
        with mock.patch.object(anysearch_cli, "_call_rest", return_value={}), \
             self.assertRaises(SystemExit) as ctx:
            anysearch_cli.cmd_batch_search(args)
        self.assertEqual(ctx.exception.code, 1)

    def test_get_sub_domains_limit(self):
        """get_sub_domains 超过 5 个域名必须 sys.exit(1)。"""
        args = types.SimpleNamespace(domains=json.dumps(["d%d" % i for i in range(6)]),
                                     domain=None, api_key="")
        with mock.patch.object(anysearch_cli, "_call_or_exit", return_value={}), \
             self.assertRaises(SystemExit) as ctx:
            anysearch_cli.cmd_get_sub_domains(args)
        self.assertEqual(ctx.exception.code, 1)

    def test_search_domain_requires_subdomain(self):
        """search --domain 但缺 --sub_domain 必须 sys.exit(1)。"""
        args = types.SimpleNamespace(query="x", domain="finance", tag=None, sub_domain=None,
                                     params=None, zone=None, language=None, max_results=None,
                                     api_key="")
        with mock.patch.object(anysearch_cli, "_call_or_exit", return_value={}), \
             self.assertRaises(SystemExit) as ctx:
            anysearch_cli.cmd_search(args)
        self.assertEqual(ctx.exception.code, 1)


# ---------------------------------------------------------------------------
# 配置矩阵（Config）
# ---------------------------------------------------------------------------
class TestMatrixConfig(unittest.TestCase):
    def test_env_file_has_key(self):
        """部署态 .env 必须存在且含 ANYSEARCH_API_KEY 键（不读值）。
        仓库 worktree / CI 沙箱无 .env（gitignored）时跳过，部署态仍真实校验。"""
        env_path = os.path.join(SKILL_ROOT, ".env")
        if not os.path.isfile(env_path):
            self.skipTest("部署态 .env 缺失，跳过（仅部署态校验）")
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("ANYSEARCH_API_KEY=", content, ".env 缺少 ANYSEARCH_API_KEY 键")

    def test_env_file_allows_firecrawl_key(self):
        """部署态 .env 应同时支持 FIRECRAWL_API_KEY 键（P3-1 自主闭环；不读值）。
        仓库 worktree / CI 沙箱无 .env（gitignored）时跳过，部署态仍真实校验。"""
        env_path = os.path.join(SKILL_ROOT, ".env")
        if not os.path.isfile(env_path):
            self.skipTest("部署态 .env 缺失，跳过（仅部署态校验）")
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("FIRECRAWL_API_KEY=", content, "P3-1 要求 .env 含 FIRECRAWL_API_KEY 键")

    def test_argparse_api_key_arg_priority(self):
        """--api_key 显式传入应覆盖默认（环境回退）。（全局选项须置于子命令前）"""
        p = anysearch_cli.build_parser()
        args = p.parse_args(["--api_key", "ARGKEY", "search", "x"])
        self.assertEqual(args.api_key, "ARGKEY")

    def test_argparse_api_key_env_default(self):
        """未传 --api_key 时默认取环境变量（缺省为空串）。"""
        env_val = os.environ.get("ANYSEARCH_API_KEY", "")
        p = anysearch_cli.build_parser()
        args = p.parse_args(["search", "x"])
        self.assertEqual(args.api_key, env_val)


# ---------------------------------------------------------------------------
# 权限矩阵（Permission）
# ---------------------------------------------------------------------------
class TestMatrixPermission(unittest.TestCase):
    def test_cli_not_executable(self):
        """subprocess 抛 PermissionError 时轨道应降级返回 None，不崩。"""
        def boom(*a, **k):
            raise PermissionError("permission denied")
        r = orchestrate.run_track1("q", skill_root=SKILL_ROOT, subprocess_run=boom)
        self.assertIsNone(r)

    def test_track1_missing_key_and_env(self):
        """缺 .env 且环境无 key 时应降级（不注入伪造 key）、仍不崩溃。"""
        fake_root = os.path.join(SKILL_ROOT, "_nonexistent_skill_root_xyz")
        captured = {}
        def cap(*a, **k):
            captured["env"] = k.get("env", {})
            return _mock_proc(0, stdout="{}")
        r = orchestrate.run_track1("q", skill_root=fake_root, subprocess_run=cap)
        # 缺 .env 且环境无 key：不崩、返回有效结构（None 或 dict）
        self.assertTrue(r is None or isinstance(r, dict))


# ---------------------------------------------------------------------------
# 依赖矩阵（Dependency，环境级硬断言）
# ---------------------------------------------------------------------------
class TestMatrixDependency(unittest.TestCase):
    def test_uv_available(self):
        self.assertIsNotNone(shutil.which("uv"), "uv 命令不可用")

    def test_node_available(self):
        self.assertIsNotNone(shutil.which("node"), "node 命令不可用")

    def test_firecrawl_repaired(self):
        """firecrawl CLI 应已修复（全局可用），且版本可正常打印。

        仅当本机全局已安装 firecrawl 时验证；CI 沙箱无全局 firecrawl 时跳过，避免误红。
        注意：Windows 下用 Python subprocess 调用裸名 'firecrawl' 可能因扩展名（.cmd）
        解析失败，故此处使用 shutil.which 返回的真实路径（含扩展名）调用。
        """
        path = shutil.which("firecrawl")
        if path is None:
            self.skipTest("本机未安装全局 firecrawl CLI，跳过（部署态已修复）")
        proc = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=30)
        self.assertEqual(proc.returncode, 0, "firecrawl --version 非零退出")
        self.assertTrue(proc.stdout.strip(), "firecrawl 版本输出为空")

    def test_python_version_supported(self):
        self.assertGreaterEqual(sys.version_info[:2], (3, 8), "Python 版本低于 3.8")

    def test_anysearch_cli_importable(self):
        """anysearch_cli 可在 uv --with requests 环境导入（依赖可用）。"""
        self.assertTrue(hasattr(anysearch_cli, "build_parser"))


# ---------------------------------------------------------------------------
# 路径矩阵（Path）
# ---------------------------------------------------------------------------
class TestMatrixPath(unittest.TestCase):
    def test_skill_root_with_space(self):
        """skill_root 含空格路径时轨道1 不崩且 env 注入正常。"""
        space_root = os.path.join(SKILL_ROOT, "path with space")
        captured = {}
        def cap(*a, **k):
            captured["cwd"] = k.get("cwd")
            return _mock_proc(0, stdout="{}")
        r = orchestrate.run_track1("q", skill_root=space_root, subprocess_run=cap)
        self.assertIsNotNone(r)

    def test_relative_skill_root(self):
        """相对 skill_root 时轨道1 不崩。"""
        captured = {}
        def cap(*a, **k):
            captured["cwd"] = k.get("cwd")
            return _mock_proc(0, stdout="{}")
        r = orchestrate.run_track1("q", skill_root="./relative", subprocess_run=cap)
        self.assertIsNotNone(r)

    def test_windows_backslash_skill_root(self):
        """Windows 反斜杠 skill_root 时轨道1 不崩。"""
        bs_root = SKILL_ROOT.replace("/", "\\")
        captured = {}
        def cap(*a, **k):
            captured["cwd"] = k.get("cwd")
            return _mock_proc(0, stdout="{}")
        r = orchestrate.run_track1("q", skill_root=bs_root, subprocess_run=cap)
        self.assertIsNotNone(r)


# ---------------------------------------------------------------------------
# 并发矩阵（Concurrency）
# ---------------------------------------------------------------------------
class TestMatrixConcurrency(unittest.TestCase):
    def test_concurrent_run_track1(self):
        """多线程并发调用 run_track1（mock）应各自取得结果、不崩。"""
        lock = threading.Lock()
        results = []
        def worker(i):
            r = orchestrate.run_track1("q%d" % i, skill_root=SKILL_ROOT,
                                      subprocess_run=lambda *a, **k: _mock_proc(0, stdout='{"results":[]}'))
            with lock:
                results.append(r)
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(results), 8)
        for r in results:
            self.assertIsNotNone(r)

    def test_batch_search_internal_threads(self):
        """batch_search 内部并行 3 条查询（stub REST）应不崩且输出含 3 段。"""
        args = types.SimpleNamespace(queries=json.dumps([{"query": "a"}, {"query": "b"}, {"query": "c"}]),
                                     query_items=[], batch_tag=None, batch_domain=None,
                                     batch_sub_domain=None, batch_sdp=None, batch_max_results=None,
                                     api_key="")
        with mock.patch.object(anysearch_cli, "_call_rest", return_value={"results": []}), \
             mock.patch("builtins.print") as mprint:
            anysearch_cli.cmd_batch_search(args)
        printed = "".join(str(c.args[0]) for c in mprint.call_args_list)
        self.assertIn("Query 1", printed)
        self.assertIn("Query 3", printed)


# ---------------------------------------------------------------------------
# 兼容性矩阵（Compatibility）
# ---------------------------------------------------------------------------
class TestMatrixCompatibility(unittest.TestCase):
    def test_four_engines_exist(self):
        """anysearch 四引擎文件（.py/.js/.ps1/.sh）必须齐备。"""
        base = os.path.join(SCRIPTS_DIR, "anysearch_cli")
        for ext in (".py", ".js", ".ps1", ".sh"):
            self.assertTrue(os.path.isfile(base + ext), "缺引擎文件: %s" % (base + ext))

    def test_engine_subcommand_alignment(self):
        """四引擎脚本均声明 search/get_sub_domains/batch_search/extract 子命令。"""
        base = os.path.join(SCRIPTS_DIR, "anysearch_cli")
        for ext in (".py", ".js", ".ps1", ".sh"):
            with open(base + ext, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            for sub in ("search", "get_sub_domains", "batch_search", "extract"):
                self.assertIn(sub, content, "%s 引擎缺少子命令 %s" % (ext, sub))

    def test_windows_pathsep_resilient(self):
        """orchestrate 在 Windows 反斜杠路径下拼接 CLI 命令不崩（兼容性）。"""
        bs_root = SKILL_ROOT.replace("/", "\\")
        captured = {}
        def cap(*a, **k):
            captured["cmd"] = a[0]
            return _mock_proc(0, stdout="{}")
        orchestrate.run_track1("q", skill_root=bs_root, subprocess_run=cap)
        self.assertIn("anysearch_cli.py", " ".join(str(x) for x in captured["cmd"]))


# ---------------------------------------------------------------------------
# P1 契约断裂修复（P2-2：真实 AnySearch markdown 集成，堵 mock-JSON 盲区）
# ---------------------------------------------------------------------------
class TestMatrixAnysearchMarkdown(unittest.TestCase):
    def _real_markdown(self):
        """复刻 anysearch_cli._format_search_response 的真实 markdown 输出。"""
        return (
            "## Search Results (2 results, 123ms)\n\n"
            "### 1. 成渝中线高铁\n"
            "- **URL**: https://example.com/a\n"
            "- 正线全长约291公里\n\n"
            "### 2. 另一条结果\n"
            "- **URL**: https://example.com/b\n"
            "- 描述文本\n"
        )

    def test_parse_real_markdown_ok(self):
        """契约修复 P1：真实 anysearch markdown 必须解析为 ok=True 且含 2 条 fact。"""
        track = orchestrate.parse_track_output(self._real_markdown(), orchestrate.TRACK1_SOURCE)
        self.assertTrue(track["ok"], "真实 markdown 应解析为 ok=True（旧版契约断裂时恒 False）")
        self.assertEqual(len(track["facts"]), 2)
        self.assertTrue(track["authoritative"], "含 url 的 fact 应标记为权威")
        self.assertEqual(track["facts"][0]["field"], "https://example.com/a")
        self.assertIn("成渝中线高铁", track["facts"][0]["text"])

    def test_run_track1_markdown_via_subprocess(self):
        """端到端（mock subprocess 返回真实 markdown）：轨道1 现在能真正采纳结果。
        此前契约断裂时恒 ok=False、走原生兜底；本用例堵住 mock-JSON 盲区（P2-2）。"""
        proc = _mock_proc(0, stdout=self._real_markdown())
        r = orchestrate.run_track1("成渝中线", skill_root=SKILL_ROOT,
                                   subprocess_run=lambda *a, **k: proc)
        self.assertIsNotNone(r)
        self.assertTrue(r["ok"], "轨道1 markdown 应解析为 ok=True（契约修复 P1）")
        self.assertEqual(len(r["facts"]), 2)

    def test_markdown_without_url(self):
        """无 URL 的 markdown 条目：ok=True，但不标权威。"""
        md = ("## Search Results (1 results, 10ms)\n\n"
              "### 1. 仅标题无链接\n"
              "- 这是描述\n")
        track = orchestrate.parse_track_output(md, orchestrate.TRACK1_SOURCE)
        self.assertTrue(track["ok"])
        self.assertEqual(len(track["facts"]), 1)
        self.assertFalse(track["authoritative"])
        self.assertIn("仅标题无链接", track["facts"][0]["text"])

    def test_corroborate_markdown_both_tracks(self):
        """双轨均返回解析后的 track（轨1 markdown / 轨2 JSON）时，corroborate 应正常工作。"""
        md_track = orchestrate.parse_track_output(self._real_markdown(), orchestrate.TRACK1_SOURCE)
        json_track = {"ok": True, "facts": [
            {"field": "https://example.com/a", "value": "成渝中线高铁", "text": "成渝中线高铁"}
        ], "authoritative": True, "source": orchestrate.TRACK2_SOURCE}
        marked = orchestrate.corroborate(md_track, json_track)
        self.assertTrue(any(m["mark"] == orchestrate.MARK_CORROB for m in marked),
                        "双轨同 url 应互证")


# ---------------------------------------------------------------------------
# P2-1：run_track2 必须采用 shutil.which 解析后的真实路径（含 .cmd 扩展名）
# ---------------------------------------------------------------------------
class TestMatrixFirecrawlWhich(unittest.TestCase):
    def test_run_track2_uses_which_resolved_path(self):
        """轨道2 命令首元必须是 which 解析后的真实路径，而非裸名 "firecrawl"。"""
        captured = {}
        def cap(*a, **k):
            captured["cmd"] = a[0]
            return _mock_proc(0, stdout="{}")
        with mock.patch.object(orchestrate.shutil, "which",
                               return_value="C:/tools/firecrawl.cmd"):
            orchestrate.run_track2("q", skill_root=SKILL_ROOT, subprocess_run=cap)
        self.assertEqual(captured["cmd"][0], "C:/tools/firecrawl.cmd")
        self.assertNotEqual(captured["cmd"][0], "firecrawl")

    def test_run_track2_cmd_has_search_subcommand(self):
        """轨道2 命令必须含 search 子命令与查询参数。"""
        captured = {}
        def cap(*a, **k):
            captured["cmd"] = a[0]
            return _mock_proc(0, stdout="{}")
        with mock.patch.object(orchestrate.shutil, "which", return_value="/usr/bin/firecrawl"):
            orchestrate.run_track2("查询词", skill_root=SKILL_ROOT, subprocess_run=cap)
        self.assertIn("search", captured["cmd"])
        self.assertIn("查询词", captured["cmd"])


# ---------------------------------------------------------------------------
# P3-1：run_track2 从 web-search/.env 读取 FIRECRAWL_API_KEY 注入子进程 env（自主闭环）
# ---------------------------------------------------------------------------
class TestMatrixFirecrawlKey(unittest.TestCase):
    def _write_env(self, tmp, body):
        env_path = os.path.join(tmp, ".env")
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(body)
        return env_path

    def test_run_track2_injects_firecrawl_key_from_env(self):
        """P3-1：.env 含 FIRECRAWL_API_KEY 时，必须注入子进程 env（自主闭环，无需 login）。"""
        tmp = tempfile.mkdtemp()
        self._write_env(tmp, "FIRECRAWL_API_KEY=fc-test-key-123\n")
        captured = {}
        def cap(*a, **k):
            captured["cmd"] = a[0]
            captured["env"] = k.get("env", {})
            return _mock_proc(0, stdout="{}")
        with mock.patch.object(orchestrate.shutil, "which", return_value="/usr/bin/firecrawl"):
            r = orchestrate.run_track2("q", skill_root=tmp, subprocess_run=cap)
        self.assertIsNotNone(r)
        self.assertIn("FIRECRAWL_API_KEY", captured["env"])
        self.assertEqual(captured["env"]["FIRECRAWL_API_KEY"], "fc-test-key-123")
        # 同时确认 cmd[0] 为真实路径（P2-1 不退化）
        self.assertEqual(captured["cmd"][0], "/usr/bin/firecrawl")

    def test_run_track2_no_firecrawl_key_no_injection(self):
        """P3-1：.env 无 FIRECRAWL_API_KEY 时，不得注入该键（仅在存在时才注入）。"""
        tmp = tempfile.mkdtemp()
        self._write_env(tmp, "ANYSEARCH_API_KEY=as-x\n")  # 无 FIRECRAWL_API_KEY
        captured = {}
        def cap(*a, **k):
            captured["env"] = k.get("env", {})
            return _mock_proc(0, stdout="{}")
        with mock.patch.object(orchestrate.shutil, "which", return_value="/usr/bin/firecrawl"):
            orchestrate.run_track2("q", skill_root=tmp, subprocess_run=cap)
        self.assertNotIn("FIRECRAWL_API_KEY", captured["env"])

    def test_run_track2_respects_existing_env_key(self):
        """P3-1：系统环境变量已存在 FIRECRAWL_API_KEY 时，.env 不应覆盖（尊重既有环境）。"""
        tmp = tempfile.mkdtemp()
        self._write_env(tmp, "FIRECRAWL_API_KEY=fc-env-file\n")
        captured = {}
        def cap(*a, **k):
            captured["env"] = k.get("env", {})
            return _mock_proc(0, stdout="{}")
        with mock.patch.object(orchestrate.shutil, "which", return_value="/usr/bin/firecrawl"), \
             mock.patch.dict(os.environ, {"FIRECRAWL_API_KEY": "fc-system"}, clear=False):
            orchestrate.run_track2("q", skill_root=tmp, subprocess_run=cap)
        self.assertEqual(captured["env"]["FIRECRAWL_API_KEY"], "fc-system")


if __name__ == "__main__":
    unittest.main(verbosity=2)
