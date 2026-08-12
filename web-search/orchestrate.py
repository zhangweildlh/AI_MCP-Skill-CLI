#!/usr/bin/env python3
"""web-search 链路阶段 B/C/D/E 编排模块（P2 + P3 整改落地）。

把父 SKILL.md 中"散文指令"的链路阶段代码化、可测、有护栏：

  阶段 B 多来源印证  -> corroborate()
  阶段 C 双工具补台  -> run_track1()/run_track2() 失败即 None，由 corroborate 降级为 ⚠️单源
  阶段 D 原生兜底    -> fallback_cascade() + check_native_available()（P3 强护栏：严禁静默跳过）
  阶段 E 复审裁决落盘 -> assemble() 统一 schema 落盘 <主题>_搜索素材.md

设计原则（全部函数可被测试注入 / monkeypatch）：
  * 网络调用一律走 subprocess（run_track1/run_track2），测试可 monkeypatch subprocess.run。
  * check_native_available(capabilities) 默认 True，可注入 False 模拟"原生兜底不可用"（P3 关键）。
  * 所有判定确定性、不依赖网络：corroborate / fallback_cascade 纯函数。
  * 不抛异常：subprocess 非 0 退出 / 解析失败 / 缺命令 -> 返回 None 或显式 NEED_USER，绝不崩溃。

落盘 schema 与 SKILL.md 对齐：
  ## 主题：<主题>
  ### 核心事实
  - [<标记>] <事实> — 来源：X
  ### 来源清单
  - AnySearch: <查询>
  - Firecrawl: <查询>
  - 原生兜底: <查询>（若有）

采信标记：✅互证 / ⚠️单源 / ❌冲突已裁决 / ➖缺失 / 原生兜底。
冲突裁决规则（确定性、可复现，见 _resolve_conflict 文档）：
  1) authoritative=True 者优先；
  2) 双方权威相同或都不权威 -> 按轨道顺序：AnySearch(轨道1) 优先于 Firecrawl(轨道2)。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
MARK_CORROB = "✅互证"
MARK_SINGLE = "⚠️单源"
MARK_CONFLICT = "❌冲突已裁决"
MARK_MISSING = "➖缺失"
MARK_NATIVE = "原生兜底"
MARK_NEED_USER = "NEED_USER"

VALID_MARKS = {MARK_CORROB, MARK_SINGLE, MARK_CONFLICT, MARK_MISSING, MARK_NATIVE, MARK_NEED_USER}

TRACK1_SOURCE = "AnySearch"
TRACK2_SOURCE = "Firecrawl"

# max_results 硬上限（anysearch_cli.py 自身也 clamp 到 10；这里在编排层先封顶）
MAX_RESULTS_CAP = 10


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
def _norm(s) -> str:
    """归一化：去空白、转小写，用于事实值比较。"""
    return re.sub(r"\s+", "", str(s)).strip().lower()


def _display(fact) -> str:
    """从 fact 项取可读文本。"""
    if isinstance(fact, dict):
        return str(fact.get("text") if fact.get("text") is not None else fact.get("value", ""))
    return str(fact)


def _to_field_value(fact):
    """把 fact 项转为 (field_key, value_key, raw)，用于按字段比对。

    若 fact 为 dict 且带 field/key -> 按字段比对（可检测同字段异值冲突）；
    否则把整条文本当作 field 与 value（仅能互证/单源，无法判定冲突）。
    """
    if isinstance(fact, dict):
        field = fact.get("field") or fact.get("key") or ""
        value = fact.get("value") if fact.get("value") is not None else fact.get("text", "")
        if not field:
            text = fact.get("text", "")
            return _norm(text), _norm(text), fact
        return _norm(field), _norm(value), fact
    s = str(fact)
    return _norm(s), _norm(s), fact


def _index(track: dict) -> dict:
    """把 track 的 facts 索引成 {field_key: (value_key, raw)}。"""
    out: dict = {}
    for f in (track or {}).get("facts", []):
        field, value, raw = _to_field_value(f)
        if field:
            out[field] = (value, raw)
    return out


# ---------------------------------------------------------------------------
# 阶段 A（双轨运行封装）
# ---------------------------------------------------------------------------
def run_track1(query, max_results: int = 5, skill_root=None, subprocess_run=None):
    """轨道1 AnySearch：uv 运行 anysearch_cli.py search。

    网络一律走 subprocess（默认 subprocess.run，允许 monkeypatch 注入）。
    非 0 退出 / 异常 / 空查询 -> 返回 None（不抛、不崩）。

    返回规范化 track dict：{"ok": bool, "facts": [...], "authoritative": bool, "source": "AnySearch"}
    或 None。
    """
    if query is None or not str(query).strip():
        return None
    sr = Path(skill_root).resolve() if skill_root else Path(__file__).resolve().parent
    cli = sr / "anysearch-skill" / "scripts" / "anysearch_cli.py"
    # 边界钳制：max_results 落在 [1, 10]
    m = max(1, min(int(max_results), MAX_RESULTS_CAP))
    cmd = [
        "uv", "run", "--with", "requests", "python",
        str(cli), "search", str(query), "--max_results", str(m),
    ]
    run = subprocess_run or subprocess.run
    try:
        proc = run(cmd, capture_output=True, text=True)
    except Exception:
        return None
    if getattr(proc, "returncode", 1) != 0:
        return None
    return parse_track_output(getattr(proc, "stdout", ""), TRACK1_SOURCE)


def run_track2(query, subprocess_run=None):
    """轨道2 Firecrawl：官方 CLI（全局 firecrawl 命令）。

    若 `shutil.which("firecrawl")` 为 None -> 返回 None（降级，不崩）。
    非 0 退出 / 解析失败 / 异常 -> 返回 None。
    """
    if query is None or not str(query).strip():
        return None
    if shutil.which("firecrawl") is None:
        return None
    cmd = ["firecrawl", "search", str(query)]
    run = subprocess_run or subprocess.run
    try:
        proc = run(cmd, capture_output=True, text=True)
    except Exception:
        return None
    if getattr(proc, "returncode", 1) != 0:
        return None
    return parse_track_output(getattr(proc, "stdout", ""), TRACK2_SOURCE)


def parse_track_output(stdout, source: str, authoritative_default: bool = False):
    """把 subprocess 的 stdout 解析、规范化为 track dict。

    两种形态都支持：
      * 测试/约定信封：顶层即 {"ok","facts","source","authoritative"} -> 原样返回（补 source）。
      * 真实 CLI 输出：results / data / content[].text(JSON-RPC) 等 -> 尽力提取 facts。
    空输出 / 非 JSON / 无结果 -> 返回 ok=False 的 track dict（不抛）。
    """
    if not stdout or not str(stdout).strip():
        return {"ok": False, "facts": [], "authoritative": authoritative_default, "source": source}
    try:
        data = json.loads(str(stdout))
    except (ValueError, TypeError):
        return {"ok": False, "facts": [], "authoritative": authoritative_default, "source": source}

    # 已是约定信封
    if isinstance(data, dict) and "ok" in data and "source" in data and "facts" in data:
        data.setdefault("authoritative", authoritative_default)
        data["source"] = data.get("source") or source
        return data

    results = _extract_results(data)
    if not results:
        return {"ok": False, "facts": [], "authoritative": authoritative_default, "source": source}

    facts = []
    authoritative = authoritative_default
    for it in results:
        if isinstance(it, dict):
            text = it.get("text") or it.get("snippet") or it.get("title") or it.get("content") or ""
            field = it.get("field") or it.get("key") or ""
            value = it.get("value") if it.get("value") is not None else text
            # 带有 url / citation / source 视为更权威
            if it.get("url") or it.get("citation") or it.get("source"):
                authoritative = True
            facts.append(
                {"field": field, "value": value, "text": text} if field
                else {"text": text}
            )
        else:
            facts.append({"text": str(it)})
    return {"ok": True, "facts": facts, "authoritative": authoritative, "source": source}


def _extract_results(data):
    """从真实 CLI 输出尽力提取结果列表。"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("results", "items", "data", "hits"):
            if isinstance(data.get(k), list):
                return data[k]
        if isinstance(data.get("content"), list):  # JSON-RPC: content[].text 可能内嵌 JSON
            out = []
            for c in data["content"]:
                if isinstance(c, dict) and isinstance(c.get("text"), str):
                    try:
                        sub = json.loads(c["text"])
                        out.extend(_extract_results(sub))
                    except Exception:
                        out.append(c["text"])
                else:
                    out.append(c)
            return out
    return []


# ---------------------------------------------------------------------------
# 阶段 D（原生兜底探测，P3 关键）
# ---------------------------------------------------------------------------
def check_native_available(capabilities=None) -> bool:
    """探测宿主是否具备 Agent 原生 web_search/web_fetch 兜底能力。

    P3 关键：默认 True（假设宿主具备 web_search/web_fetch）。
    允许注入以构造可测分支：
      * check_native_available(False)            -> False（模拟原生兜底不可用）
      * check_native_available(True)             -> True
      * check_native_available({"web_search":1}) -> True（有任一原生工具即视为可用）
    返回值为 bool，使"原生兜底不可用"分支可被单测覆盖。
    """
    if capabilities is None:
        return True
    if isinstance(capabilities, bool):
        return capabilities
    if isinstance(capabilities, dict):
        return bool(capabilities.get("web_search") or capabilities.get("web_fetch"))
    return bool(capabilities)


# ---------------------------------------------------------------------------
# 阶段 B（多来源印证）+ 阶段 C（补台降级已隐含在单源判定）
# ---------------------------------------------------------------------------
def _single_marked(track: dict) -> dict:
    src = track.get("source", "?")
    return {"mark": MARK_SINGLE, "text": _display(track.get("facts", [{}])[0])
            if track.get("facts") else "(无事实)", "source": f"{src}(待核实)"}


def _resolve_conflict(t1: dict, t2: dict) -> dict:
    """冲突裁决：返回被采纳的 track。

    规则（确定性、可复现）：
      1) authoritative=True 者优先；
      2) 双方权威相同或都不权威 -> 按轨道顺序：AnySearch(轨道1) 优先于 Firecrawl(轨道2)。
    文档化 tie-break，避免随机性导致测试结果不可复现。
    """
    a1 = bool(t1.get("authoritative"))
    a2 = bool(t2.get("authoritative"))
    if a1 and not a2:
        return t1
    if a2 and not a1:
        return t2
    # 权威性相同：轨道顺序 AnySearch(轨道1) 优先
    return t1 if t1.get("source") == TRACK1_SOURCE else t2


def corroborate(r1, r2) -> list:
    """阶段 B 多来源印证（确定性、可注入、不依赖网络）。

    输入：两个 track 结果 dict（或 None）。
    返回：已打标的 fact 列表（每个含 mark / text / source / field 等）。

    规则：
      * 两轨均 ok 且核心事实（同字段同值）相同 -> ✅互证
      * 仅一轨 ok                          -> ⚠️单源（注明来源，待核实）
      * 两轨均 ok 但同字段异值（冲突）       -> ❌冲突已裁决，按权威权重裁决
      * 两轨均不 ok（ok=False 或 None）      -> 返回 []（交给 fallback_cascade）
    """
    t1 = r1 if isinstance(r1, dict) and r1.get("ok") else None
    t2 = r2 if isinstance(r2, dict) and r2.get("ok") else None

    if not t1 and not t2:
        return []

    if t1 and not t2:
        return [_single_marked(t1)]
    if t2 and not t1:
        return [_single_marked(t2)]

    # 两轨均 ok
    i1, i2 = _index(t1), _index(t2)
    marked = []
    shared = set(i1) & set(i2)
    only1 = set(i1) - set(i2)
    only2 = set(i2) - set(i1)

    for f in shared:
        v1, raw1 = i1[f]
        v2, raw2 = i2[f]
        if v1 == v2:
            marked.append({
                "mark": MARK_CORROB,
                "text": _display(raw1) or _display(raw2),
                "source": f"{TRACK1_SOURCE}+{TRACK2_SOURCE}",
                "field": f,
            })
        else:
            adopted = _resolve_conflict(t1, t2)
            adopted_src = adopted.get("source")
            raw_adopted = raw1 if adopted_src == TRACK1_SOURCE else raw2
            marked.append({
                "mark": MARK_CONFLICT,
                "text": _display(raw_adopted),
                "source": f"{adopted_src}(采纳)",
                "adopted": adopted_src,
                "field": f,
                "conflict": {TRACK1_SOURCE: _display(raw1), TRACK2_SOURCE: _display(raw2)},
            })

    for f in only1:
        marked.append({"mark": MARK_SINGLE, "text": _display(i1[f][1]),
                       "source": f"{TRACK1_SOURCE}(待核实)", "field": f})
    for f in only2:
        marked.append({"mark": MARK_SINGLE, "text": _display(i2[f][1]),
                       "source": f"{TRACK2_SOURCE}(待核实)", "field": f})

    return marked


# ---------------------------------------------------------------------------
# 阶段 D（原生兜底级联，P3 护栏：严禁静默跳过）
# ---------------------------------------------------------------------------
def fallback_cascade(r1, r2, native_available: bool) -> list | dict:
    """当两轨结果皆为空/失败时调用。

    * native_available=True  -> 返回原生兜底标记列表（➖缺失 / 原生兜底 说明），绝不静默空过。
    * native_available=False -> 返回显式结果 {"status":"NEED_USER","reason":...}。
                              （P3 护栏：严禁静默返回空，必须显式告知用户）
    """
    if native_available:
        return [{
            "mark": MARK_MISSING,  # ➖缺失：对齐 SKILL.md 四级采信标记
            "text": "(双轨均失败，已启用 Agent 原生 web_search/web_fetch 兜底，结果须二次核实)",
            "source": MARK_NATIVE,  # 来源清单标注「原生兜底」
        }]
    return {
        "status": "NEED_USER",
        "reason": "双轨与原生兜底均不可用，须告知用户",
    }


# ---------------------------------------------------------------------------
# 阶段 E（复审裁决落盘，统一 schema）
# ---------------------------------------------------------------------------
def build_sources(query, r1, r2, native_used: bool) -> list:
    srcs = []
    if isinstance(r1, dict) and r1.get("ok"):
        srcs.append(f"{TRACK1_SOURCE}: {query}")
    if isinstance(r2, dict) and r2.get("ok"):
        srcs.append(f"{TRACK2_SOURCE}: {query}")
    if native_used:
        srcs.append(f"原生兜底: {query}")
    if not srcs:
        srcs.append("无可用来源（双轨与原生兜底均不可用）")
    return srcs


def assemble(subject: str, marked_facts: list, sources: list) -> str:
    """按 SKILL.md schema 组装 markdown 素材字符串。"""
    lines = ["## 主题：" + str(subject), "", "### 核心事实"]
    if not marked_facts:
        lines.append(f"- [{MARK_MISSING}] (无可用可信事实) — 来源：无")
    for m in marked_facts or []:
        text = m.get("text", "")
        mark = m.get("mark", MARK_SINGLE)
        src = m.get("source", "")
        lines.append(f"- [{mark}] {text} — 来源：{src}")
    lines.append("")
    lines.append("### 来源清单")
    for s in sources or []:
        lines.append("- " + str(s))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# 产物 schema 校验（单一事实源：web-search/validate_output.py）
# ---------------------------------------------------------------------------
# 注意：落盘素材的「采信标记 / 来源清单」合规校验唯一实现位于
# web-search/validate_output.py::validate_output_markdown(text) -> list[str]
# （空列表=合规）。本模块不再维护第二份签名不同、逻辑分叉的校验器，
# 以避免「双实现不一致 / 同名遮蔽」陷阱（同一文档两种校验结论相悖）。
# 测试套件统一从 validate_output 导入该校验器对 assemble/fallback 产物做交叉验证。


# ---------------------------------------------------------------------------
# 全链路编排
# ---------------------------------------------------------------------------
def run_full(subject, query, max_results: int = 5, skill_root=None,
             subprocess_run=None, check_native=None, native_available=None) -> dict:
    """跑完整链路（A→B→C→D→E），返回结构化结果 dict。

    返回：{
      "status": "OK" | "NEED_USER",
      "markdown": str,
      "marked": list,
      "sources": list,
      "r1": track|None, "r2": track|None,
    }
    native_available 为 None 时由 check_native() 决定（默认 check_native_available）。
    NEED_USER 分支：仍产出显式 markdown（说明无法兜底），绝不静默空输出。
    """
    r1 = run_track1(query, max_results, skill_root, subprocess_run)
    r2 = run_track2(query, subprocess_run)
    marked = corroborate(r1, r2)

    native_used = False
    status = "OK"

    if not marked:
        if native_available is None:
            cap = check_native() if check_native else check_native_available()
        else:
            cap = bool(native_available)
        fb = fallback_cascade(r1, r2, cap)
        if isinstance(fb, dict) and fb.get("status") == "NEED_USER":
            status = "NEED_USER"
            marked = [{
                "mark": MARK_MISSING,  # ➖缺失：无可信事实可采纳
                "text": f"(NEED_USER) {fb.get('reason', '须告知用户')}",
                "source": "系统",
            }]
        else:
            native_used = True
            marked = fb

    sources = build_sources(query, r1, r2, native_used)
    md = assemble(subject, marked, sources)
    return {
        "status": status,
        "markdown": md,
        "marked": marked,
        "sources": sources,
        "r1": r1,
        "r2": r2,
    }


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------
def _build_arg_parser():
    p = argparse.ArgumentParser(
        prog="orchestrate.py",
        description="web-search 链路编排：双轨印证 + 原生兜底 + 统一 schema 落盘",
    )
    p.add_argument("--subject", required=True, help="主题（用于文件名与标题）")
    p.add_argument("--query", required=True, help="检索查询")
    p.add_argument("--max_results", type=int, default=5, help="每轨最大结果数（1-10，默认5）")
    p.add_argument("--skill_root", default=None, help="技能根目录（默认脚本所在目录）")
    p.add_argument("--out", default=None, help="落盘目录（默认当前目录）")
    p.add_argument("--no-native", action="store_true",
                   help="模拟原生兜底不可用（注入 check_native_available(False)）")
    return p


def main(argv=None) -> int:
    args = _build_arg_parser().parse_args(argv)
    native = False if args.no_native else None
    res = run_full(
        subject=args.subject,
        query=args.query,
        max_results=args.max_results,
        skill_root=args.skill_root,
        native_available=native,
    )
    out_dir = args.out or os.getcwd()
    os.makedirs(out_dir, exist_ok=True)
    fname = f"{args.subject}_搜索素材.md"
    path = os.path.join(out_dir, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(res["markdown"])
    print(f"已写出: {path} (status={res['status']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
