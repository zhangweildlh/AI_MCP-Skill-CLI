#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
structure_audit.py — file-structure-organizer 的确定性检测引擎。

纯 Python 3 标准库实现，零第三方依赖，任何环境 `python3` 可直接运行。
对单个 Markdown 文件执行：
  · L1 词法层：第9条具名禁用词（读 banned_terms.txt，缺省用内嵌 10 词）。
  · L2 确定性算法：标题树解析、扁平/跳级、伪层级、章节号连续唯一、
    引用有向图方向审计（五类边）、Tarjan SCC 循环引用、索引两列匹配、
    盲点 A/B、导航可达性 MAP。
  · 六连验证（章号连续性 / 索引两列精确唯一 / 裸编号残留 / 围栏配对数 /
    导航可达性 / 节级引用精确命中）。
  · 四性结论（精准性 / 唯一性 / 一致性 / 可达性）。
  · L3 语义区段「语义待人工确认」：只列候选，绝不写回文件。

用法：
  python3 structure_audit.py TARGET.md            # Markdown 报告 → stdout
  python3 structure_audit.py TARGET.md --json    # JSON 报告
  python3 structure_audit.py TARGET.md --report R # 报告写入文件 R
  python3 structure_audit.py TARGET.md --strict   # 有 error 级 issue 则 exit 1
"""
from __future__ import annotations

import re
import sys
import os
import json
import argparse
from collections import defaultdict, OrderedDict
from dataclasses import dataclass, field, asdict

# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass
class Issue:
    rule: str
    severity: str          # error | warning | info
    line: int
    msg: str
    evidence: str = ""
    fix_hint: str = ""


@dataclass
class Heading:
    level: int
    text: str
    line: int
    chapter: int | None = None      # 章号
    sect: tuple | None = None       # (N, M, P) 节号
    order: int = 0                  # 全局出现序号（方向判定用）
    is_chapter: bool = False        # 是否为「第N章」章级标题（节级继承最近章号）


@dataclass
class Ref:
    kind: str            # backtick | bare | index
    raw: str             # 原文
    line: int            # 出现行
    container_order: int # 所在章节的 order
    target_chapter: int | None = None
    target_sect: tuple | None = None
    target_heading: 'Heading | None' = None
    edge: str = ""       # IDX | SAME | BACK | FWD | DANGLING


# 第9条具名禁用词（内嵌兜底，优先读 banned_terms.txt）
DEFAULT_BANNED = ["视情况", "一般", "通常", "酌情", "尽量", "尽可能",
                  "适当", "必要时", "原则上", "建议"]

# 索引/映射表表头特征（命中即该表第二列为 IDX 导航引用）
INDEX_HEADER_RE = re.compile(r"(速查索引|索引表|映射表|你要做的|你要阅读|你要执行|"
                             r"适用场景|对应章节|场景|目标|你要|映射)")

# 强约束句式（命中后禁用词判 error）
STRONG_RE = re.compile(r"(须|必须|禁止|不得|一律|务须|应|应当)")

# 引导动词（裸引用判定）
GUIDE_RE = re.compile(r"(见|引用|详见|按|参见|查|参照|依据|读|遵循|遵循本|查收)")

FENCE_RE = re.compile(r'^\s*(```+|~~~+)')


# ---------------------------------------------------------------------------
# 词法预处理：识别 frontmatter 与围栏代码块
# ---------------------------------------------------------------------------

def tokenize_lines(text: str):
    """返回每行的分类：frontmatter / fence / content。"""
    raw_lines = text.splitlines()
    n = len(raw_lines)
    kind = ["content"] * n
    # frontmatter：首行 --- 且后续有 --- 闭合
    if n >= 2 and raw_lines[0].strip() == "---":
        for i in range(1, n):
            if raw_lines[i].strip() == "---":
                for j in range(0, i + 1):
                    kind[j] = "frontmatter"
                break
    # 围栏代码块
    in_fence = False
    for i, ln in enumerate(raw_lines):
        if kind[i] != "content":
            continue
        m = FENCE_RE.match(ln)
        if m:
            in_fence = not in_fence
            kind[i] = "fence"
        elif in_fence:
            kind[i] = "fence"
    return raw_lines, kind


# ---------------------------------------------------------------------------
# 标题解析与章节号提取
# ---------------------------------------------------------------------------

HEADING_RE = re.compile(r'^(#{1,6})\s+(.+?)\s*$')
CHAPTER_RE = re.compile(r'^#{1,4}\s+第(\d+)章')
SECT_RE = re.compile(r'^#{1,4}\s+(\d+)\.(\d+)(?:\.(\d+))?')


def parse_headings(raw_lines, kind):
    headings = []
    order = 0
    current_chapter = None
    for i, ln in enumerate(raw_lines):
        if kind[i] != "content":
            continue
        m = HEADING_RE.match(ln)
        if not m:
            continue
        level = len(m.group(1))
        text = m.group(2).strip()
        chapter = None
        sect = None
        is_chapter = False
        mc = CHAPTER_RE.match(ln)
        if mc:
            # 章级标题：「第N章」
            chapter = int(mc.group(1))
            current_chapter = chapter
            sect = (chapter,)
            is_chapter = True
        else:
            ms = SECT_RE.match(ln)
            if ms:
                # 节级标题：「N.M」或「N.M.P」，章号继承最近的「第N章」
                nums = [int(x) for x in ms.groups() if x is not None]
                sect = tuple(nums)
                chapter = current_chapter
        headings.append(Heading(level=level, text=text, line=i + 1,
                                 chapter=chapter, sect=sect, order=order,
                                 is_chapter=is_chapter))
        order += 1
    return headings


def container_heading(headings, line):
    """返回包含给定行的章节标题（最后一条 line<=给定行的标题）。"""
    best = None
    for h in headings:
        if h.line <= line:
            best = h
        else:
            break
    return best


# ---------------------------------------------------------------------------
# 章节号连续唯一（第4条）
# ---------------------------------------------------------------------------

def audit_section_numbers(headings):
    issues = []
    # 章号连续性只基于章级标题（节级标题继承最近章号，不计入）
    chapters = [h.chapter for h in headings if h.is_chapter and h.chapter is not None]
    if chapters:
        lo, hi = min(chapters), max(chapters)
        present = set(chapters)
        missing = [c for c in range(lo, hi + 1) if c not in present]
        dup = [c for c in present if chapters.count(c) > 1]
        if missing:
            issues.append(Issue(
                rule="第4条·序号连续唯一", severity="error", line=0,
                msg=f"章号缺号：{missing}（章号范围 {lo}..{hi} 中缺 {len(missing)} 个）",
                evidence=f"实际章号集合={sorted(present)}",
                fix_hint="补全省略的章号或重排为连续序列"))
        if dup:
            issues.append(Issue(
                rule="第4条·序号连续唯一", severity="error", line=0,
                msg=f"章号重号：{sorted(set(dup))}",
                evidence=f"出现次数统计={ {c: chapters.count(c) for c in sorted(set(dup))} }",
                fix_hint="合并重复章节或重编号"))
    # 每章内 N.M 连续
    by_ch = defaultdict(list)
    for h in headings:
        if h.sect and len(h.sect) >= 2 and h.chapter:
            by_ch[h.chapter].append((h.sect[1], h.line))
    for ch, lst in by_ch.items():
        nums = sorted([x[0] for x in lst])
        if not nums:
            continue
        lo, hi = min(nums), max(nums)
        present = set(nums)
        missing = [m for m in range(lo, hi + 1) if m not in present]
        if missing:
            issues.append(Issue(
                rule="第4条·序号连续唯一", severity="warning", line=0,
                msg=f"第{ch}章内节号缺号：{missing}（范围 {lo}..{hi} 缺 {len(missing)} 个）",
                evidence=f"实际节号={nums}",
                fix_hint="补齐节号或重排为连续序列"))
    return issues


# ---------------------------------------------------------------------------
# 扁平/跳级（第2条）、伪层级（第3条）
# ---------------------------------------------------------------------------

def audit_flatness(headings):
    issues = []
    for idx in range(1, len(headings)):
        prev, cur = headings[idx - 1], headings[idx]
        if cur.level - prev.level > 1:
            issues.append(Issue(
                rule="第2条·层级递进", severity="error", line=cur.line,
                msg=f"标题层级跳级：{prev.level} 级直降 {cur.level} 级",
                evidence=f"前：「{prev.text}」({prev.level}级) → 后：「{cur.text}」({cur.level}级)",
                fix_hint="插入中间层级标题，避免跨级"))
    return issues


def audit_pseudo_level(raw_lines, kind):
    issues = []
    for i, ln in enumerate(raw_lines):
        if kind[i] != "content":
            continue
        s = ln.expandtabs()
        stripped = s.lstrip()
        if not stripped:
            continue
        indent = len(s) - len(stripped)
        # 缩进 + 非列表项文本 → 疑似用缩进伪装层级
        if indent >= 2 and not re.match(r'^([*\-+]|\d+\.)\s', stripped):
            issues.append(Issue(
                rule="第3条·层级标记", severity="warning", line=i + 1,
                msg="疑似用缩进伪装层级（非标题、非列表）",
                evidence=stripped[:60],
                fix_hint="改用 # 标题语法表达层级"))
        # 手动编号伪装层级（中文序号伪装章节标题，如「一、概述」「（二）方法」；
        # 阿拉伯数字有序列表「1. 步骤」属合法 GFM 列表，不视为伪装层级）
        if re.match(r'^（?[一二三四五六七八九十百零]+[、．.\)）]\s*', stripped):
            issues.append(Issue(
                rule="第3条·层级标记", severity="warning", line=i + 1,
                msg="疑似用手动编号伪装层级",
                evidence=stripped[:60],
                fix_hint="改用 # 标题语法表达层级"))
    return issues


# ---------------------------------------------------------------------------
# 噪声排除（版本号/CLI/URL/路径/自然语言）
# ---------------------------------------------------------------------------

_ASCII_NOISE_RE = re.compile(r'[A-Za-z0-9./:-]')

def is_number_noise(text, start, end):
    """判断 N.M 周边是否为版本号/路径/URL 等噪声（仅 ASCII 触发）。
    中文无词边界，前置中文字符（如引导动词「见」「按」）不触发，
    避免误伤中文裸引用。"""
    before = text[start - 1] if start > 0 else ""
    before2 = text[start - 2] if start > 1 else ""
    after = text[end] if end < len(text) else ""
    if before and before != " " and _ASCII_NOISE_RE.match(before):
        return True
    if before2 and before2 != " " and _ASCII_NOISE_RE.match(before2):
        return True
    if after and _ASCII_NOISE_RE.match(after):
        return True
    return False


# ---------------------------------------------------------------------------
# 引用提取
# ---------------------------------------------------------------------------

BACKTICK_RE = re.compile(r'`([^`\n]+)`')
BARE_SECT_RE = re.compile(r'第(\d+)章|(\d+)\.(\d+)(?:\.(\d+))?')
INDEX_TABLE_RE = re.compile(r'^\s*\|(.+)\|\s*$')


def extract_references(raw_lines, kind, headings):
    refs = []
    n = len(raw_lines)
    index_lines = set()
    # 第一遍：识别索引/映射表区域（表头含索引特征 + 下一行为分隔行）
    for i in range(n):
        if kind[i] != "content":
            continue
        if not INDEX_TABLE_RE.match(raw_lines[i]):
            continue
        cells = [c.strip() for c in raw_lines[i].strip().strip('|').split('|')]
        header_text = " ".join(cells)
        if not INDEX_HEADER_RE.search(header_text):
            continue
        if i + 1 < n and re.match(r'^\s*\|[\s:|-]+\|\s*$', raw_lines[i + 1]):
            j = i + 2
            while j < n and INDEX_TABLE_RE.match(raw_lines[j]) \
                    and not re.match(r'^\s*\|[\s:|-]+\|\s*$', raw_lines[j]):
                index_lines.add(j)
                j += 1
    # 第二遍：抽取引用
    for i, ln in enumerate(raw_lines):
        if kind[i] != "content":
            continue
        if i in index_lines:
            cells = [c.strip() for c in ln.strip().strip('|').split('|')]
            if len(cells) >= 2:
                refs.append(_make_ref("index", cells[1], i + 1, headings,
                                      is_index=True))
            continue
        # 反引号包裹的节级标题引用
        for m in BACKTICK_RE.finditer(ln):
            inner = m.group(1)
            if re.match(r'#{1,4}\s', inner) or re.search(r'第\d+章', inner) \
                    or re.match(r'\d+\.\d+', inner):
                refs.append(_make_ref("backtick", inner, i + 1, headings))
        # 裸引用（带引导动词）
        for m in GUIDE_RE.finditer(ln):
            seg = ln[m.end():m.end() + 12]
            for bm in BARE_SECT_RE.finditer(seg):
                s = bm.start() + m.end()
                e = bm.end() + m.end()
                if is_number_noise(ln, s, e):
                    continue
                refs.append(_make_ref("bare", bm.group(0), i + 1, headings))
    return refs


def _make_ref(kind, raw, line, headings, is_index=False):
    ref = Ref(kind=kind, raw=raw, line=line,
              container_order=0)
    cont = container_heading(headings, line)
    ref.container_order = cont.order if cont else -1
    # 解析目标章/节
    mc = re.search(r'第(\d+)章', raw)
    if mc:
        ref.target_chapter = int(mc.group(1))
    ms = re.search(r'(\d+)\.(\d+)(?:\.(\d+))?', raw)
    if ms:
        nums = [int(x) for x in ms.groups() if x is not None]
        ref.target_sect = tuple(nums)
        if ref.target_chapter is None and nums:
            ref.target_chapter = nums[0]
    # 命中真实标题
    ref.target_heading = match_heading(headings, raw, ref.target_chapter, ref.target_sect)
    return ref


def match_heading(headings, raw, chapter, sect):
    """根据引用文本匹配真实标题。"""
    inner = raw.strip().strip('`').strip()
    # 反引号内完整标题直接匹配
    for h in headings:
        if h.text == inner or inner.endswith(h.text) or h.text in inner:
            return h
    # 按章/节号匹配
    if sect:
        for h in headings:
            if h.sect == sect:
                return h
    if chapter is not None:
        for h in headings:
            if h.chapter == chapter:
                return h
    return None


# ---------------------------------------------------------------------------
# 引用方向分类 + 循环引用（Tarjan SCC）
# ---------------------------------------------------------------------------

def classify_refs(refs, headings):
    issues = []
    for r in refs:
        if r.kind == "index":
            r.edge = "IDX"
            # IDX 须校验：被引章号 > 引用章号（真前向）且目标精准唯一
            cont = next((h for h in headings if h.order == r.container_order), None)
            if r.target_heading is None:
                issues.append(Issue(
                    rule="第12条·索引两列·导航豁免", severity="error", line=r.line,
                    msg=f"索引表条目目标不可达：{r.raw}",
                    evidence="被引标题未在正文命中",
                    fix_hint="修正第二列为真实存在的反引号节级标题"))
            elif cont is not None and r.target_heading.order <= cont.order:
                issues.append(Issue(
                    rule="第12条·索引两列·导航豁免", severity="warning", line=r.line,
                    msg=f"索引前向引用非真前向（被引章号未大于引用章号）：{r.raw}",
                    evidence=f"引用章节 order={cont.order}, 目标 order={r.target_heading.order}",
                    fix_hint="确认索引/映射表的导航豁免是否成立"))
            # 索引第二列格式合规检查
            if not re.match(r'`#{1,4}\s', r.raw.strip()) and '`' not in r.raw:
                issues.append(Issue(
                    rule="第12条·索引两列格式", severity="error", line=r.line,
                    msg=f"索引第二列未用反引号包裹完整标题前缀：{r.raw}",
                    evidence="应为 `## 第N章` / `### X.Y` 形态",
                    fix_hint="改为反引号包裹含完整前缀的节级标题"))
            continue
        # 非 IDX：按方向分类
        if r.target_heading is None:
            r.edge = "DANGLING"
            issues.append(Issue(
                rule="第10条·引用方向·DANGLING", severity="error", line=r.line,
                msg=f"引用目标不存在或不可达：{r.raw}",
                evidence="被引章/节号未在正文标题中命中",
                fix_hint="修正引用指向真实存在的章节，或补建目标章节"))
            continue
        if r.container_order == r.target_heading.order:
            r.edge = "SAME"
        elif r.container_order < r.target_heading.order:
            r.edge = "FWD"   # 前序引后序（非法，正文叙述性须整改）
            issues.append(Issue(
                rule="第10条·引用方向·FWD", severity="error", line=r.line,
                msg=f"前向引用（前序引后序，正文叙述性须整改）：{r.raw}",
                evidence=f"引用位于 order={r.container_order}，目标 order={r.target_heading.order}",
                fix_hint="改为后序引用前序，或移入索引/映射表（导航豁免）"))
        else:
            r.edge = "BACK"  # 后序引前序（合法）
    return issues


def tarjan_scc(nodes, adj):
    index_counter = [0]
    stack = []
    lowlink = {}
    index = {}
    on_stack = {}
    result = []

    for v in nodes:
        if v in index:
            continue
        work = [(v, 0)]
        while work:
            node, pi = work[-1]
            if pi == 0:
                index[node] = index_counter[0]
                lowlink[node] = index_counter[0]
                index_counter[0] += 1
                stack.append(node)
                on_stack[node] = True
            recurse = False
            neighbors = adj.get(node, [])
            for i in range(pi, len(neighbors)):
                w = neighbors[i]
                if w not in index:
                    work[-1] = (node, i + 1)
                    work.append((w, 0))
                    recurse = True
                    break
                elif on_stack.get(w):
                    lowlink[node] = min(lowlink[node], index[w])
            if recurse:
                continue
            if lowlink[node] == index[node]:
                comp = []
                while True:
                    w = stack.pop()
                    on_stack[w] = False
                    comp.append(w)
                    if w == node:
                        break
                result.append(comp)
            work.pop()
            if work:
                parent = work[-1][0]
                lowlink[parent] = min(lowlink[parent], lowlink[node])
    return result


def audit_cycles(refs, headings, raw_lines):
    """按章级建引用有向图（container 所在章 → 被引章），Tarjan 求 SCC；
    size>1 即循环引用（如第1章引第2章且第2章引第1章）。"""
    issues = []
    nodes = set()
    adj = defaultdict(list)
    line_to_refs = defaultdict(list)   # 章号 → 产生该边的引用行
    for r in refs:
        if r.kind == "index" or r.edge in ("IDX", "DANGLING", "SAME"):
            continue
        cont = next((h for h in headings if h.order == r.container_order), None)
        if cont is None or cont.chapter is None or r.target_heading is None \
                or r.target_heading.chapter is None:
            continue
        c_ch, t_ch = cont.chapter, r.target_heading.chapter
        if c_ch == t_ch:
            continue
        nodes.add(c_ch)
        nodes.add(t_ch)
        adj[c_ch].append(t_ch)
        line_to_refs[c_ch].append(r.line)
        line_to_refs[t_ch].append(r.line)
    sccs = tarjan_scc(list(nodes), adj)
    for comp in sccs:
        if len(comp) > 1:
            ref_lines = set()
            for ch in comp:
                ref_lines.update(line_to_refs.get(ch, []))
            necessary = any(
                (0 < rl <= len(raw_lines)) and ("必要循环" in raw_lines[rl - 1])
                for rl in ref_lines)
            sev = "info" if necessary else "error"
            issues.append(Issue(
                rule="第11条·循环引用",
                severity=sev,
                line=min(ref_lines) if ref_lines else 0,
                msg=f"{'必要' if necessary else '非必要'}循环引用（涉及章：{sorted(comp)}）",
                evidence=f"涉及章号：{sorted(comp)}"
                         + ("【已标注「必要循环」，豁免】" if necessary else ""),
                fix_hint="非必要循环须破除（删除正文叙述性 FWD 边）；"
                         "必要循环须显式标注「必要循环」"))
    return issues


# ---------------------------------------------------------------------------
# 盲点 A / B（第12条）
# ---------------------------------------------------------------------------

def audit_blind_spots(refs, raw_lines):
    issues = []
    # 盲点 A：带引导动词且未反引号包裹的裸引用（与已抽 bare 重叠，这里补格式提醒）
    for r in refs:
        if r.kind == "bare":
            issues.append(Issue(
                rule="第12条·盲点A（裸引用）", severity="warning", line=r.line,
                msg=f"裸引用未用反引号包裹：{r.raw}",
                evidence="带引导动词的裸 第N章/X.Y",
                fix_hint="改为反引号包裹的节级标题引用，与索引第二列逐字一致"))
    # 盲点 B：反引号章标题但节号裸露在外
    bt_re = re.compile(r'`#{1,4}\s+第?\d+[章\.][^`]*`\s*(\d+\.\d+(?:\.\d+)?)')
    for i, ln in enumerate(raw_lines):
        for m in bt_re.finditer(ln):
            issues.append(Issue(
                rule="第12条·盲点B（节号裸露）", severity="error", line=i + 1,
                msg=f"反引号章标题外裸节号：{m.group(0)}",
                evidence="章标题已合规但节号裸露，易被「0残留」假结论掩盖",
                fix_hint="将裸节号并入反引号，或直接引用真实小节标题"))
    return issues


# ---------------------------------------------------------------------------
# 索引两列一致 + 导航可达性 MAP
# ---------------------------------------------------------------------------

def audit_index_consistency(refs, headings, raw_lines):
    issues = []
    index_refs = [r for r in refs if r.kind == "index"]
    # 索引第二列须与正文标题逐字一致；比对时先剥去 Markdown 标题前缀（# 序列+空格），
    # 因为第12条格式基准要求索引/引用带完整前缀（如 `### 12.3 阶段 2 整改`），
    # 剥前缀后的核心文本与正文标题一致即视为一致，避免误 warning。
    for r in index_refs:
        inner = r.raw.strip().strip('`').strip()
        inner_core = re.sub(r'^#{1,4}\s+', '', inner).strip()
        hit = match_heading(headings, r.raw, r.target_chapter, r.target_sect)
        if hit and inner_core != hit.text:
            issues.append(Issue(
                rule="第12条·索引逐字一致", severity="warning", line=r.line,
                msg=f"索引第二列与正文标题不完全一致：{r.raw} ≠ 「{hit.text if hit else ''}」",
                evidence="建议索引第二列与跨章节引用格式逐字同形",
                fix_hint="统一为同一节级标题文本"))
    return issues, index_refs


def audit_navigation(index_refs, headings):
    """MAP：索引每条目目标须精确命中真实标题。"""
    total = len(index_refs)
    passed = 0
    failures = []
    for r in index_refs:
        if r.target_heading is not None:
            passed += 1
        else:
            failures.append(r.raw)
    # 真空成立边界：文档不含索引/映射表时（total==0），导航可达性不适用，
    # 判 N/A 而非 FAIL，避免对通用目标文件（多数无索引表）假阳性。
    ok = (total == 0 or passed == total)
    return ok, passed, total, failures


# ---------------------------------------------------------------------------
# L1 禁用词（第9条）
# ---------------------------------------------------------------------------

def load_banned():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "banned_terms.txt")
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as f:
                words = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
            if words:
                return words
        except Exception:
            pass
    return DEFAULT_BANNED


def audit_banned_terms(raw_lines, kind, banned):
    issues = []
    total = 0
    errors = 0
    for i, ln in enumerate(raw_lines):
        if kind[i] != "content":
            continue
        # 定义列举行豁免：第9条「具名禁用词」定义自身会列举这些词，
        # 属自指，不应判违规。启发式：同行出现 ≥3 个禁用词且含
        # 「禁用词/违规」字样 → 视为定义列举行，整行跳过。
        hits_in_line = [w for w in banned if w in ln]
        if len(hits_in_line) >= 3 and ("禁用词" in ln or "违规" in ln):
            continue
        for w in banned:
            idx = 0
            while True:
                p = ln.find(w, idx)
                if p == -1:
                    break
                total += 1
                ctx = ln[max(0, p - 6):p + len(w) + 6]
                is_error = bool(STRONG_RE.search(ln))  # 强约束句式下命中即违规
                if is_error:
                    errors += 1
                    issues.append(Issue(
                        rule="第9条·无歧义·禁用词", severity="error", line=i + 1,
                        msg=f"强制条款出现禁用词「{w}」",
                        evidence=ctx,
                        fix_hint="改为唯一可执行、无余地的硬性表述"))
                else:
                    issues.append(Issue(
                        rule="第9条·无歧义·禁用词", severity="warning", line=i + 1,
                        msg=f"出现禁用词「{w}」（非强制条款上下文）",
                        evidence=ctx,
                        fix_hint="如处在强制条款，须改为硬性表述"))
                idx = p + len(w)
    return issues, total, errors


# ---------------------------------------------------------------------------
# 六连验证 + 四性结论
# ---------------------------------------------------------------------------

def six_connection(chapter_issues, banned_total, nav_ok, nav_pass, nav_total,
                   fence_even, bare_residue, index_unique, sect_hit_ok):
    rows = []
    rows.append(("章号连续性", "PASS" if not any(i.severity == "error" for i in chapter_issues)
                 else "FAIL", f"缺号/重号 issue={sum(1 for i in chapter_issues if i.severity=='error')}"))
    rows.append(("索引两列精确唯一", "PASS" if index_unique else "FAIL",
                 "索引第二列均命中且格式合规" if index_unique else "存在未命中/格式违规"))
    rows.append(("裸编号残留", "PASS" if bare_residue == 0 else "FAIL", f"裸引用 issue={bare_residue}"))
    rows.append(("围栏配对数", "PASS" if fence_even else "FAIL", "偶数" if fence_even else "奇数（奇偶失配）"))
    # 真空成立边界：文档不含索引/映射表（nav_total==0）时导航可达性不适用，判 N/A 而非 FAIL
    if nav_total == 0:
        rows.append(("导航可达性", "N/A", "文档无索引/映射表，导航可达性不适用"))
    else:
        rows.append(("导航可达性", "PASS" if nav_ok else "FAIL", f"{nav_pass}/{nav_total}"))
    rows.append(("节级引用精确命中", "PASS" if sect_hit_ok else "FAIL",
                 "全部反引号引用命中真实标题" if sect_hit_ok else "存在未命中"))
    return rows


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def analyze(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    raw_lines, kind = tokenize_lines(text)

    # 围栏配对数（仅统计围栏分隔符行，不含围栏内正文）
    fence_delim = sum(1 for i, ln in enumerate(raw_lines) if kind[i] != "frontmatter"
                      and FENCE_RE.match(ln))
    fence_even = (fence_delim % 2 == 0)

    headings = parse_headings(raw_lines, kind)
    banned = load_banned()

    issues = []
    issues += audit_section_numbers(headings)
    issues += audit_flatness(headings)
    issues += audit_pseudo_level(raw_lines, kind)
    banned_issues, banned_total, banned_errors = audit_banned_terms(raw_lines, kind, banned)
    issues += banned_issues

    refs = extract_references(raw_lines, kind, headings)
    issues += classify_refs(refs, headings)
    issues += audit_cycles(refs, headings, raw_lines)
    issues += audit_blind_spots(refs, raw_lines)
    idx_issues, index_refs = audit_index_consistency(refs, headings, raw_lines)
    issues += idx_issues

    nav_ok, nav_pass, nav_total, nav_fail = audit_navigation(index_refs, headings)

    # 派生指标
    bare_residue = sum(1 for i in issues if i.rule.startswith("第12条·盲点A"))
    index_unique = not any(i.rule.startswith("第12条·索引") and i.severity == "error"
                           for i in issues)
    bt_refs = [r for r in refs if r.kind == "backtick"]
    sect_hit_ok = all(r.target_heading is not None for r in bt_refs)
    chap_err = any(i.severity == "error" for i in issues
                   if i.rule.startswith("第4条"))

    six = six_connection(
        [i for i in issues if i.rule.startswith("第4条")],
        banned_total, nav_ok, nav_pass, nav_total,
        fence_even, bare_residue, index_unique, sect_hit_ok)

    four = [
        ("精准性", "PASS" if sect_hit_ok and not any(i.rule.startswith("第12条·索引逐字") and i.severity=="error" for i in issues) else "FAIL",
         "反引号引用均精准命中真实标题"),
        ("唯一性", "PASS" if not any(i.rule.startswith("第4条") and i.severity=="error" for i in issues) else "FAIL",
         "章节号唯一、无重号"),
        ("一致性", "PASS" if not any(i.rule.startswith("第9条") and i.severity=="error" for i in issues) else "FAIL",
         "无歧义禁用词、表述一致"),
        # 真空成立边界：文档无索引/映射表（nav_total==0）时可达性不适用，判 N/A 而非 PASS/FAIL
        ("可达性", "N/A" if nav_total == 0 else ("PASS" if nav_ok else "FAIL"),
         "文档无索引/映射表，不适用" if nav_total == 0 else f"导航 {nav_pass}/{nav_total} 通过"),
    ]

    # 六类违规（用于与 organizer 验收闸门对接）
    fwd = [r for r in refs if r.edge == "FWD"]
    dangling = [r for r in refs if r.edge == "DANGLING"]
    cycles = [i for i in issues if i.rule.startswith("第11条") and i.severity == "error"]
    dup = [i for i in issues if i.rule.startswith("第4条") and "重号" in i.msg]
    adjacency = []  # L3 语义，不自动判定
    ambiguous = [i for i in issues if i.rule.startswith("第9条") and i.severity == "error"]

    l3 = {
        "第1条_标题内容匹配": [h.text for h in headings],
        "第5条_相邻与线性排序": "需人工核对相关章节是否被打散",
        "第7条_单一事源重述": "需人工核对相同语义是否多处重述",
        "第9条_非具名歧义": [i.evidence for i in ambiguous],
        "第11条_必要循环裁定": [i.evidence for i in cycles if i.severity == "info"],
    }

    summary = {
        "path": path,
        "total_lines": len(raw_lines),
        "heading_count": len(headings),
        "issue_error": sum(1 for i in issues if i.severity == "error"),
        "issue_warning": sum(1 for i in issues if i.severity == "warning"),
        "banned_total": banned_total,
        "banned_error": banned_errors,
        "ref_total": len(refs),
        "ref_fwd": len(fwd),
        "ref_dangling": len(dangling),
        "navigation": f"{nav_pass}/{nav_total}",
        "fence_even": fence_even,
    }

    return {
        "summary": summary,
        "issues": [asdict(i) for i in issues],
        "refs": [{"kind": r.kind, "raw": r.raw, "line": r.line, "edge": r.edge}
                 for r in refs],
        "six_connection": [{"name": n, "result": r, "evidence": e} for n, r, e in six],
        "four_properties": [{"name": n, "result": r, "evidence": e} for n, r, e in four],
        "l3": l3,
    }


# ---------------------------------------------------------------------------
# 报告渲染
# ---------------------------------------------------------------------------

def render_markdown(report: dict) -> str:
    s = report["summary"]
    out = []
    out.append("# 文件结构化组织 · 确定性检测报告\n")
    out.append(f"- 文件：`{s['path']}`")
    out.append(f"- 总行数：{s['total_lines']} ｜ 标题数：{s['heading_count']}")
    out.append(f"- 问题：error {s['issue_error']} ｜ warning {s['issue_warning']}")
    out.append(f"- 禁用词命中 {s['banned_total']}（error {s['banned_error']}）")
    out.append(f"- 引用 {s['ref_total']}（FWD {s['ref_fwd']} ｜ DANGLING {s['ref_dangling']}）")
    out.append(f"- 导航可达：{s['navigation']} ｜ 围栏配对偶数：{s['fence_even']}\n")

    out.append("## 一、L1 禁用词检测（第9条）")
    out.append(f"命中 {s['banned_total']} 处，其中 error {s['banned_error']} 处。\n")

    out.append("## 二、L2 结构检测（第2/3/4条）")
    struct = [i for i in report["issues"]
              if i["rule"].startswith(("第2条", "第3条", "第4条"))]
    _emit_issues(out, struct)

    out.append("## 三、引用有向图与方向性（第10/12条）")
    out.append("六类边统计：")
    edges = {}
    for r in report["refs"]:
        edges[r["edge"]] = edges.get(r["edge"], 0) + 1
    out.append("  " + "  ".join(f"{k}={v}" for k, v in edges.items()))
    dir_issues = [i for i in report["issues"]
                  if i["rule"].startswith(("第10条", "第12条·索引两列·导航豁免", "第12条·索引两列格式"))]
    _emit_issues(out, dir_issues)

    out.append("## 四、循环引用（第11条 · Tarjan SCC）")
    cyc = [i for i in report["issues"] if i["rule"].startswith("第11条")]
    _emit_issues(out, cyc)

    out.append("## 五、索引两列匹配 + 盲点 A/B（第12条）")
    idxb = [i for i in report["issues"]
            if i["rule"].startswith(("第12条·索引逐字", "第12条·盲点"))]
    _emit_issues(out, idxb)

    out.append("## 六、导航可达性 MAP（第12条）")
    out.append(f"导航可达：{s['navigation']}（分母为索引/映射表条目数）。\n")

    out.append("## 七、六连验证表")
    out.append("| 项目 | 结果 | 证据 |")
    out.append("| --- | --- | --- |")
    for row in report["six_connection"]:
        out.append(f"| {row['name']} | {row['result']} | {row['evidence']} |")
    out.append("")

    out.append("## 八、四性结论表")
    out.append("| 性质 | 结果 | 证据 |")
    out.append("| --- | --- | --- |")
    for row in report["four_properties"]:
        out.append(f"| {row['name']} | {row['result']} | {row['evidence']} |")
    out.append("")

    out.append("## 九、L3 语义待人工确认（只报告，不写回）")
    for k, v in report["l3"].items():
        if isinstance(v, list):
            out.append(f"- **{k}**：{len(v)} 项 → {v if v else '无'}")
        else:
            out.append(f"- **{k}**：{v}")
    out.append("")

    out.append("## 十、整改建议清单")
    fixes = [i for i in report["issues"] if i["severity"] == "error"]
    if not fixes:
        out.append("无 error 级问题，文档结构合规。")
    else:
        for i in fixes:
            out.append(f"- L{i['line']}｜{i['rule']}｜{i['msg']} → {i['fix_hint']}")
    return "\n".join(out)


def _emit_issues(out, items):
    if not items:
        out.append("  无问题。")
    else:
        for i in items:
            out.append(f"- L{i['line']}｜{i['severity']}｜{i['rule']}｜{i['msg']}"
                       + (f"（证据：{i['evidence']}）" if i['evidence'] else ""))
    out.append("")


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="file-structure-organizer 确定性检测引擎")
    ap.add_argument("target", help="待检测的 Markdown 文件路径")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--report", help="报告写入文件")
    ap.add_argument("--strict", action="store_true", help="有 error 则 exit 1")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.target):
        print(f"❌ 文件不存在：{args.target}", file=sys.stderr)
        return 2
    if not args.target.lower().endswith((".md", ".markdown")):
        print(f"❌ 非 Markdown 文件：{args.target}", file=sys.stderr)
        return 2

    try:
        report = analyze(args.target)
    except Exception as e:
        print(f"❌ 分析异常：{e}", file=sys.stderr)
        return 3

    rendered = json.dumps(report, ensure_ascii=False, indent=2) if args.json \
        else render_markdown(report)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as f:
            f.write(rendered)
        print(f"报告已写入：{args.report}")
    else:
        print(rendered)

    if args.strict and report["summary"]["issue_error"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
