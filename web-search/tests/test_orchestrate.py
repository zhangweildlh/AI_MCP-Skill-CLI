#!/usr/bin/env python3
"""orchestrate.py 端到端 + 边界 + 对抗式测试套件（stdlib unittest + mock subprocess）。

运行：
    uv run --with requests python -m unittest web-search.tests.test_orchestrate -v
  或
    uv run --with requests python -m unittest discover -s web-search/tests -v

哲学：先假设 orchestrate 各函数无效 / 有 BUG（fallback 静默跳过、corroborate 误判单源为
✅、max_results 不封顶），再用下列用例证实或证伪；凡用例意外通过即说明实现有漏洞，先自修再交付。
所有网络调用均 monkeypatch orchestrate.subprocess.run，不真实触网、不读写真实密钥、不 git 操作。
"""
import importlib.util
import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

# 让测试能 import 同仓库的 orchestrate 模块
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB_SEARCH = os.path.join(REPO_ROOT, "web-search")
if WEB_SEARCH not in sys.path:
    sys.path.insert(0, WEB_SEARCH)

import orchestrate  # noqa: E402

# 校验器：单一事实源 = P1 的 web-search/validate_output.py::validate_output_markdown(text)->list[str]
# （空列表=合规）。orchestrate 不再内置第二份分叉的校验器（见 orchestrate.py 模块说明），
# 所有产物合规断言统一走 P1 校验器，确保「编排产物」与「交付自检」结论一致。
from validate_output import validate_output_markdown


def _validate(md):
    """归一化校验器返回值：(ok: bool, errors: list)。P1 校验器返回 list[str]。"""
    out = validate_output_markdown(md)
    return (len(out) == 0, list(out))


# ---------------------------------------------------------------------------
# 测试辅助
# ---------------------------------------------------------------------------
def _track(source, facts, ok=True, authoritative=False):
    """构造规范化 track 信封（mock subprocess stdout 用）。"""
    return {"ok": ok, "facts": facts, "authoritative": authoritative, "source": source}


def _fake_run(stdout, rc=0):
    """返回一个可被 subprocess.run 替换的假函数。"""
    def _run(cmd, *a, **k):
        return types.SimpleNamespace(returncode=rc, stdout=stdout, stderr="")
    return _run


def _patch_run(stdout, rc=0):
    """context manager：monkeypatch orchestrate.subprocess.run 返回给定 stdout。"""
    return mock.patch.object(
        orchestrate.subprocess, "run",
        return_value=types.SimpleNamespace(returncode=rc, stdout=stdout, stderr=""),
    )


class OrchestrateTest(unittest.TestCase):
    # ===================== 正常场景 =====================
    def test_01_double_track_same_fact_corroborate(self):
        """双轨同事实 -> 产物含 ✅互证，来源并列两轨。"""
        r1 = _track("AnySearch", [{"field": "里程", "value": "291公里", "text": "正线全长约291公里"}])
        r2 = _track("Firecrawl", [{"field": "里程", "value": "291公里", "text": "正线全长约291公里"}])
        marked = orchestrate.corroborate(r1, r2)
        self.assertEqual(len(marked), 1)
        self.assertEqual(marked[0]["mark"], orchestrate.MARK_CORROB)
        self.assertIn("AnySearch+Firecrawl", marked[0]["source"])
        md = orchestrate.assemble("成渝中线高铁", marked,
                                  ["AnySearch: q", "Firecrawl: q"])
        self.assertIn(orchestrate.MARK_CORROB, md)
        ok, errs = _validate(md)
        self.assertTrue(ok, errs)

    def test_02_track1_ok_track2_missing_single_anysearch(self):
        """轨1成 + 轨2缺失(which=None) -> ⚠️单源 归属 AnySearch。"""
        r1_env = _track("AnySearch", [{"field": "param", "value": "X", "text": "参数=X"}])
        with mock.patch.object(orchestrate.shutil, "which", return_value=None), \
             _patch_run(json.dumps(r1_env)):
            res = orchestrate.run_full("主题A", "查询A", subprocess_run=None)
        self.assertEqual(res["status"], "OK")
        self.assertTrue(any(m["mark"] == orchestrate.MARK_SINGLE for m in res["marked"]))
        any_single = [m for m in res["marked"] if m["mark"] == orchestrate.MARK_SINGLE][0]
        self.assertIn("AnySearch", any_single["source"])
        self.assertNotIn("Firecrawl", any_single["source"])
        ok, errs = _validate(res["markdown"])
        self.assertTrue(ok, errs)

    def test_03_track1_fail_track2_ok_single_firecrawl(self):
        """轨1败(非0退出) + 轨2成 -> ⚠️单源 归属 Firecrawl。"""
        r2_env = _track("Firecrawl", [{"field": "param", "value": "Y", "text": "参数=Y"}])
        with mock.patch.object(orchestrate.shutil, "which", return_value="/usr/bin/firecrawl"), \
             _patch_run(json.dumps(r2_env)) as m:
            # 第一次调用(轨1)返回非0；第二次调用(轨2)返回0
            m.side_effect = [
                types.SimpleNamespace(returncode=1, stdout="", stderr="err"),  # 轨1失败
                types.SimpleNamespace(returncode=0, stdout=json.dumps(r2_env), stderr=""),  # 轨2成功
            ]
            res = orchestrate.run_full("主题B", "查询B", subprocess_run=None)
        self.assertEqual(res["status"], "OK")
        fc_single = [m for m in res["marked"] if m["mark"] == orchestrate.MARK_SINGLE][0]
        self.assertIn("Firecrawl", fc_single["source"])
        self.assertNotIn("AnySearch", fc_single["source"])

    def test_04_both_fail_native_available_native_fallback(self):
        """双轨皆败 + 原生可用 -> 产物含原生兜底标记，无静默跳过。"""
        with mock.patch.object(orchestrate.shutil, "which", return_value=None), \
             _patch_run("", rc=1):
            res = orchestrate.run_full("主题C", "查询C",
                                       subprocess_run=None, native_available=True)
        self.assertEqual(res["status"], "OK")
        self.assertTrue(any(m["mark"] == orchestrate.MARK_MISSING for m in res["marked"]))
        self.assertIn(orchestrate.MARK_MISSING, res["markdown"])
        self.assertIn(orchestrate.MARK_NATIVE, res["markdown"])  # 来源标注「原生兜底」
        # 护栏：绝不静默空过
        self.assertNotEqual(res["markdown"].strip(), "")
        ok, errs = _validate(res["markdown"])
        self.assertTrue(ok, errs)

    def test_05_both_fail_native_unavailable_need_user(self):
        """双轨皆败 + 原生不可用(check_native_available 注入 False) ->
        结果 status==NEED_USER，产物显式说明无法兜底（断言无静默空输出）。"""
        with mock.patch.object(orchestrate.shutil, "which", return_value=None), \
             _patch_run("", rc=1):
            res = orchestrate.run_full("主题D", "查询D",
                                       subprocess_run=None, native_available=False)
        self.assertEqual(res["status"], "NEED_USER")
        self.assertIn("NEED_USER", res["markdown"])
        self.assertIn("不可用", res["markdown"])
        self.assertIn(orchestrate.MARK_MISSING, res["markdown"])  # schema 合规用 ➖缺失
        # 关键护栏：必须显式产出，不得为空
        self.assertTrue(res["markdown"].strip())
        self.assertIn("### 来源清单", res["markdown"])
        ok, errs = _validate(res["markdown"])
        self.assertTrue(ok, errs)

    def test_06_conflict_resolved_by_authority(self):
        """双轨冲突(同字段异值) -> ❌冲突已裁决，采纳来源符合权威权重。"""
        r1 = _track("AnySearch",
                    [{"field": "发布日期", "value": "X月X日", "text": "发布于X月X日"}],
                    authoritative=False)
        r2 = _track("Firecrawl",
                    [{"field": "发布日期", "value": "Y月Y日", "text": "发布于Y月Y日"}],
                    authoritative=True)  # 官方 citation 更权威
        marked = orchestrate.corroborate(r1, r2)
        self.assertEqual(len(marked), 1)
        self.assertEqual(marked[0]["mark"], orchestrate.MARK_CONFLICT)
        self.assertEqual(marked[0]["adopted"], "Firecrawl")
        conf = marked[0]["conflict"]
        self.assertEqual(conf["AnySearch"], "发布于X月X日")
        self.assertEqual(conf["Firecrawl"], "发布于Y月Y日")

    def test_07_conflict_tiebreak_track1_order(self):
        """冲突且双方都不权威 -> 确定性按轨道顺序：AnySearch(轨道1) 优先。"""
        r1 = _track("AnySearch", [{"field": "f", "value": "A"}], authoritative=False)
        r2 = _track("Firecrawl", [{"field": "f", "value": "B"}], authoritative=False)
        marked = orchestrate.corroborate(r1, r2)
        self.assertEqual(marked[0]["adopted"], "AnySearch")

    # ===================== 边界场景 =====================
    def test_08_empty_query_no_crash(self):
        """空查询 -> 不崩，优雅处理（不触发 subprocess）。"""
        with _patch_run(json.dumps(_track("AnySearch", []))) as m:
            res = orchestrate.run_full("主题E", "", subprocess_run=None, native_available=True)
        self.assertIsInstance(res, dict)
        self.assertIn("markdown", res)
        self.assertTrue(res["markdown"].strip())
        m.assert_not_called()  # 空查询不应触网

    def test_09_max_results_clamp(self):
        """max_results 边界：0->1, 1->1, 10->10, 11->10（断言传给 subprocess 的参数封顶）。"""
        r1 = _track("AnySearch", [{"field": "k", "value": "v"}])
        cases = [(0, "1"), (1, "1"), (10, "10"), (11, "10")]
        for mr, expect in cases:
            with _patch_run(json.dumps(r1)) as m:
                orchestrate.run_track1("q", max_results=mr, subprocess_run=m)
            cmd = m.call_args[0][0]
            self.assertIn("--max_results", cmd, f"max_results={mr} 缺少参数")
            self.assertIn(expect, cmd, f"max_results={mr} 应封顶为 {expect}, 实际 cmd={cmd}")
            # 不得出现超过上限的数值
            if mr > 10:
                self.assertNotIn(str(mr), cmd)

    def test_10_run_track2_requires_which(self):
        """firecrawl 不在 PATH -> run_track2 直接返回 None（降级不崩），不触网。"""
        with mock.patch.object(orchestrate.shutil, "which", return_value=None), \
             _patch_run(json.dumps(_track("Firecrawl", []))) as m:
            r2 = orchestrate.run_track2("q", subprocess_run=m)
        self.assertIsNone(r2)
        m.assert_not_called()

    # ===================== 对抗式：假设实现有 BUG =====================
    def test_11_adversarial_single_not_corroborate(self):
        """对抗：假设 corroborate 有 BUG（单源被误判 ✅）->
        断言单源必须产出 ⚠️ 而非 ✅，证明该 BUG 会被捕获。"""
        r1 = _track("AnySearch", [{"field": "k", "value": "v"}])
        marked = orchestrate.corroborate(r1, None)  # 仅一轨 ok
        self.assertTrue(marked)
        for m in marked:
            self.assertEqual(m["mark"], orchestrate.MARK_SINGLE,
                             "单源绝不能被标为 ✅互证（BUG 泄露）")
            self.assertNotEqual(m["mark"], orchestrate.MARK_CORROB)

    def test_12_adversarial_fallback_no_silent_skip(self):
        """对抗：假设 fallback 有 BUG（静默返回空）-> 断言 NEED_USER 必须显式，
        fallback_cascade(native=False) 返回带 status 的 dict，而非空列表/空字符串。"""
        fb = orchestrate.fallback_cascade(None, None, native_available=False)
        self.assertIsInstance(fb, dict)
        self.assertEqual(fb.get("status"), "NEED_USER")
        self.assertTrue(fb.get("reason"))

        # 原生可用时也必须返回非空列表（带 ➖缺失 标记，来源标注原生兜底），不得静默空过
        fb_ok = orchestrate.fallback_cascade(None, None, native_available=True)
        self.assertIsInstance(fb_ok, list)
        self.assertTrue(fb_ok)
        self.assertEqual(fb_ok[0]["mark"], orchestrate.MARK_MISSING)
        self.assertIn(orchestrate.MARK_NATIVE, fb_ok[0]["source"])

    def test_13_adversarial_max_results_no_overflow(self):
        """对抗：假设 max_results 不封顶 -> 断言 11 绝不原样传入 subprocess。"""
        r1 = _track("AnySearch", [{"field": "k", "value": "v"}])
        with _patch_run(json.dumps(r1)) as m:
            orchestrate.run_track1("q", max_results=999, subprocess_run=m)
        cmd = m.call_args[0][0]
        self.assertNotIn("999", cmd)
        self.assertIn("10", cmd)

    # ===================== 产物 schema 合规 =====================
    def test_14_markdown_compliance_all_branches(self):
        """assemble / fallback 产物均通过校验（复用 validate_output 逻辑）。"""
        # 互证
        md1 = orchestrate.assemble("T", [
            {"mark": orchestrate.MARK_CORROB, "text": "事实", "source": "AnySearch+Firecrawl"}
        ], ["AnySearch: q", "Firecrawl: q"])
        # 单源
        md2 = orchestrate.assemble("T", [
            {"mark": orchestrate.MARK_SINGLE, "text": "事实", "source": "AnySearch(待核实)"}
        ], ["AnySearch: q"])
        # 冲突
        md3 = orchestrate.assemble("T", [
            {"mark": orchestrate.MARK_CONFLICT, "text": "事实", "source": "Firecrawl(采纳)"}
        ], ["AnySearch: q", "Firecrawl: q"])
        # 原生兜底（对齐 SKILL.md：用 ➖缺失 标记，来源清单标注「原生兜底」）
        md4 = orchestrate.assemble("T", [
            {"mark": orchestrate.MARK_MISSING, "text": "兜底", "source": orchestrate.MARK_NATIVE}
        ], ["原生兜底: q"])

        for md in (md1, md2, md3, md4):
            ok, errs = _validate(md)
            self.assertTrue(ok, errs)
            self.assertIn("## 主题：", md)
            self.assertIn("### 核心事实", md)
            self.assertIn("### 来源清单", md)

    def test_15_check_native_injection(self):
        """check_native_available 可注入 False/True/dict，使原生分支可测。"""
        self.assertTrue(orchestrate.check_native_available())            # 默认
        self.assertFalse(orchestrate.check_native_available(False))      # 注入不可用
        self.assertTrue(orchestrate.check_native_available(True))
        self.assertTrue(orchestrate.check_native_available({"web_search": 1}))
        self.assertFalse(orchestrate.check_native_available({"web_fetch": 0}))

    # ===================== 集成：P1 校验器 × orchestrate 产物 交叉验证 =====================
    def _run_full_mocked(self, track1_env=None, track2_env=None,
                         track1_rc=0, track2_rc=0, **kw):
        """用 mock subprocess 跑 run_full，返回 result。track*_env=None 表示该轨直接失败。"""
        calls = []
        def _run(cmd, *a, **k):
            calls.append(cmd)
            # 轨1 命令含 uv/anysearch_cli，轨2 命令含 firecrawl
            if cmd[0] == "uv" or "anysearch" in str(cmd):
                if track1_env is None:
                    return types.SimpleNamespace(returncode=1, stdout="", stderr="")
                return types.SimpleNamespace(returncode=track1_rc,
                                             stdout=json.dumps(track1_env), stderr="")
            else:
                if track2_env is None:
                    return types.SimpleNamespace(returncode=1, stdout="", stderr="")
                return types.SimpleNamespace(returncode=track2_rc,
                                             stdout=json.dumps(track2_env), stderr="")
        with mock.patch.object(orchestrate.shutil, "which",
                                return_value="/usr/bin/firecrawl" if track2_env else None):
            return orchestrate.run_full("集成主题", "集成查询", subprocess_run=_run, **kw)

    def test_16_integration_p1_validator_passes_all_branches(self):
        """集成交叉验证：run_full 所有分支产物都必须通过 P1 校验器（单一事实源）。

        对抗式：若某个分支产物实际不合 schema（如缺来源清单/缺采信标记），
        而 P1 校验器/本断言漏判，则用例转红——这正是双实现分叉会漏掉的真实 BUG。
        """
        r1 = _track("AnySearch", [{"field": "里程", "value": "291公里", "text": "正线全长约291公里"}])
        r2 = _track("Firecrawl", [{"field": "里程", "value": "291公里", "text": "正线全长约291公里"}])

        cases = {
            "corroborate": self._run_full_mocked(track1_env=r1, track2_env=r2),
            "single_anysearch": self._run_full_mocked(track1_env=r1, track2_env=None),
            "single_firecrawl": self._run_full_mocked(track1_env=None, track2_env=r2),
            "native_fallback": self._run_full_mocked(track1_env=None, track2_env=None,
                                                      native_available=True),
            "need_user": self._run_full_mocked(track1_env=None, track2_env=None,
                                               native_available=False),
        }
        for name, res in cases.items():
            md = res["markdown"]
            ok, errs = _validate(md)
            self.assertTrue(ok, f"分支[{name}]产物未通过 P1 校验器：{errs}\n{md}")
            # 结构性硬断言：每个产物都必须同时含 来源清单 与至少一个采信标记符号
            self.assertIn("### 来源清单", md, f"分支[{name}]产物缺来源清单")
            self.assertTrue(
                any(m in md for m in ("✅", "⚠️", "❌", "➖")),
                f"分支[{name}]产物缺采信标记：{md}",
            )

    def test_17_orchestrate_has_no_divergent_validator(self):
        """护栏：orchestrate 模块不得再定义签名/逻辑分叉的 validate_output_markdown。

        回归防线：杜绝「双实现不一致 / 同名遮蔽」陷阱——唯一的合规校验器是
        web-search/validate_output.py。若有人重新在 orchestrate 里塞回第二份校验器，
        本用例 FAIL。
        """
        self.assertFalse(
            hasattr(orchestrate, "validate_output_markdown"),
            "orchestrate 不应再定义 validate_output_markdown；"
            "唯一事实源是 web-search/validate_output.py",
        )

    def test_18_run_track1_default_skill_root_resolves_real_cli(self):
        """真实路径校验（不触网）：run_track1 默认 skill_root 解析出的 cli 路径真实存在。

        证明 skill_root 默认 `Path(__file__).resolve().parent`（即 web-search/）
        拼接 anysearch-skill/scripts/anysearch_cli.py 在真实磁盘上正确，
        不会因相对基准错误而指向不存在的路径。
        """
        # 复刻 run_track1 内部的路径解析逻辑（不真正执行网络）
        sr = Path(orchestrate.__file__).resolve().parent
        cli = sr / "anysearch-skill" / "scripts" / "anysearch_cli.py"
        self.assertTrue(
            os.path.isfile(str(cli)),
            f"run_track1 默认 skill_root 解析出的 cli 路径应真实存在：{cli}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
