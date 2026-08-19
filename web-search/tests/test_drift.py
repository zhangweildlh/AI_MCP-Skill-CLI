#!/usr/bin/env python3
"""check_upstream_drift 全场景 + 全边界对抗式测试（stdlib unittest）。

模拟 `gh api` 的 subprocess.run 实现，覆盖：正常 / 边界 / 对抗 三类用例。

对抗式测试哲学：
  先假设 check_upstream_drift 有 BUG —— 例如「网络失败时误判 drift」「gh 缺失时崩溃」
  「本地文件缺失时谎报 drift」—— 再用边界/对抗用例断言其**必须**返回 unknown 且不抛异常；
  若某对抗用例「意外通过」说明实现有漏洞，需先自修再交付。本套件交付时全部为绿。

运行（必须走 uv，与 test_full.py / test_fixes.py 一同由 discover 收集）：
    uv run --with requests python -m unittest web-search.tests.test_drift -v
    uv run --with requests python -m unittest discover -s web-search/tests -v

绝不动 web-search/.env 真实密钥，绝不做 git 提交/推送。
"""

import base64
import importlib.util
import io
import json
import os
import tempfile
import unittest
import unittest.mock

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
DRIFT_SCRIPT = os.path.join(WEB_SEARCH, "scripts", "check_upstream_drift.py")


def _load_drift():
    """从文件路径加载被测模块（仓库非包，使用 importlib 显式加载）。"""
    spec = importlib.util.spec_from_file_location("check_upstream_drift_ut", DRIFT_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _write_tmp(content, suffix=".py"):
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(content if isinstance(content, bytes) else content.encode("utf-8"))
    return path


class _FakeProc:
    """模仿 subprocess.CompletedProcess。"""

    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _b64(payload_dict):
    return json.dumps(payload_dict)


# ---------------------------------------------------------------------------
# 可注入的 subprocess.run 替身
# ---------------------------------------------------------------------------

def run_ok_anysearch(local_content):
    """返回与本地内容一致的 anysearch content（用于 ok 场景）。"""

    def _run(cmd, *a, **k):
        if "anysearch" in cmd[2]:
            return _FakeProc(0, _b64({"content": base64.b64encode(local_content).decode()}))
        return _FakeProc(0, _b64({"sha": "up_fc_sha"}))

    return _run


def run_drift_anysearch(local_content):
    """anysearch 上游内容被篡改（与本地不同）-> 预期 drift。"""

    def _run(cmd, *a, **k):
        if "anysearch" in cmd[2]:
            upstream = local_content + b"\n# tampered\n"
            return _FakeProc(0, _b64({"content": base64.b64encode(upstream).decode()}))
        return _FakeProc(0, _b64({"sha": "up_fc_sha"}))

    return _run


def run_ok_firecrawl(recorded_sha):
    """firecrawl 上游 sha == 记录值（用于 ok 场景）。"""

    def _run(cmd, *a, **k):
        if "firecrawl" in cmd[2]:
            return _FakeProc(0, _b64({"sha": recorded_sha}))
        return _FakeProc(0, _b64({"content": base64.b64encode(b"local").decode()}))

    return _run


def run_drift_firecrawl(recorded_sha):
    """firecrawl 上游 sha 与记录值不同 -> 预期 drift。"""

    def _run(cmd, *a, **k):
        if "firecrawl" in cmd[2]:
            return _FakeProc(0, _b64({"sha": "upstream_different_sha"}))
        return _FakeProc(0, _b64({"content": base64.b64encode(b"local").decode()}))

    return _run


def run_gh_missing(cmd, *a, **k):
    """gh 可执行文件不存在 -> FileNotFoundError。"""
    raise FileNotFoundError("gh: command not found")


def run_rc_nonzero(cmd, *a, **k):
    """API 非零返回（如限流 / 404）。"""
    return _FakeProc(1, "", "rate limit / not found")


def run_raises_generic(cmd, *a, **k):
    """网络层异常（如超时、连接失败）。"""
    raise RuntimeError("network unreachable")


def run_bad_json(cmd, *a, **k):
    """gh 返回 rc=0 但 stdout 不是合法 JSON（解析失败）。"""
    return _FakeProc(0, "{not valid json")


def run_no_content_field(cmd, *a, **k):
    """gh 返回 rc=0 但响应里没有预期字段。"""
    if "anysearch" in cmd[2]:
        return _FakeProc(0, _b64({"name": "anysearch_cli.py"}))  # 无 content
    return _FakeProc(0, _b64({"name": "openapi.json"}))  # 无 sha


# ===========================================================================
# 测试用例
# ===========================================================================

class Sha256FileTests(unittest.TestCase):
    """sha256_file 单测。"""

    def test_sha256_file_present(self):
        mod = _load_drift()
        p = _write_tmp(b"hello world")
        try:
            import hashlib
            expected = hashlib.sha256(b"hello world").hexdigest()
            self.assertEqual(mod.sha256_file(p), expected)
        finally:
            os.remove(p)

    def test_sha256_file_missing(self):
        mod = _load_drift()
        self.assertIsNone(mod.sha256_file("/no/such/file/abcd1234.py"))

    def test_sha256_file_is_dir(self):
        mod = _load_drift()
        # 目录不是文件 -> 返回 None，不抛
        self.assertIsNone(mod.sha256_file("/tmp"))


class AnysearchNormalTests(unittest.TestCase):
    """正常场景：ok / drift。"""

    def test_anysearch_ok(self):
        mod = _load_drift()
        content = b"def main():\n    pass\n"
        local = _write_tmp(content)
        try:
            res = mod.check_anysearch(local, subprocess_run=run_ok_anysearch(content))
            self.assertEqual(res["check"], "anysearch")
            self.assertEqual(res["status"], "ok")
            self.assertEqual(res["local_sha"], mod.sha256_file(local))
            self.assertEqual(res["upstream_sha"], res["local_sha"])
        finally:
            os.remove(local)

    def test_anysearch_drift(self):
        mod = _load_drift()
        content = b"def main():\n    pass\n"
        local = _write_tmp(content)
        try:
            res = mod.check_anysearch(local, subprocess_run=run_drift_anysearch(content))
            self.assertEqual(res["status"], "drift")
            self.assertEqual(res["local_sha"], mod.sha256_file(local))
            self.assertNotEqual(res["local_sha"], res["upstream_sha"])
        finally:
            os.remove(local)


class FirecrawlNormalTests(unittest.TestCase):
    """正常场景：ok / drift。"""

    def test_firecrawl_ok(self):
        mod = _load_drift()
        recorded = "abc123recordedsha"
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": recorded}), suffix=".json")
        try:
            res = mod.check_firecrawl(
                subprocess_run=run_ok_firecrawl(recorded), recorded_sha_path=rec_path
            )
            self.assertEqual(res["check"], "firecrawl")
            self.assertEqual(res["status"], "ok")
            self.assertEqual(res["local_sha"], recorded)
            self.assertEqual(res["upstream_sha"], recorded)
        finally:
            os.remove(rec_path)

    def test_firecrawl_drift(self):
        mod = _load_drift()
        recorded = "abc123recordedsha"
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": recorded}), suffix=".json")
        try:
            res = mod.check_firecrawl(
                subprocess_run=run_drift_firecrawl(recorded), recorded_sha_path=rec_path
            )
            self.assertEqual(res["status"], "drift")
            self.assertEqual(res["local_sha"], recorded)
            self.assertNotEqual(res["upstream_sha"], recorded)
        finally:
            os.remove(rec_path)


class AnysearchBoundaryTests(unittest.TestCase):
    """边界场景：gh 缺失 / API 非零 / 网络异常 / 解析失败 / 缺字段 / 本地缺失。"""

    def test_anysearch_gh_missing(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            res = mod.check_anysearch(local, subprocess_run=run_gh_missing)
            self.assertEqual(res["status"], "unknown")
            self.assertIsNotNone(res["local_sha"])  # 本地仍在
        finally:
            os.remove(local)

    def test_anysearch_api_nonzero(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            res = mod.check_anysearch(local, subprocess_run=run_rc_nonzero)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)

    def test_anysearch_network_exception(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            res = mod.check_anysearch(local, subprocess_run=run_raises_generic)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)

    def test_anysearch_parse_error(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            res = mod.check_anysearch(local, subprocess_run=run_bad_json)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)

    def test_anysearch_no_content_field(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            res = mod.check_anysearch(local, subprocess_run=run_no_content_field)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)

    def test_anysearch_local_file_missing(self):
        mod = _load_drift()
        # 本地路径不存在：sha256_file 返回 None，状态必须为 unknown，不可抛 / 不可 drift
        res = mod.check_anysearch("/no/such/anysearch_cli.py", subprocess_run=run_ok_anysearch(b"x"))
        self.assertEqual(res["status"], "unknown")
        self.assertIsNone(res["local_sha"])


class FirecrawlBoundaryTests(unittest.TestCase):
    """边界场景：gh 缺失 / 记录缺失 / API 非零 / 网络异常 / 解析失败 / 缺字段。"""

    def test_firecrawl_gh_missing(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_gh_missing, recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_firecrawl_recorded_missing(self):
        mod = _load_drift()
        # 记录文件不存在：recorded=None，状态 unknown（不谎报 drift）
        res = mod.check_firecrawl(
            subprocess_run=run_ok_firecrawl("whatever"), recorded_sha_path="/no/such/.upstream_sha.json"
        )
        self.assertEqual(res["status"], "unknown")
        self.assertIsNone(res["local_sha"])

    def test_firecrawl_api_nonzero(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_rc_nonzero, recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_firecrawl_network_exception(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_raises_generic, recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_firecrawl_parse_error(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_bad_json, recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_firecrawl_no_sha_field(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_no_content_field, recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_firecrawl_recorded_not_json(self):
        mod = _load_drift()
        # 记录文件存在但内容非法 JSON -> 解析失败 -> unknown
        rec_path = _write_tmp("not json at all", suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_ok_firecrawl("x"), recorded_sha_path=rec_path)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)


class AdversarialTests(unittest.TestCase):
    """对抗式：证明「网络/工具失败绝不会误判 drift」，且「缺失态绝不谎报 drift」。"""

    def test_adversarial_network_failure_not_drift_anysearch(self):
        mod = _load_drift()
        local = _write_tmp(b"local content")
        try:
            # 假设实现有 BUG：网络失败时误把 upstream_sha 当成空串并判 drift。
            # 断言：必须得到 unknown，绝不可能是 drift。
            res = mod.check_anysearch(local, subprocess_run=run_rc_nonzero)
            self.assertNotEqual(res["status"], "drift")
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)

    def test_adversarial_gh_missing_not_drift_firecrawl(self):
        mod = _load_drift()
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "rec"}), suffix=".json")
        try:
            res = mod.check_firecrawl(subprocess_run=run_gh_missing, recorded_sha_path=rec_path)
            self.assertNotEqual(res["status"], "drift")
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(rec_path)

    def test_adversarial_local_missing_not_drift(self):
        mod = _load_drift()
        # 本地缺失 + 上游成功取到：绝不能谎报 drift（没有本地基线可比对）
        res = mod.check_anysearch("/no/such/file.py", subprocess_run=run_ok_anysearch(b"up"))
        self.assertNotEqual(res["status"], "drift")
        self.assertEqual(res["status"], "unknown")

    def test_adversarial_recorded_missing_not_drift_firecrawl(self):
        mod = _load_drift()
        # 记录缺失 + 上游成功：绝不能谎报 drift
        res = mod.check_firecrawl(
            subprocess_run=run_ok_firecrawl("up_sha"), recorded_sha_path="/no/such/.json"
        )
        self.assertNotEqual(res["status"], "drift")
        self.assertEqual(res["status"], "unknown")

    def test_adversarial_generic_exception_not_crash(self):
        mod = _load_drift()
        local = _write_tmp(b"x")
        try:
            # 任何异常都必须被吞掉，返回 unknown，不向上抛
            res = mod.check_anysearch(local, subprocess_run=run_raises_generic)
            self.assertEqual(res["status"], "unknown")
        finally:
            os.remove(local)


class CliExitTests(unittest.TestCase):
    """CLI 入口 exit code：drift -> 非0；ok / unknown -> 0。"""

    def _capture_main(self, argv, subprocess_run):
        mod = _load_drift()
        buf = io.StringIO()
        code = None
        with unittest.mock.patch("sys.stdout", buf):
            try:
                mod.main(argv, subprocess_run=subprocess_run)
            except SystemExit as e:
                code = e.code
        return code, buf.getvalue()

    def test_cli_exit_nonzero_on_drift(self):
        content = b"def main(): pass\n"
        local = _REAL_CLI
        recorded = "rec_sha"
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": recorded}), suffix=".json")
        try:
            code, out = self._capture_main(
                ["--local-cli", local, "--recorded-sha", rec_path],
                run_drift_both(content, recorded),
            )
            self.assertEqual(code, 1)
            self.assertIn("DRIFT", out)
        finally:
            os.remove(rec_path)

    def test_cli_exit_zero_on_ok(self):
        content = b"def main(): pass\n"
        local = _REAL_CLI
        recorded = "rec_sha"
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": recorded}), suffix=".json")
        try:
            code, out = self._capture_main(
                ["--local-cli", local, "--recorded-sha", rec_path],
                run_ok_both(content, recorded),
            )
            self.assertEqual(code, 0)
            self.assertIn("OK", out)
        finally:
            os.remove(rec_path)

    def test_cli_exit_zero_on_unknown(self):
        # gh 缺失：两份检查都 unknown -> exit 0，不让 CI 因无网络挂掉
        content = b"def main(): pass\n"
        local = _write_tmp(content)
        rec_path = _write_tmp(json.dumps({"firecrawl_openapi_sha": "x"}), suffix=".json")
        try:
            code, out = self._capture_main(
                ["--local-cli", local, "--recorded-sha", rec_path], run_gh_missing
            )
            self.assertEqual(code, 0)
            self.assertIn("UNKNOWN", out)
        finally:
            os.remove(local)
            os.remove(rec_path)


# 子树漂移检测的本地 vendored 目录（相对本测试文件）
_VENDOR_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "anysearch-skill")
)
# 单文件检查默认使用的真实 anysearch_cli.py 路径（与子树共用同一 API 路径，
# 故统一以真实本地文件内容建模上游，避免「同路径两种期望内容」冲突）
_REAL_CLI = os.path.normpath(
    os.path.join(_VENDOR_DIR, "scripts", "anysearch_cli.py")
)
_ANYSEARCH_API_BASE = "repos/anysearch-ai/anysearch-skill/contents/"


def _read_real_vendored(rel):
    """读取 anysearch-skill/ 下真实本地文件字节，作为「上游内容」建模无漂移。"""
    lpath = os.path.normpath(os.path.join(_VENDOR_DIR, rel))
    try:
        with open(lpath, "rb") as f:
            return f.read()
    except OSError:
        return b""


def _upstream_anysearch_content(api_path):
    """由 API 路径解析相对路径并读取真实本地文件内容（建模无漂移上游）。"""
    if api_path.startswith(_ANYSEARCH_API_BASE):
        rel = api_path[len(_ANYSEARCH_API_BASE):]
        return _read_real_vendored(rel)
    return b""


def run_ok_both(local_content, recorded_sha):
    """CLI 测试用：单文件检查 + 全子树检查都返回「一致」态。

    所有 anysearch 请求均以 anysearch-skill/ 下真实本地文件内容作为上游内容，
    正确建模「本地与上游无漂移」（真实文件随同步演进，不应被测试误判 drift）。
    """

    def _run(cmd, *a, **k):
        if "anysearch" in cmd[2]:
            data = _upstream_anysearch_content(cmd[2])
            return _FakeProc(0, _b64({"content": base64.b64encode(data).decode()}))
        return _FakeProc(0, _b64({"sha": recorded_sha}))

    return _run


def run_drift_both(local_content, recorded_sha):
    """CLI 测试用：单文件检查 + 全子树检查都「漂移」（上游内容被篡改）。"""

    def _run(cmd, *a, **k):
        if "anysearch" in cmd[2]:
            upstream = _upstream_anysearch_content(cmd[2]) + b"\n# tampered\n"
            return _FakeProc(0, _b64({"content": base64.b64encode(upstream).decode()}))
        return _FakeProc(0, _b64({"sha": "upstream_different_sha"}))

    return _run


if __name__ == "__main__":
    unittest.main(verbosity=2)
