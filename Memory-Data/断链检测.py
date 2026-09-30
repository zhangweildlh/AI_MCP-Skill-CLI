# -*- coding: utf-8 -*-
"""
只读分析脚本：量化 MEMORY 拆分后各文件的锚点与链接真实状态。
不写入任何文件，仅打印报告。

输出分段：
  1. 各文件标题数 / 断链锚点（带 #锚点 的链接是否真实存在）
  2. P-1 越界引用扫描（白名单制，v5.1.0 改造）——凡链接目标不在
     {子记忆文件 Memory-*.md} ∪ {本手册} ∪ {主文件} 之内者一律报越界，
     含指向体系外任意目录的文件。
     v5.2.1 起本项与 memory-mgr.py 的 `check` **维度14 同源**（共用
     `extract_target_filename`）：该盲区（手册 §6 D-8）已在 check 侧消解，
     本脚本的 P-1 转为**交叉验证**角色——二者结论必须一致，不一致即实现漂移。
  3. P-2 子→主回链存在性
  4. P-3 无锚点链接清单（仅供核对，非缺陷）
  5. P-4 锚点唯一性（v5.0.0 新增；编号完整性判据 10，memory-mgr check 盲区）

职责边界（单一事源）：本脚本只做「链接级」检查；「格式级」检查
（禁用词、层级伪装、索引缺失、前向引用）统一由 memory-mgr.py 的
§10 格式强制要求附加校验负责，本脚本不重复实现。

v5.2.1 共享实现：`heading_to_anchor` / `strip_heading_number` /
`extract_target_filename` 三个函数的**唯一权威定义在 memory-mgr.py**，
本脚本在文件头以 importlib 动态导入复用，导入失败时回退内置同名实现
（保证本脚本可独立运行）。改动这三处算法时**只改 memory-mgr.py**。
"""
import os
import re
import glob
import sys
import argparse
import importlib.util

# ===== v5.2.1（P2）：与 memory-mgr.py 的重复实现消除 =====
# 背景：`heading_to_anchor` / `strip_heading_number` / `extract_target_filename`
# 原在本脚本与 memory-mgr.py 各存一份。两套实现一旦漂移，同一标题会出现
# 「check 判通、本脚本判断链」的矛盾结论——这正是最难排查的一类缺陷。
# 现改为「优先复用 memory-mgr.py 的单一事源实现，导入失败才回退内置实现」，
# 既消除漂移，又保证本脚本仍可独立运行（只读、零写盘）。
_SHARED = None
try:
    _here = os.path.dirname(os.path.abspath(__file__))
    _spec = importlib.util.spec_from_file_location(
        '_memory_mgr_shared', os.path.join(_here, 'memory-mgr.py'))
    if _spec and _spec.loader:
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        _SHARED = _mod
except Exception:
    _SHARED = None

if _SHARED is not None:
    heading_to_anchor = _SHARED.heading_to_anchor
    strip_heading_number = _SHARED.strip_heading_number
    extract_target_filename = _SHARED.extract_target_filename
    EXTERNAL_SCHEME_PATTERN = _SHARED.EXTERNAL_SCHEME_PATTERN
    # v5.2.3（双审计第二轮 P2-7，成立）：合法目标的「非子记忆文件」部分也由单一事源
    # 提供（原为本脚本字面量，与 memory-mgr.py 两处各写一份，改一处不会同步另两处）。
    MANUAL_FILE_NAME = _SHARED.MANUAL_FILE_NAME
    MAIN_FILE_NAME = _SHARED.MAIN_FILE_NAME
    ALLOWED_EXTRA_TARGETS = _SHARED.ALLOWED_EXTRA_TARGETS
else:
    MANUAL_FILE_NAME = 'WorkBuddy记忆文件说明.md'
    MAIN_FILE_NAME = 'MEMORY.md'
    ALLOWED_EXTRA_TARGETS = frozenset({MANUAL_FILE_NAME, MAIN_FILE_NAME})
    def heading_to_anchor(heading_text: str) -> str:
        """回退实现（与 memory-mgr.py 保持一致；仅在无法导入共享模块时使用）"""
        text = heading_text.lower()
        text = text.replace(' ', '-')
        text = re.sub(r'[^\w\u4e00-\u9fff\-]', '', text)
        return text

    def strip_heading_number(title: str) -> str:
        return re.sub(r'^\d+(?:[-.]\d+)*\s*', '', title.strip())

    def extract_target_filename(url: str):
        url = url.strip()
        if re.match(r'^(?:https?|ftp)://|^(?:mailto|tel):', url, re.IGNORECASE):
            return None
        path_part = url.split('#')[0]
        if not path_part:
            return None
        path_part = re.sub(r'^file:///*', '', path_part).replace('\\', '/')
        return path_part.split('/')[-1] or None

    EXTERNAL_SCHEME_PATTERN = re.compile(r'^(?:https?|ftp)://|^(?:mailto|tel):', re.IGNORECASE)

# ===== v5.3.0：路径默认值与 memory-mgr.py 完全同口径（禁止硬编码用户名 / 盘符）=====
# 原为两条字面量
#     SUB_DIR   = r"D:\Documents\AI_MCP-Skill-CLI\Memory-Data"
#     MAIN_FILE = r"C:\Users\15794\.workbuddy\MEMORY.md"
# 换机、换用户名、仓库迁移后即失效。现改为与 memory-mgr.py 相同的两条推导规则：
#   主记忆文件 = <用户目录>/.workbuddy/MEMORY.md
#   子记忆目录 = 本脚本所在目录（与 memory-mgr.py 同目录）
# 单一事源：优先复用 memory-mgr.py 的函数；导入失败时回退等价实现，保证本脚本
# 仍可独立运行（只读、零写盘）。
if _SHARED is not None:
    _default_main_file_fn = _SHARED.default_main_file
    _default_sub_files_dir_fn = _SHARED.default_sub_files_dir
    _list_sub_file_names_fn = _SHARED.list_sub_file_names
    _validate_paths_fn = _SHARED.validate_paths
else:
    def _default_main_file_fn():
        return os.path.join(os.path.expanduser('~'), '.workbuddy',
                            'MEMORY.md').replace('\\', '/')

    def _default_sub_files_dir_fn():
        return os.path.dirname(os.path.abspath(__file__)).replace('\\', '/')

    def _list_sub_file_names_fn(dir_path):
        if not dir_path or not os.path.isdir(dir_path):
            return []
        try:
            entries = os.listdir(dir_path)
        except OSError:
            return []
        out = [e for e in entries
               if e.lower().startswith('memory-') and e.lower().endswith('.md')
               and os.path.isfile(os.path.join(dir_path, e))]
        return sorted(out)

    def _validate_paths_fn(main_file, sub_files_dir):
        problems = []
        if not main_file or not os.path.isfile(main_file):
            problems.append(('主记忆文件', main_file or '(未指定)', '文件不存在'))
        elif os.path.basename(main_file).lower() != 'memory.md':
            problems.append(('主记忆文件', main_file, '文件名须恒为 MEMORY.md'))
        if not sub_files_dir or not os.path.isdir(sub_files_dir):
            problems.append(('子记忆目录', sub_files_dir or '(未指定)', '目录不存在'))
        elif not _list_sub_file_names_fn(sub_files_dir):
            problems.append(('子记忆目录', sub_files_dir, '目录内无 Memory-*.md'))
        return (len(problems) == 0), problems

# D-6 修复：子文件清单改为动态扫描目录内 Memory-*.md，避免硬编码 5 个文件名在
# 子文件增减后漏检/误检（子记忆文件数量会动态增减，是设计常态）。
# v5.2.4（Round1 B-7）：isfile 过滤——若目录下出现名为 `Memory-x.md` 的**子目录**，
# 原实现会把它当子文件并在 open() 处抛异常中断。
# v5.3.0：改用单一事源枚举，匹配**大小写不敏感**。
MAIN_FILE = _default_main_file_fn()
SUB_DIR = _default_sub_files_dir_fn()
SUB_FILES = list(_list_sub_file_names_fn(SUB_DIR))


# v5.2.1：`heading_to_anchor` 已由文件头的共享导入提供（单一事源在 memory-mgr.py），
# 此处不再重复定义，避免两套算法漂移。

H2_PATTERN = re.compile(r'^##\s+(.+)$', re.MULTILINE)
H3_PATTERN = re.compile(r'^###\s+(.+)$', re.MULTILINE)
H4_PATTERN = re.compile(r'^####\s+(.+)$', re.MULTILINE)   # v5.0.0：判据10 锚点唯一性须含 H4
LINK_PATTERN = re.compile(r'\[([^\]]*)\]\(([^)]+)\)')
# v5.0.0：编号识别兼容 N-M-X-Z（连字符）与旧 N.M.P（点号）
NUM_LABEL_PATTERN = re.compile(r'^(\d+(?:[-.]\d+)*)\s')
# v5.2.4（Round1 B-15，P2）：代码围栏识别。优先复用 memory-mgr.py 的单一事源（与
# `rewrite` / `_scan_headings_ordered` 同口径），导入失败时回退等价定义，保证本脚本
# 仍可独立运行。
FENCE_PATTERN = getattr(_SHARED, 'FENCE_PATTERN', None) if _SHARED is not None else None
if FENCE_PATTERN is None:
    FENCE_PATTERN = re.compile(r'^\s*(```|~~~)')


def extract_headings(content):
    """返回 [(level, number_label, full_title, anchor), ...]（v5.0.0 起含 H4）

    number_label 为完整编号串（新体系 '3-10-8'；旧体系 '16.10'；无编号则 None）。

    v5.2.4（Round1 B-15，P2，已实测复现）：原实现用 H2/H3/H4_PATTERN 对**全文**
    finditer，不维护代码围栏状态，会把 ``` 代码块内的伪标题纳入锚点集合，导致
    「指向不存在锚点」被判为存在——**漏报真实断链**。现改为逐行扫描并跳过围栏。
    输出**顺序保持不变**（仍是「先全部 H2、再 H3、再 H4」），不引入顺序变动风险。
    """
    items = []          # [(lvl, title_text)]，按文档顺序收集
    in_fence = False
    for line in content.split('\n'):
        if FENCE_PATTERN.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for lvl, pattern in ((2, H2_PATTERN), (3, H3_PATTERN), (4, H4_PATTERN)):
            m = pattern.match(line)
            if m:
                items.append((lvl, m.group(1).strip()))
                break
    headings = []
    for lvl in (2, 3, 4):
        for lv, t in items:
            if lv != lvl:
                continue
            num = NUM_LABEL_PATTERN.match(t)
            label = num.group(1) if num else None
            headings.append((lvl, label, t, heading_to_anchor(t)))
    return headings


def number_without_dot(label):
    """归一化编号串用于模糊匹配：'3-10' -> '310'; '16.10' -> '1610'; '7' -> '7'"""
    if label is None:
        return None
    return label.replace('.', '').replace('-', '')


def _build_path_map():
    """产出 {显示名: 绝对路径}（v5.2.4 B-6）

    用途：模糊候选匹配必须按**真实绝对路径**取目标文件，禁止用
    `os.path.join(SUB_DIR, 目标名)` 反推 —— 主文件 MEMORY.md 不在 SUB_DIR 下，
    反推出的路径不存在会抛 FileNotFoundError 直接终止整个脚本。
    """
    return {name: fp for name, fp in _iter_targets()}


def analyze_file(filepath, all_anchors, friendly_name, path_map=None, cache=None):
    # v5.2.4（B-8）：统一用 with 打开，避免裸 open() 在异常路径下延迟关闭句柄
    with open(filepath, encoding='utf-8') as _f:
        content = _f.read()
    headings = extract_headings(content)
    anchor_set = set(h[3] for h in headings)
    lines = content.split('\n')
    report = []
    for i, line in enumerate(lines):
        for text, url in LINK_PATTERN.findall(line):
            if '#' not in url:
                continue
            before, anchor = url.split('#', 1)
            anchor = anchor.split('?')[0]
            if anchor == '':
                continue
            # 判定同文件 / 跨文件
            if before.strip() == '':
                target_name = friendly_name
                target_anchors = anchor_set
                kind = '同文件'
            else:
                fn = before.split('/')[-1].split('#')[0]
                if fn in all_anchors:
                    target_name = fn
                    target_anchors = all_anchors[fn]
                    kind = '跨文件'
                else:
                    # 可能是主文件或其它
                    target_name = fn
                    target_anchors = set()
                    kind = '未知文件'
            # 检查锚点存在
            exists = anchor in target_anchors
            # 模糊编号匹配候选
            cand = None
            lead = re.match(r'^(\d+)', anchor)
            if not exists and lead:
                D = lead.group(1)
                # v5.2.4（Round1 B-6，P1，已实测复现）：原实现用
                # `os.path.join(SUB_DIR, target_name)` 反推路径 —— 主文件的显示名是
                # 'MEMORY.md' 而它不在 SUB_DIR 下，反推路径不存在 → FileNotFoundError
                # 终止整个脚本（verify 第 2 项随之崩为 ERROR）。现改为按 path_map 取
                # 真实绝对路径；取不到即跳过候选（不崩溃）。
                # 同时用 cache 避免对同一目标文件反复 open + 解析（原实现 O(N*M) IO）。
                tgt_path = (path_map or {}).get(target_name)
                if tgt_path and os.path.isfile(tgt_path):
                    if cache is not None and target_name in cache:
                        hs = cache[target_name]
                    else:
                        with open(tgt_path, encoding='utf-8') as _tf:
                            hs = extract_headings(_tf.read())
                        if cache is not None:
                            cache[target_name] = hs
                else:
                    hs = []
                for (lvl, lbl, ttl, anc) in hs:
                    # v5.0.0：新体系锚点形如 'N-M-...'，数字前缀只剩 N，故改前缀匹配
                    if lbl and number_without_dot(lbl).startswith(D):
                        cand = (lvl, lbl, ttl, anc)
                        break
            if not exists:
                report.append((i + 1, kind, target_name, text, anchor, cand))
    return headings, anchor_set, report


# ===== P-1 越界引用：白名单制（v5.1.0 改造）=====
# 合法引用目标集合 = 全部子记忆文件 ∪ 本手册 ∪ 主文件。
# 凡链接的本地目标文件名不在此集合内者，一律判为越界引用（含体系外任意目录的文件）。
def configure(main_file=None, sub_files_dir=None, quiet=False):
    """v5.3.0：按显式参数重配路径并重算派生常量，返回是否校验通过

    与 memory-mgr.py 同口径：主文件名恒为 MEMORY.md（大小写不敏感），
    子记忆文件名为 Memory-*.md（大小写不敏感）。未传的项沿用当前默认值。

    用 global 重配是为了**最小侵入**：模块级 SUB_FILES / ALLOWED_TARGETS 被
    6 处使用点引用，改为惰性计算会牵动全部调用链；此处仅在参数变化时重算一次。
    """
    global MAIN_FILE, SUB_DIR, SUB_FILES, ALLOWED_TARGETS
    if main_file:
        MAIN_FILE = main_file.replace('\\', '/')
    if sub_files_dir:
        SUB_DIR = sub_files_dir.replace('\\', '/').rstrip('/')

    ok, problems = _validate_paths_fn(MAIN_FILE, SUB_DIR)
    if not ok:
        if not quiet:
            print("=" * 72)
            print("[ERROR] 断链检测：记忆体系路径校验未通过 —— 已中止")
            print("=" * 72)
            for item, actual, reason in problems:
                print(f"  ✗ {item}")
                print(f"      实际: {actual}")
                print(f"      原因: {reason}")
            print("  ---- 请显式传入路径后重新执行（任选其一）----")
            print('    python 断链检测.py --main-file "<.../MEMORY.md>" '
                  '--sub-files-dir "<子记忆目录>"')
            print("      · 未传参时默认：主文件 = 用户目录/.workbuddy/MEMORY.md；"
                  "子目录 = 本脚本同目录")
            print("      · 亦可用环境变量 MEMORY_MAIN_FILE / MEMORY_SUB_FILES_DIR")
            print("=" * 72)
        return False

    SUB_FILES = list(_list_sub_file_names_fn(SUB_DIR))
    ALLOWED_TARGETS = set(SUB_FILES) | set(ALLOWED_EXTRA_TARGETS)
    return True


ALLOWED_TARGETS = set(SUB_FILES) | set(ALLOWED_EXTRA_TARGETS)
# v5.2.1：`EXTERNAL_SCHEME_PATTERN` 与 `extract_target_filename` 已由文件头的共享
# 导入提供（单一事源在 memory-mgr.py），此处不再重复定义。
# 注：memory-mgr.py 的 check 维度14 与本脚本 P-1 现判定口径完全一致，
# 二者应给出同一结论——若不一致即为实现漂移，须回查单一事源。


def _iter_targets():
    """产出 [(显示名, 绝对路径), ...]：主文件 + 全部子文件"""
    targets = []
    if os.path.exists(MAIN_FILE):
        targets.append(('MEMORY.md', MAIN_FILE))
    for sf in SUB_FILES:
        targets.append((sf, os.path.join(SUB_DIR, sf)))
    return targets


def check_out_of_scope_refs():
    """P-1 越界引用扫描（白名单制，v5.1.0 改造）

    判据：链接的本地目标文件名不在 ALLOWED_TARGETS 之内者即为越界引用。

    改造动因：原实现用正则做黑名单式匹配，仅能发现「指向 Memory-Data 目录内非子
    文件」的引用，对指向体系外其他目录的引用会静默跳过；而本体系明令禁止引用体系
    外文件（手册 §5 步骤4 / §6 D-8），该缺口使一条非法行为完全无工具覆盖。改为白
    名单式后实现全覆盖——凡目标不在上述合法集合内者一律报出。
    """
    hits = []
    for name, fp in _iter_targets():
        # v5.2.4（B-8）：统一 with 打开，避免裸 open() 在异常路径下延迟关闭句柄
        with open(fp, encoding='utf-8') as _f:
            _lines = _f.read().split('\n')
        for i, line in enumerate(_lines, 1):
            for text, url in LINK_PATTERN.findall(line):
                fn = extract_target_filename(url)
                if fn is None:
                    continue
                if fn in ALLOWED_TARGETS:
                    continue
                hits.append((name, i, fn, text, url))
    return hits


def check_backlinks():
    """P-2 子→主回链存在性（与 memory-mgr 维度7「回链可达性」互补）"""
    missing = []
    for sf in SUB_FILES:
        with open(os.path.join(SUB_DIR, sf), encoding='utf-8') as _f:
            content = _f.read()
        has = any(u.split('/')[-1].split('#')[0] == 'MEMORY.md'
                  for _, u in LINK_PATTERN.findall(content))
        if not has:
            missing.append(sf)
    return missing


def collect_anchorless_links(all_anchors):
    """P-3 无锚点链接（旧版遇 '#' 缺失直接 continue，属漏检，此处单独列出供核对）"""
    hits = []
    for name, fp in _iter_targets():
        # v5.2.4（B-8）：统一 with 打开，避免裸 open() 在异常路径下延迟关闭句柄
        with open(fp, encoding='utf-8') as _f:
            _lines = _f.read().split('\n')
        for i, line in enumerate(_lines, 1):
            for text, url in LINK_PATTERN.findall(line):
                if '#' in url:
                    continue
                fn = url.split('/')[-1]
                if fn in all_anchors or fn == 'MEMORY.md':
                    hits.append((name, i, fn, text))
    return hits


def check_anchor_uniqueness():
    """P-4 锚点唯一性（手册 §3.9 ① 判据 10）

    同一文件内两个标题若算出同一锚点（重号、层级坍缩、文本雷同），GFM 只会跳到
    首个匹配 —— 表现为「编辑器点击跳错位置」。memory-mgr 的 check 维度11 只校验
    编号格式与连续性，不校验锚点碰撞，故由本脚本补位（职责划分见手册 §3.9 ①）。
    返回 [(文件名, 锚点, [标题...]), ...]。
    """
    dupes = []
    for name, fp in _iter_targets():
        if not os.path.exists(fp):
            continue
        with open(fp, encoding='utf-8') as _f:
            content = _f.read()
        seen = {}
        for _lvl, _lbl, title, anchor in extract_headings(content):
            seen.setdefault(anchor, []).append(title)
        for anchor, titles in seen.items():
            if len(titles) > 1:
                dupes.append((name, anchor, titles))
    return dupes


def main(argv=None):
    # v5.3.0：支持 --main-file / --sub-files-dir，与 memory-mgr.py 同口径
    ap = argparse.ArgumentParser(
        prog='断链检测.py',
        description='MEMORY.md 记忆体系链接级只读检查（路径规则与 memory-mgr.py 一致）')
    ap.add_argument('--main-file', help='主记忆文件路径（文件名须为 MEMORY.md）')
    ap.add_argument('--sub-files-dir', help='子记忆文件目录（须含 Memory-*.md）')
    args = ap.parse_args(argv)

    if not configure(args.main_file, args.sub_files_dir):
        return 2

    # 预加载所有锚点（v5.2.4：with 打开 + 缓存 headings，供模糊候选复用，避免重复 IO）
    all_paths = _build_path_map()
    headings_cache = {}
    all_anchors = {}
    for name, fp in all_paths.items():
        with open(fp, encoding='utf-8') as _f:
            hs = extract_headings(_f.read())
        headings_cache[name] = hs
        all_anchors[name] = set(h[3] for h in hs)

    total = 0
    for sf in SUB_FILES:
        fp = os.path.join(SUB_DIR, sf)
        headings, anchor_set, report = analyze_file(fp, all_anchors, sf,
                                                    path_map=all_paths, cache=headings_cache)
        print(f"\n===== {sf} =====")
        print(f"  标题数: {len(headings)} (H2={sum(1 for h in headings if h[0]==2)}, "
              f"H3={sum(1 for h in headings if h[0]==3)}, "
              f"H4={sum(1 for h in headings if h[0]==4)})  锚点唯一数: {len(anchor_set)}")
        if report:
            print(f"  --- 断链锚点 {len(report)} 处 ---")
            for ln, kind, tgt, text, anchor, cand in report:
                cand_s = f"  -> 候选目标[{cand[1]}] {cand[3]}" if cand else "  -> 无编号候选"
                print(f"    L{ln} [{kind}->{tgt}] 链接文本='{text[:30]}' 锚点='{anchor}'{cand_s}")
                total += 1
        else:
            print("  无断链锚点")
    # 主文件链接到子文件
    if os.path.exists(MAIN_FILE):
        fp = MAIN_FILE
        _, _, report = analyze_file(fp, all_anchors, 'MEMORY.md',
                                    path_map=all_paths, cache=headings_cache)
        print(f"\n===== MEMORY.md (主文件) =====")
        if report:
            print(f"  --- 断链锚点 {len(report)} 处 ---")
            for ln, kind, tgt, text, anchor, cand in report:
                cand_s = f"  -> 候选目标[{cand[1]}] {cand[3]}" if cand else "  -> 无编号候选"
                print(f"    L{ln} [{kind}->{tgt}] 链接文本='{text[:30]}' 锚点='{anchor}'{cand_s}")
                total += 1
        else:
            print("  无断链锚点")
    print(f"\n===== 断链锚点总计: {total} 处 =====")

    # ===== P-1 越界引用扫描 =====
    print("\n===== P-1 越界引用扫描（v5.2.1：与 check 维度14 同源，本项为交叉验证） =====")
    oos = check_out_of_scope_refs()
    if oos:
        for name, ln, fn, text, url in oos:
            print(f"  ❌ {name}:L{ln} 越界引用 '{fn}'（链接文本='{text[:30]}'）")
            print(f"       └─ URL: {url[:110]}")
        print(f"  越界引用合计: {len(oos)} 处，须删除或改为指向已有权威章节")
    else:
        print("  ✅ 未检出越界引用")

    # ===== P-2 子→主回链存在性 =====
    print("\n===== P-2 子→主回链存在性 =====")
    miss = check_backlinks()
    if miss:
        for sf in miss:
            print(f"  ⚠️ {sf}: 缺少指向主文件的回链")
        print(f"  缺回链子文件: {len(miss)} 个")
    else:
        print(f"  ✅ 全部 {len(SUB_FILES)} 个子文件均有回链")

    # ===== P-3 无锚点链接 =====
    print("\n===== P-3 无锚点链接（仅供核对，非缺陷） =====")
    anchorless = collect_anchorless_links(all_anchors)
    if anchorless:
        for name, ln, fn, text in anchorless:
            print(f"  ℹ️ {name}:L{ln} -> {fn}（链接文本='{text[:30]}'）")
        print(f"  无锚点链接合计: {len(anchorless)} 条（指向文件首部，非断链）")
    else:
        print("  ✅ 无无锚点链接")

    # ===== P-4 锚点唯一性（手册 §3.9 ① 判据 10，memory-mgr check 盲区） =====
    print("\n===== P-4 锚点唯一性（编号完整性判据 10） =====")
    dupes = check_anchor_uniqueness()
    if dupes:
        for name, anchor, titles in dupes:
            print(f"  ❌ {name}: 锚点重复 '#{anchor}' 被 {len(titles)} 个标题共用 → {titles}")
        print(f"  锚点重复合计: {len(dupes)} 处（编辑器只会跳到首个，须改标题消歧）")
    else:
        print("  ✅ 无锚点重复（各文件锚点均唯一）")


if __name__ == '__main__':
    sys.exit(main() or 0)
