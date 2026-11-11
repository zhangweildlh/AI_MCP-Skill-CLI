#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wai-guide-reverse —— 引导词.md 契约门禁的常驻反向测试（门禁改造铁律②）。

来源：外部工区两份一次性脚本 `_guide_reverse_test.py`（PR #224 时代，判据名已部分失效）
与 `_guide_selfcontained_reverse_test.py`（PR #226 时代，判据名有效但硬编码 worktree 时间戳），
合并、参数化、去硬编码后按 AGENTS.md §9 回流为可复用回归测试。

做法：注入其要抓的缺陷 → 确认被测门禁如期输出 `✗ <判据名>` 且退出码非 0 →
逐字节还原 → 基线复跑全绿。注入精确命中一个必要条件；判据名按前缀匹配
（注入后判据名可能变化）；任何异常路径都无条件还原目标文件。

关键设计：被测对象是 `tests/test_pipeline_contract.js`（§⑪），**不是**统一入口。
本脚本自身也登记在唯一清单、由统一入口调度，若再调统一入口会递归；
直接跑被测门禁既无递归，又保持零外部依赖、离线可跑。

零硬编码：目标文件、契约脚本、仓库根全部由 `__file__` 推导；不依赖当前工作目录、
不含 worktree 时间戳、不写外部工区日志（临时产物自清理，§9.5）。

运行（唯一入口调度见 scripts/smoke/test_manifest.py）：
  uv run python Workbuddy专属/wechat-article-to-ima/tests/test_guide_reverse.py
  uv run python .../test_guide_reverse.py --json
退出码：0 全部通过 / 1 存在漏检或还原失败 / 2 环境错误。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = TESTS_DIR.parent
GUIDE = SKILL_DIR / "引导词.md"
CONTRACT = TESTS_DIR / "test_pipeline_contract.js"

# 当前 §⑪ 的真实锚点（2026-11-11 PR #226 后基线）；锚点不命中即判 FAIL，绝不 SKIP 求绿。
SKILL_LINE = (
    "  - `[SKILL]` = 调度方加载本技能时取得的 `wechat-article-to-ima` 技能目录绝对路径"
    "（即 `SKILL.md` 所在目录）；`check-deps.js` 仅为依赖自检入口，**不作为 `[SKILL]` 的来源**；\n"
)
PREFIX_SPLIT = re.compile(r"(?m)^## 引导词 ")

CASES = [
    dict(name="G1 A 套删除 [SKILL] 定义行", seg=0, old=SKILL_LINE, new="",
         expect="第 1 套自含共享区"),
    dict(name="G2 B 套写死真实 folder_id", seg=1,
         old="禁止硬编码 `folder_id`**（folder 被重建/改名即失效）",
         new="禁止硬编码 `folder_id`**（folder 被重建/改名即失效，例：folder_7511772189689986）",
         expect="第 2 套无硬编码 folder_id"),
    dict(name="G3 续跑守护误用 reset-card --card", seg=3,
         old="**不调用 `reset-card`**",
         new="**不调用 `reset-card`**（误用示例：reset-card --card A）",
         expect="续跑守护禁用 reset-card"),
    dict(name="G4 恢复顶部共享区（路径约定四套通用）", seg=None, where="preamble",
         old="\n---\n", new="\n> **路径约定（四套通用）**：`[WS]` = 共享占位。\n\n---\n",
         expect="顶部共享区已清零"),
    dict(name="G5 C 套抹除「四栏齐全 ≠ 闭环」", seg=2,
         old="四栏齐全 ≠ 闭环", new="四栏齐全即闭环",
         expect="第 3 套自含共享区"),
    dict(name="G6 C 套复述 SKILL.md 实现细节 import_doc", seg=2,
         old="- **执行指针**",
         new="- **实现细节**：import_doc 后 add_knowledge。\n- **执行指针**",
         expect="第 3 套不复述 SKILL.md 实现细节"),
]


def die(msg: str) -> int:
    print("[FATAL] " + msg, file=sys.stderr)
    return 2


def split_parts(text):
    return PREFIX_SPLIT.split(text)


def join_parts(parts):
    return "## 引导词 ".join(parts)


def inject(text0: str, case: dict) -> str:
    parts = split_parts(text0)
    if len(parts) != 5:
        raise RuntimeError("章节切分异常：期望 5 段（preamble + 4 套），实得 %d" % len(parts))
    if case.get("where") == "preamble":
        j = 0
    else:
        j = case["seg"] + 1
    if case["old"] not in parts[j]:
        raise RuntimeError("注入锚点未命中（段 %d）：%s" % (j, case["old"][:60]))
    parts[j] = parts[j].replace(case["old"], case["new"], 1)
    return join_parts(parts)


def run_contract(node: str, contract: Path, skill_dir: Path):
    r = subprocess.run([node, str(contract)], cwd=str(skill_dir),
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=dict(os.environ, PYTHONIOENCODING="utf-8"),
                       timeout=300)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def hit_assert(out: str, prefix: str) -> bool:
    """按判据名前缀匹配，且该行必须含 ✗（不得是 ✓ 通过行）。"""
    return any(("✗" in ln and prefix in ln) for ln in out.splitlines())


def baseline_ok(code: int, out: str) -> bool:
    m = re.search(r"通过 (\d+) / 失败 0", out)
    return code == 0 and m is not None and int(m.group(1)) > 0


def main() -> int:
    ap = argparse.ArgumentParser(description="引导词.md 契约门禁反向测试（门禁铁律②）")
    ap.add_argument("--json", action="store_true", dest="as_json", help="仅输出结构化 JSON")
    ap.add_argument("--target", default=str(GUIDE), help="引导词.md 路径（默认由脚本位置推导）")
    ap.add_argument("--contract", default=str(CONTRACT), help="被测契约脚本路径（默认由脚本位置推导）")
    opt = ap.parse_args()

    # 局部变量，不改写模块级常量：argparse 默认值已在上方读取 GUIDE/CONTRACT，
    # 若在此处 global 声明会触发 SyntaxError（name used prior to global declaration）。
    guide = Path(opt.target).resolve()
    contract = Path(opt.contract).resolve()
    skill_dir = guide.parent

    node = shutil.which("node")
    if not node:
        return die("node 不在 PATH，无法运行契约脚本")
    if not guide.is_file():
        return die("引导词.md 不存在：" + str(guide))
    if not contract.is_file():
        return die("契约脚本不存在：" + str(contract))

    original = guide.read_bytes()
    text0 = original.decode("utf-8")
    checks = []

    def ck(name, cond, detail=""):
        checks.append((name, bool(cond), str(detail)))
        return bool(cond)

    ck("判据自身有效：契约为纯 LF 且非空", "\r" not in text0 and len(text0) > 8000,
       "chars=%d" % len(text0))
    ck("判据自身有效：章节切分恰为 preamble + 4 套", len(split_parts(text0)) == 5,
       "n=%d" % len(split_parts(text0)))
    ck("判据自身有效：split/join 无损还原", join_parts(split_parts(text0)) == text0)
    ck("判据自身有效：注入用例恰为 6 组", len(CASES) == 6, str(len(CASES)))
    ck("判据自身有效：基线预跑全绿", baseline_ok(*run_contract(node, contract, skill_dir)))

    rows = []
    try:
        for case in CASES:
            try:
                injected = inject(text0, case)
            except RuntimeError as ex:
                rows.append(dict(name=case["name"], ok=False, expect=case["expect"],
                                 detail="锚点失效：" + str(ex)))
                ck("反向用例 " + case["name"], False, str(ex))
                continue
            if injected.encode("utf-8") == original:
                rows.append(dict(name=case["name"], ok=False, expect=case["expect"],
                                 detail="注入未改变文件"))
                ck("反向用例 " + case["name"], False, "注入未改变文件")
                continue
            guide.write_bytes(injected.encode("utf-8"))
            try:
                code, out = run_contract(node, contract, skill_dir)
            except Exception as ex:  # noqa: BLE001
                code, out = -1, str(ex)
            hit = hit_assert(out, case["expect"])
            ok = (code != 0) and hit
            rows.append(dict(name=case["name"], ok=ok, expect=case["expect"],
                             detail="exit=%d 判据命中=%s" % (code, hit)))
            ck("反向用例 " + case["name"] + "：注入后门禁如期 ✗ 且退出码非 0", ok,
               "exit=%d hit=%s" % (code, hit))
            guide.write_bytes(original)
            ck("反向用例 " + case["name"] + "：逐字节还原",
               guide.read_bytes() == original)
    finally:
        # 任何异常路径都无条件还原，绝不把注入状态留在仓库里
        if guide.read_bytes() != original:
            guide.write_bytes(original)

    code, out = run_contract(node, contract, skill_dir)
    ck("还原后基线复跑全绿（通过 N / 失败 0）", baseline_ok(code, out),
       "exit=%d tail=%s" % (code, out.strip()[-100:]))
    ck("最终逐字节还原核验", guide.read_bytes() == original)

    payload = dict(
        target=str(guide), contract=str(contract),
        cases=[dict(name=r["name"], ok=r["ok"], expect=r["expect"], detail=r["detail"]) for r in rows],
        checks=[dict(name=x, ok=o, detail=d) for x, o, d in checks],
        passed=sum(1 for _, o, _ in checks if o),
        failed=sum(1 for _, o, _ in checks if not o),
    )
    if opt.as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("=== 引导词.md 契约门禁反向测试（门禁铁律②）===")
        print("目标文件 =", guide)
        print("被测门禁 =", contract)
        for r in rows:
            print("  [%s] %s | 期望判据=%s | %s"
                  % ("PASS" if r["ok"] else "FAIL", r["name"], r["expect"], r["detail"]))
        print("--- 判据明细 ---")
        for name, ok, detail in checks:
            print("  [%s] %s%s" % ("PASS" if ok else "FAIL", name,
                                   (" :: " + detail) if detail else ""))
        print("PASS=%d FAIL=%d" % (payload["passed"], payload["failed"]))
    return 0 if payload["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
