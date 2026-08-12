#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""anysearch_cli.py 全场景 + 边界回归测试（标准库 unittest，无真实网络）。

覆盖内容（对应修复编号）：
  ① constants.json 内容断言
  ② AVAILABLE_DOMAINS 在常量缺失时的兜底非空（F1）
  ③ _parse_sub_domain_params 的 JSON / {k:v} / k=v 三分支（含 F7 去引号）
  ④ _repair_json / _repair_json_object / _split_json_items 典型与边界
  ⑤ _call_api 错误分支（HTTPError / ConnectionError / Timeout / 200 非 JSON，F2）
  ⑥ cmd_search / cmd_batch_search 的 max_results 下限校验（F6）
  ⑦ _load_env 仅注入 allowlist key（F3，用临时 .env，测完清理）
  ⑧ _build_headers 带/不带 api_key 行为

运行：
  python -m unittest scripts.smoke.test_anysearch_cli -v
  或（在仓库根目录）：python -m unittest discover -s scripts/smoke
"""

import argparse
import json
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

# 若运行环境未安装 requests（如 externally managed 的 uv 环境），注入轻量桩模块，
# 使 anysearch_cli 可导入；测试仅 mock requests.post，不依赖真实实现。
# 若环境已安装真实 requests，则保持原样（桩不覆盖）。
if "requests" not in sys.modules:
    _req = types.ModuleType("requests")
    _exc = types.ModuleType("requests.exceptions")

    # 使用与真实 requests 一致的「区分的独立异常类」，避免 Timeout/ConnectionError
    # 被 HTTPError 分支误捕获（桩里若都用 Exception 会触发该问题）。
    class _HTTPError(Exception):
        pass

    class _ConnectionError(Exception):
        pass

    class _Timeout(Exception):
        pass

    _exc.HTTPError = _HTTPError
    _exc.ConnectionError = _ConnectionError
    _exc.Timeout = _Timeout
    _req.exceptions = _exc
    _req.post = lambda *a, **k: None  # 测试中统一 mock 覆盖
    sys.modules["requests"] = _req

# 将 scripts/ 加入 sys.path，便于直接 import 被测模块（不依赖包结构）。
_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

import anysearch_cli  # noqa: E402


CONSTANTS_PATH = os.path.join(_SCRIPTS_DIR, "shared", "constants.json")


class TestConstantsFile(unittest.TestCase):
    """① constants.json 内容断言。"""

    def test_constants_json_content(self):
        # 直接读取并解析 constants.json
        with open(CONSTANTS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        # available_domains 非空
        self.assertIsInstance(data.get("available_domains"), list)
        self.assertTrue(len(data["available_domains"]) > 0)
        # endpoint 已设且为合法 http(s) URL
        endpoint = data.get("endpoint", "")
        self.assertTrue(endpoint.startswith("http"))
        # client_version 为合法字符串
        cv = data.get("client_version", "")
        self.assertIsInstance(cv, str)
        self.assertTrue(len(cv) > 0)


class TestAvailableDomainsFallback(unittest.TestCase):
    """② AVAILABLE_DOMAINS 兜底非空（F1）。"""

    def test_module_available_domains_nonempty(self):
        # 真实模块在导入时已从 constants.json 加载；断言非空。
        self.assertIsInstance(anysearch_cli.AVAILABLE_DOMAINS, list)
        self.assertTrue(len(anysearch_cli.AVAILABLE_DOMAINS) > 0)

    def test_get_constants_fallback(self):
        # F1 修复：_get_constants 在 open 抛异常时回退到 SAFE_DOMAINS，且非空。
        with mock.patch.object(anysearch_cli, "open", side_effect=OSError("boom")):
            c = anysearch_cli._get_constants()
        self.assertIn("available_domains", c)
        self.assertTrue(len(c["available_domains"]) > 0)
        self.assertEqual(c["available_domains"], anysearch_cli.SAFE_DOMAINS)


class TestParseSubDomainParams(unittest.TestCase):
    """③ _parse_sub_domain_params 三分支（含 F7 去引号）。"""

    def test_json_branch(self):
        val = '{"type":"stock","symbol":"AAPL"}'
        self.assertEqual(
            anysearch_cli._parse_sub_domain_params(val),
            {"type": "stock", "symbol": "AAPL"},
        )

    def test_curly_kv_branch(self):
        # PowerShell 会剥离 JSON 内引号，得到 {key:value} 形态
        val = "{type:stock,symbol:AAPL}"
        self.assertEqual(
            anysearch_cli._parse_sub_domain_params(val),
            {"type": "stock", "symbol": "AAPL"},
        )

    def test_equals_kv_branch(self):
        val = "type=stock,symbol=AAPL"
        self.assertEqual(
            anysearch_cli._parse_sub_domain_params(val),
            {"type": "stock", "symbol": "AAPL"},
        )

    def test_f7_quote_stripping(self):
        # F7 修复：k=v 分支应去除值两侧引号
        val = "type='stock',symbol=\"AAPL\""
        self.assertEqual(
            anysearch_cli._parse_sub_domain_params(val),
            {"type": "stock", "symbol": "AAPL"},
        )

    def test_empty_returns_none(self):
        self.assertIsNone(anysearch_cli._parse_sub_domain_params(""))
        self.assertIsNone(anysearch_cli._parse_sub_domain_params(None))


class TestRepairJson(unittest.TestCase):
    """④ _repair_json / _repair_json_object / _split_json_items 典型与边界。"""

    def test_split_json_items_simple(self):
        # 两个平铺对象
        items = anysearch_cli._split_json_items('{"a":1},{"b":2}')
        self.assertEqual(len(items), 2)
        self.assertIn('{"a":1}', items[0])
        self.assertIn('{"b":2}', items[1])

    def test_split_json_items_nested(self):
        # 嵌套对象内的逗号不应被误拆
        items = anysearch_cli._split_json_items('{"a":{"x":1}}')
        self.assertEqual(len(items), 1)
        self.assertIn('{"a":{"x":1}}', items[0])

    def test_repair_json_empty(self):
        # 空串：既非 { 也非 [ 开头，回退为单条空 query（既有稳定行为）。
        self.assertEqual(anysearch_cli._repair_json(""), [{"query": ""}])

    def test_repair_json_single_object(self):
        out = anysearch_cli._repair_json('{"query":"AAPL"}')
        self.assertEqual(out, [{"query": "AAPL"}])

    def test_repair_json_multiple_objects(self):
        out = anysearch_cli._repair_json('{"query":"AAPL"},{"query":"GOOG"}')
        self.assertEqual(out, [{"query": "AAPL"}, {"query": "GOOG"}])

    def test_repair_json_nested_object(self):
        # 嵌套 sub_domain_params
        raw = '{"query":"AAPL","params":{"type":"stock"}}'
        out = anysearch_cli._repair_json(raw)
        self.assertEqual(out, [{"query": "AAPL", "params": {"type": "stock"}}])

    def test_repair_json_object_basic(self):
        obj = anysearch_cli._repair_json_object('query: AAPL')
        self.assertEqual(obj, {"query": "AAPL"})

    def test_repair_json_object_bool_null(self):
        obj = anysearch_cli._repair_json_object("flag: true, note: null")
        self.assertEqual(obj, {"flag": True, "note": None})

    def test_repair_json_object_nested(self):
        obj = anysearch_cli._repair_json_object("outer: {inner: 1}")
        self.assertEqual(obj, {"outer": {"inner": 1}})


class TestCallApiErrors(unittest.TestCase):
    """⑤ _call_api 错误分支（F2：200 非 JSON 容错等）。"""

    def _make_resp(self, **kwargs):
        resp = mock.Mock()
        for k, v in kwargs.items():
            setattr(resp, k, v)
        return resp

    def test_http_error(self):
        resp = self._make_resp(
            raise_for_status=mock.Mock(
                side_effect=anysearch_cli.requests.exceptions.HTTPError("500")
            ),
            json=mock.Mock(side_effect=ValueError()),
            text="",
        )
        with mock.patch.object(anysearch_cli.requests, "post", return_value=resp):
            with self.assertRaises(SystemExit):
                anysearch_cli._call_api("search", {"query": "x"}, "")

    def test_connection_error(self):
        with mock.patch.object(
            anysearch_cli.requests,
            "post",
            side_effect=anysearch_cli.requests.exceptions.ConnectionError(),
        ):
            with self.assertRaises(SystemExit):
                anysearch_cli._call_api("search", {"query": "x"}, "")

    def test_timeout(self):
        with mock.patch.object(
            anysearch_cli.requests,
            "post",
            side_effect=anysearch_cli.requests.exceptions.Timeout(),
        ):
            with self.assertRaises(SystemExit):
                anysearch_cli._call_api("search", {"query": "x"}, "")

    def test_200_non_json_f2(self):
        # F2 修复：HTTP 200 但响应体非合法 JSON 时，应捕获 JSONDecodeError 并 exit。
        resp = self._make_resp(
            raise_for_status=mock.Mock(),
            json=mock.Mock(side_effect=json.JSONDecodeError("bad", "", 0)),
            text="<html>proxy error</html>",
        )
        with mock.patch.object(anysearch_cli.requests, "post", return_value=resp):
            with self.assertRaises(SystemExit):
                anysearch_cli._call_api("search", {"query": "x"}, "")


class TestMaxResultsValidation(unittest.TestCase):
    """⑥ cmd_search / cmd_batch_search 的 max_results 下限校验（F6）。"""

    def test_cmd_search_zero(self):
        args = argparse.Namespace(
            query="x", domain=None, sub_domain=None,
            sub_domain_params=None, max_results=0, api_key="",
        )
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_search(args)

    def test_cmd_search_negative(self):
        args = argparse.Namespace(
            query="x", domain=None, sub_domain=None,
            sub_domain_params=None, max_results=-3, api_key="",
        )
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_search(args)

    def test_cmd_search_valid(self):
        # 合法值不应触发 exit（mock 掉 _call_api 避免真实网络）
        args = argparse.Namespace(
            query="x", domain=None, sub_domain=None,
            sub_domain_params=None, max_results=5, api_key="",
        )
        with mock.patch.object(anysearch_cli, "_call_api", return_value="ok") as m:
            anysearch_cli.cmd_search(args)
            m.assert_called_once()
            self.assertEqual(m.call_args.args[1]["max_results"], 5)

    def test_cmd_batch_search_zero(self):
        args = argparse.Namespace(
            query_items=["AAPL"], queries=None, queries_opt=None,
            batch_domain=None, batch_sub_domain=None, batch_sdp=None,
            batch_max_results=0, api_key="",
        )
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_batch_search(args)

    def test_cmd_batch_search_negative(self):
        args = argparse.Namespace(
            query_items=["AAPL"], queries=None, queries_opt=None,
            batch_domain=None, batch_sub_domain=None, batch_sdp=None,
            batch_max_results=-1, api_key="",
        )
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_batch_search(args)


class TestLoadEnvAllowlist(unittest.TestCase):
    """⑦ _load_env 仅注入 allowlist key（F3）。"""

    def test_only_allowlist_injected(self):
        content = (
            "PATH=/usr/bin/fake\n"
            "ANYSEARCH_API_KEY=testkey123\n"
            "# 注释行\n"
            "FOO=should_not_be_injected\n"
        )
        tmp = tempfile.mkdtemp()
        try:
            old_api = os.environ.pop("ANYSEARCH_API_KEY", None)
            old_path = os.environ.get("PATH")
            try:
                # 用 mock 让 _load_env 读取临时 .env（避免污染真实 .env）：
                # - dirname/abspath 返回临时目录，使脚本定位到临时 .env
                # - isfile 恒为 True，open 忽略路径读入 content
                mopen = mock.mock_open(read_data=content)
                with mock.patch("builtins.open", mopen), \
                     mock.patch.object(anysearch_cli.os.path, "dirname", return_value=tmp), \
                     mock.patch.object(anysearch_cli.os.path, "abspath", return_value=tmp), \
                     mock.patch.object(anysearch_cli.os.path, "isfile", return_value=True):
                    anysearch_cli._load_env()
                # 白名单键被注入
                self.assertEqual(os.environ.get("ANYSEARCH_API_KEY"), "testkey123")
                # PATH 不应被 .env 覆盖（仅白名单注入）
                self.assertEqual(os.environ.get("PATH"), old_path)
                # 非白名单键未注入
                self.assertNotIn("FOO", os.environ)
            finally:
                if old_api is not None:
                    os.environ["ANYSEARCH_API_KEY"] = old_api
                os.environ.pop("ANYSEARCH_API_KEY", None)
        finally:
            # 清理临时目录
            try:
                os.rmdir(tmp)
            except OSError:
                pass


class TestBuildHeaders(unittest.TestCase):
    """⑧ _build_headers 带/不带 api_key 行为。"""

    def test_without_api_key(self):
        h = anysearch_cli._build_headers("")
        self.assertNotIn("Authorization", h)
        self.assertEqual(h["Content-Type"], "application/json")
        self.assertIn("X-Anysearch-Client", h)

    def test_with_api_key(self):
        h = anysearch_cli._build_headers("secret")
        self.assertEqual(h.get("Authorization"), "Bearer secret")


class TestRenderDocMissingKeyFallback(unittest.TestCase):
    """N1 修复：constants.json 合法但缺 available_domains 键时，
    _render_doc 应回退 SAFE_DOMAINS 而非抛 KeyError。"""

    def test_render_doc_missing_available_domains(self):
        with mock.patch.object(
            anysearch_cli, "_get_constants", return_value={"endpoint": "https://example"}
        ):
            out = anysearch_cli._render_doc()
        self.assertIsInstance(out, str)
        self.assertTrue(len(out) > 0)
        # 回退域名应已渲染进模板（SAFE_DOMAINS 非空），证明未走崩溃路径
        self.assertIn(anysearch_cli.SAFE_DOMAINS[0], out)


class TestBatchPerItemMaxResults(unittest.TestCase):
    """N2 修复：batch_search 内每条 query item 自带的 max_results 也须落在 [1,10]。"""

    def _make_args(self, queries_json):
        return argparse.Namespace(
            query_items=[], queries=queries_json, queries_opt=None,
            batch_domain=None, batch_sub_domain=None, batch_sdp=None,
            batch_max_results=None, api_key="",
        )

    def test_per_item_zero_exits(self):
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_batch_search(
                self._make_args('[{"query":"x","max_results":0}]')
            )

    def test_per_item_negative_exits(self):
        with self.assertRaises(SystemExit):
            anysearch_cli.cmd_batch_search(
                self._make_args('[{"query":"x","max_results":-2}]')
            )

    def test_per_item_valid_ok(self):
        with mock.patch.object(anysearch_cli, "_call_api", return_value="ok") as m:
            anysearch_cli.cmd_batch_search(
                self._make_args('[{"query":"x","max_results":5}]')
            )
            m.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
