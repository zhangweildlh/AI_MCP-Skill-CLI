#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_structure_audit.py — file-structure-organizer 检测引擎测试方案。

覆盖：干净合规 / 前向引用(FWD) / 非必要循环 / 必要循环(豁免) / 章号缺号 /
禁用词(强约束) / 盲点B / 索引导航(通过+失败) / 围栏奇偶 / 噪声排除 /
伪层级 / 跳级。多场景 + 多边界 + 全覆盖。

运行：python3 test_structure_audit.py
"""
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import structure_audit as sa  # noqa: E402


def write_tmp(text: str):
    fd, path = tempfile.mkstemp(suffix=".md", prefix="fso_test_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def run(text: str):
    p = write_tmp(text)
    try:
        return sa.analyze(p)
    finally:
        os.remove(p)


class TestScenarios(unittest.TestCase):

    def test_t1_clean_compliant(self):
        doc = """# 文档标题

## 速查索引（适用场景 → 对应章节）

| 适用场景 | 对应章节 |
| --- | --- |
| 概述 | `## 第1章 概述` |
| 方法 | `## 第2章 方法` |

## 第1章 概述

### 1.1 背景
内容。
### 1.2 目标
回到 `### 1.1 背景`（后序引前序，合法）。
## 第2章 方法

### 2.1 步骤
引用 `### 1.1 背景`（后序引前序，合法）。
"""
        r = run(doc)
        self.assertEqual(r["summary"]["issue_error"], 0,
                         msg=f"干净文档不应有 error：{r['issues']}")
        self.assertEqual(r["summary"]["navigation"], "2/2")
        self.assertTrue(r["summary"]["fence_even"])

    def test_t2_fwd_reference(self):
        doc = """## 第1章 概述
### 1.1 背景
详见 第2章 方法
### 1.2 细节
内容
## 第2章 方法
### 2.1 步骤
内容
"""
        r = run(doc)
        self.assertGreaterEqual(r["summary"]["ref_fwd"], 1)
        self.assertGreaterEqual(r["summary"]["issue_error"], 1)
        self.assertTrue(any(i["rule"].startswith("第10条·引用方向·FWD")
                            for i in r["issues"]))

    def test_t3_unnecessary_cycle(self):
        doc = """## 第1章 A
### 1.1 甲
见 `## 第2章 B`
## 第2章 B
### 2.1 乙
见 `## 第1章 A`
"""
        r = run(doc)
        cyc = [i for i in r["issues"] if i["rule"].startswith("第11条")]
        self.assertTrue(cyc, msg="应检出非必要循环")
        self.assertEqual(cyc[0]["severity"], "error")

    def test_t4_necessary_cycle_exempt(self):
        doc = """## 第1章 审计
### 1.1 检测
见 `## 第2章 修复`
## 第2章 修复
### 2.1 修补
见 `## 第1章 审计`（必要循环）
"""
        r = run(doc)
        cyc = [i for i in r["issues"] if i["rule"].startswith("第11条")]
        self.assertTrue(cyc, msg="必要循环仍应被检出（仅豁免严重级）")
        self.assertEqual(cyc[0]["severity"], "info")

    def test_t5_section_gap(self):
        doc = """## 第1章 概述
内容
## 第3章 方法
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第4条") and i["severity"] == "error"
                            for i in r["issues"]),
                        msg="章号缺号应报 error")

    def test_t6_banned_in_strong(self):
        doc = """## 第1章 要求
本步骤须酌情处理。
"""
        r = run(doc)
        self.assertGreaterEqual(r["summary"]["banned_error"], 1)
        self.assertTrue(any(i["rule"].startswith("第9条") and i["severity"] == "error"
                            for i in r["issues"]))

    def test_t7_blind_spot_b(self):
        doc = """## 第1章 概述
### 1.1 入口
见 `## 第2章 方法` 2.1 节。
## 第2章 方法
### 2.1 步骤
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第12条·盲点B")
                            for i in r["issues"]),
                        msg="盲点B（节号裸露）应报 error")

    def test_t8_index_nav_fail(self):
        doc = """## 速查索引（适用场景 → 对应章节）

| 适用场景 | 对应章节 |
| --- | --- |
| 概述 | `## 第9章 不存在` |

## 第1章 概述
内容
"""
        r = run(doc)
        self.assertTrue(r["summary"]["navigation"].startswith("0/"),
                        msg=f"索引目标不存在应导航失败：{r['summary']['navigation']}")
        self.assertFalse(r["six_connection"][4]["result"] == "PASS")

    def test_t9_fence_odd(self):
        doc = "## 第1章 概述\n```python\ncode\n"  # 仅开围栏，无闭合 → 奇数
        r = run(doc)
        self.assertFalse(r["summary"]["fence_even"],
                         msg="奇数围栏应判非偶数")

    def test_t10_noise_exclusion(self):
        doc = """## 第1章 概述
使用 Python 3.14 与 PowerShell 5.1 执行命令 -m 1。
访问 http://example.com/x.y 获取版本 v1.7.0。
"""
        r = run(doc)
        # 噪声不应触发章号缺号/裸引用 error
        self.assertFalse(any(i["rule"].startswith("第4条") and i["severity"] == "error"
                             for i in r["issues"]))
        self.assertEqual(r["summary"]["ref_fwd"], 0)

    def test_t11_pseudo_level_indent(self):
        doc = """## 第1章 概述
  缩进伪装层级
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第3条")
                            for i in r["issues"]),
                        msg="缩进伪装层级应被检出")

    def test_t12_flatness_jump(self):
        doc = """# 标题
### 直接三级
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第2条") and i["severity"] == "error"
                            for i in r["issues"]),
                        msg="标题跳级应报 error")

    def test_t13_pseudo_level_cn_ordinal(self):
        doc = """## 第1章 概述
一、背景介绍
内容
（二）方法说明
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第3条")
                            for i in r["issues"]),
                        msg="中文序号伪装层级（一、/（二））应被检出")

    def test_t14_index_format_error(self):
        # 索引第二列未用反引号包裹的节级标题（裸编号/裸标题），应报第12条索引格式 error
        doc = """## 速查索引（适用场景 → 对应章节）

| 适用场景 | 对应章节 |
| --- | --- |
| 概述 | 第1章 概述 |
| 方法 | 2.1 步骤 |

## 第1章 概述
内容
### 2.1 步骤
内容
"""
        r = run(doc)
        self.assertTrue(any(i["rule"].startswith("第12条·索引")
                            and i["severity"] == "error" for i in r["issues"]),
                        msg="索引第二列格式违规（裸编号/裸标题）应报 error")

    def test_t15_blind_spot_a(self):
        # 盲点 A：带引导动词且未反引号包裹的裸引用（如"见 第2章 方法"），应报第12条·盲点A warning
        doc = """## 第1章 概述
见 第2章 方法（裸引用，未用反引号包裹）。
## 第2章 方法
内容
"""
        r = run(doc)
        blind_a = [i for i in r["issues"] if i["rule"].startswith("第12条·盲点A")]
        self.assertTrue(blind_a, msg="裸引用（无反引号）应被检出盲点A")
        self.assertEqual(blind_a[0]["severity"], "warning",
                         msg="盲点A 应为 warning 级")

    def test_t16_dangling_backtick(self):
        # DANGLING：反引号引用指向不存在的标题，应报 error
        doc = """## 第1章 概述
见 `## 第9章 不存在的章节`。
"""
        r = run(doc)
        self.assertGreaterEqual(r["summary"]["ref_dangling"], 1)
        self.assertTrue(any(i["rule"].startswith("第12条·DANGLING")
                            or i["severity"] == "error" for i in r["issues"]),
                        msg="悬空引用（DANGLING）应被检出")

    def test_t17_json_and_strict(self):
        # JSON 输出 + --strict 退出码：存在 error 时退出码应为 1
        import subprocess
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", prefix="fso_t17_", delete=False, encoding="utf-8") as tf:
            tf.write("## 第1章 要求\n本步骤须酌情处理。\n")
            tpath = tf.name
        try:
            # JSON 模式应可正常产出且含 summary 键
            out = subprocess.run([sys.executable, os.path.join(HERE, "structure_audit.py"),
                                  tpath, "--json"], capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, msg=f"JSON 模式应正常退出：{out.stderr}")
            import json as _json
            payload = _json.loads(out.stdout)
            self.assertIn("summary", payload, msg="JSON 输出须含 summary 键")
            # --strict 存在 error 级问题时退出码应为 1
            out2 = subprocess.run([sys.executable, os.path.join(HERE, "structure_audit.py"),
                                   tpath, "--strict"], capture_output=True, text=True)
            self.assertEqual(out2.returncode, 1, msg="--strict 遇 error 应退出码 1")
        finally:
            os.remove(tpath)

    def test_t18_nav_na_without_index(self):
        # 无索引/映射表的通用文档：导航可达性应判 N/A，不得误判 FAIL
        doc = """## 第1章 概述
内容。
### 1.1 背景
回到 `### 1.1 背景`（后序引前序，合法）。
"""
        r = run(doc)
        six_nav = [row for row in r["six_connection"] if row["name"] == "导航可达性"]
        self.assertTrue(six_nav, msg="六连验证须含导航可达性行")
        self.assertEqual(six_nav[0]["result"], "N/A",
                         msg=f"无索引表文档导航应判 N/A，实际：{six_nav[0]}")
        four_nav = [row for row in r["four_properties"] if row["name"] == "可达性"]
        self.assertTrue(four_nav, msg="四性结论须含可达性行")
        self.assertEqual(four_nav[0]["result"], "N/A",
                         msg=f"无索引表文档可达性应判 N/A，实际：{four_nav[0]}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
