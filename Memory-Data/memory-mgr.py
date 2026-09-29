#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
memory-mgr.py - MEMORY.md 多文件记忆系统维护程序 v5.3.0

功能概述：
  本程序用于维护 MEMORY.md 拆分后的多文件记忆系统，包括：
  - 链接完整性检查（主↔子、子↔子、循环引用、锚点验证、孤儿引用、单一事源）
  - 速查索引表生成与维护（主索引 + 各子文件头部索引，精确到 H3 级别）
  - 章节编号维护（v5.0.0：N-M-X-Z 三层编号；N 取自各文件 YAML `file_number`，
                  文件内局部连续、**不再跨文件连续**；零硬编码文件名；
                  重编号后自动同步跨文件与同文件锚点）
  - 子文件增删改管理（含 .bak 备份、引用清理、related 字段同步）
  - 状态文件同步（memory-state.json，含章节-行号映射）
  - 变更日志记录（memory-changelog.json，自包含不依赖 git；git 可用时增强）
  - 精准读取支持（get-offset 返回行号范围，供 WorkBuddy Read(offset/limit) 使用）
  - 综合校验（validate，12 条纪律自检 + §10 格式强制要求附加校验）

子命令：
  check       双向完整性检查（6 核心维度 + 6 扩展维度 + 维度13/14 = 14 维度）
  index       生成/更新所有索引表
  route       归属判定 / 读前精判（按四要素打分，只读）      [v5.2.1]
  next-num    下一个可用编号 + 插章路径 A/B 判定（只读）     [v5.2.1]
  verify      五项验收一键化（手册 §5 标准审计流程）         [v5.2.1]
  add         创建新子文件（v5.0.0 起自动分配 YAML `file_number`）
  remove      删除子文件
  rewrite     按各文件 YAML 的 `file_number` 重建 N-M-X-Z 编号（含锚点同步）
  number      批量分配 / 校正 YAML `file_number`（v5.0.0 新增，一次性迁移用）
  get-offset  返回指定章节的行号范围
  validate    综合校验（check + 12 条纪律自检）
  sync        同步状态文件
  changelog   查看变更历史（自包含，git 可用时增强）
  diff        比较版本差异（git 可用时使用 git diff）
  restore     回滚文件到历史版本（git restore，需 --force）
  help        显示帮助信息

使用示例：
  python memory-mgr.py check
  python memory-mgr.py check --fix
  python memory-mgr.py index
  python memory-mgr.py add --topic "测试纪律" --content "## 1 测试\n内容..."
  python memory-mgr.py remove --file "Memory-测试纪律.md" --dry-run
  python memory-mgr.py get-offset --file "Memory-GitHub全流程操作.md" --section "## 3-13"
  python memory-mgr.py number --init --dry-run
  python memory-mgr.py rewrite --dry-run
  python memory-mgr.py validate
  python memory-mgr.py route --query "如何配置 MCP 服务器"
  python memory-mgr.py route --query "uv 调用约定" --intent write
  python memory-mgr.py next-num --file "Memory-x.md" --level 3 --after "2-3"
  python memory-mgr.py verify
  python memory-mgr.py changelog --days 7

默认路径（硬编码，启动时可交互式确认或命令行覆盖）：
  主文件：C:\\Users\\15794\\.workbuddy\\MEMORY.md
  子目录：D:\\Documents\\AI_MCP-Skill-CLI\\Memory-Data

注意事项：
  - 本程序不用于本次拆分和迁移，仅用于今后持续维护
  - 整个方案自包含，不依赖 git（git 可用时提供增强功能）
  - 每次修改文件前自动创建 .bak 备份
  - check 命令只报告问题，绝不自动修复（`--fix` 已于 v5.2.2 按手册 §0.2「严禁盲修」停用，
    传入后只打印待核清单；validate 的 `--auto-fix` 自 v5.2.3 起同源停用）
  - 子文件目录排除在 AGENTS.md worktree 纪律之外，程序在主工作树直接操作

版本历史：
  v5.3.0: 路径可移植化 + 启动期校验（2026-09-29）
    - 主记忆文件默认路径改为 <用户目录>/.workbuddy/MEMORY.md（expanduser，
      Win11 即系统变量 %USERPROFILE%），彻底移除硬编码用户名与盘符
    - 子记忆目录默认改为本脚本所在目录（__file__ 推导），仓库迁移自动跟随
    - 子记忆文件名 Memory-*.md 匹配改为**大小写不敏感**（单一事源 is_sub_file_name）
    - 新增启动期路径校验：缺失即向 Agent 输出精准诊断与修正指令并以退出码 2 中止
    - 校验通过的路径本地记录于 memory-paths.json 复用；失效时自动回落重校验
    - verify 第 2 项向断链检测.py 透传路径，消除自定义路径下两项检查对象不一致
  v5.2.3: 豆包 + DeepSeek **第二轮**双背靠背审计的质证修复（2026-09-24）
    - 【原子写】`_write_file` 改为「落 `<文件>.tmp` + `os.replace`」：写入中途
      崩溃 / 磁盘满时原文件一字不动（`.bak` 只在写入前生成，挡不住中途截断）
    - 【verify】第 5 项在非 git 环境判 SKIP（原：`_git_repo_root()` 失败返回非空
      致 `or` 回退永不生效 → git 缺失被误标 ERROR）
    - 【validate】`--auto-fix` 与 `check --fix` 同源停用：只出待核清单、不写盘
      （原打印"已尝试修复"属虚假陈述，且会 `sync` 写盘）
    - 【§10 第10条】`§X` 是本手册条目编号 → 对主文件 / 子文件恒为跨文件引用，
      按 §10 第13条豁免，不再误报前向引用（实测消除子文件2 的 4 处假阳性）
    - 【单一事源】`MANUAL_FILE_NAME` / `MAIN_FILE_NAME` / `ALLOWED_EXTRA_TARGETS`
      收归常量，check 维度3 / 维度14 与 断链检测.py 的 ALLOWED_TARGETS 三处复用
    - 【环检测】收敛为迭代式 `find_cycles` + `_build_sub_ref_graph`（单一实现、
      无递归深度上限；审计称的"漏报"经实测否决——原 `rec_stack` 判据完备）
    - 【YAML】行内 `#` 注释按 YAML 规范剥离（未加引号遇「空格+#」截断；加引号
      以闭合引号为界）；`unescape_yaml_scalar` 去 NUL 占位符改单趟 re.sub
    - 【容错】`_parse_num_tail` 编号后无空格不再返 None；`add` 取最大 N 的异常
      捕获拓宽到 OSError / UnicodeDecodeError；时间戳解析异常收窄为
      ValueError / TypeError（重扫动作移出 try，避免异常时重复重扫）
    - 【新增】`selftest` 子命令：27 项核心纯函数回归断言，零依赖、不读写业务文件
  v5.2.2: 豆包 + DeepSeek 双背靠背审计的质证修复（2026-09-24）
    - 【P0】`index --file X` 不再把主索引表② / 路由卡表①整区重写为只剩 X 一条：
      `--file` 只收窄「刷新哪个文件的头部索引」，两个工具写入区恒按全量子文件生成
    - 【P0】`check --fix` 停用自动修改（手册 §0.2 严禁盲修）：原会整行删除，
      同行其它链接与正文一并丢失；现只打印待核清单供人工按 §7 处置
    - 【P0】同文件锚点替换由「匹配 `(#锚点`」改为仅在 `[文本](#锚点)` 链接内部替换，
      并跳过代码围栏（原模式会篡改正文中形态相同的普通文本）
    - 【YAML】读取侧补齐对称反转义（`unescape_yaml_scalar`）；多行指示符 `|` / `>`
      由静默丢弃改为显式报错中止（零依赖取舍，不引入 pyyaml）
    - 【route】scope_in/out 按手册 §2.2 的 `；` 逐条切分 + 短查询抬高阈值
    - 【add】file_number 改以磁盘 YAML 为准并写入 state；`--start-number` 停用
    - 【check】维度3 改白名单内校验（越界交维度14）；维度7 用精确文件名判定；
      维度13/14 显示名取 basename；主文件全 check 只读一次
    - 【单一事源】维度6 与纪律2 合并为 `_find_duplicate_paragraphs`；
      `_collect_headings_for_anchor` 收敛为 `_scan_headings_ordered` 的适配层
    - 【其它】主索引大文件降级指向去硬编码（按行数阈值）；`remove` 只删链接 token；
      备份失败阻断写入/删除；`_strip_local_index` 按哨兵定界；
      `verify` 用 `_git_repo_root()`；`_list_sub_files` 过滤目录
    - 已否决并留痕：递归 DFS 栈溢出（子文件数远小于递归上限）、H4 归入 H3 范围（设计如此）、
      verify 改用 returncode 主判（脚本恒返回 0，无法反映问题）、GFM 锚点对齐（会致既有锚点全量失效）
  v5.2.1: 工具链三补一修（2026-09-24，P0~P2 实施）
    - 【P0 修复】`_collect_headings_for_anchor` 由「按 H2/H3/H4 分组收集」改为
      「按文档出现顺序收集」并跳过代码围栏。原实现与其 docstring 的「顺序 = 文件内
      出现顺序」契约自相矛盾：一旦层级构成变化，rewrite 前后按位置 zip 配对即错配
      （旧 `### 2-1-1 A子节` 被配到新 `## 2-3 新章`），进而把跨文件锚点静默改写为
      错误目标 —— 这是"章节丢失 / 断链"的真实根因（此前误定性为「丢正文」，实测
      `_renumber_content` 一行不丢）。同时新增「标题文本序列不一致」显式告警，
      杜绝静默错配。
    - 【新增 `route`】归属判定 / 读前精判：按四要素（scope_in > theme > positioning > role）
      打分，输出候选子文件 + 命中依据 + 建议章节 + 定位链下一步命令；`--intent write`
      额外输出 scope_out 反向信号（命中即不该写入此文件）。
    - 【新增 `next-num`】增量编号助手：算出下一个可用编号并判定插章路径 A / B，
      消解「手工算号」与「编号由工具生成」的方向性冲突。
    - 【新增 `verify`】五项验收一键化（check + 断链检测 + validate + 逐章完整性 + git status）。
    - 【check 维度13】主文件必备结构（§2.1 四组成部分；含「规则三：记忆读取纪律」强制项）。
    - 【check 维度14】体系外越界引用（白名单制），消解手册 §6 D-8 记录的 check 盲区。
    - 【去重】`heading_to_anchor` / `strip_heading_number` / `extract_target_filename`
      收归本文件为单一事源，`断链检测.py` 改为 import 复用（导入失败时回退内置实现）。
  v5.0.0: 编号体系重构（2026-09-10）
    - 章节编号改 `N-M-X-Z`（连字符分隔，N=文件号，文件内局部连续，不再跨文件连续）
    - YAML 新增 `file_number` 字段；新增 `number --init` 命令（一次性迁移分配）
    - 废弃 `SUB_FILE_ORDER` 硬编码清单；`_list_sub_files` / `rewrite` 改按 `file_number`
      排序，兜底按「首个 H2 旧编号」升序（零硬编码，修复 D-16 / G6）
    - 修复 D-13（`strip_heading_number` 正则不认连字符——本次重构最高危缺口）
    - 修复 D-14（`rewrite` 不处理 H4）；修复 D-15（锚点同步漏 H4）
    - `check` 新增维度11 编号完整性、维度12 清单一致性（10 → 12 维度）
    - `validate` 纪律3 改为与维度11 共用同一校验函数（消除双源）
  v3.1.3: 豆包/DeepSeek 第一轮审计报告质证修复（2026-08-28）
    - 采纳：sync target_file 误删状态（present = set(self._list_sub_files())）
    - 否决：BUG-2 --json 改名（违背规格§2.9，恢复 --json）
    - 采纳：H3 end_line 跨 H2 越界（定位父H2，end_line 取 min(同H2内下一H3，下一H2) - 1）
    - 采纳：YAML 双引号未转义（escaped = v.replace('\\\\', '\\\\\\\\').replace('"', '\\"')）
    - 采纳：循环引用只报一个环（has_cycle 改 found 标志，遍历所有分支）
    - 采纳：CLI 退出码丢失（add/remove/restore 检查返回并 sys.exit(0 if ok else 1)）
    - 采纳：--fix 同行多断链错位（按行号聚合一次处理）
    - 否决：CRLF frontmatter（已修复）、纪律3跨文件（非规格要求）等 7 项
  v3.1.4: DeepSeek 复审报告质证（2026-08-28）
    - 否决：新问题1-6（check --fix同步、YAML双重转义、URL编码锚点、pattern_self过宽、cur_cn不一致、file_mtimes清理）——场景不成立或非缺陷
    - 否决：建议1-10（引入yaml库违零依赖规格、git checkout违规格§2.13、非交互静默合规格§1.3等）
    - 本轮无代码改动，复审报告误报主因：不了解规格、场景不成立、代码误读
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile   # v5.2.4（B-10）：selftest 的原子写断言需临时目录（仍不触碰业务文件）
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path

# ============================================================================
# 常量配置
# ============================================================================

# 路径默认值 DEFAULT_MAIN_FILE / DEFAULT_SUB_FILES_DIR
#   见下方「路径默认值（v5.3.0 可移植化）」块 —— 不再于此硬编码用户名与盘符。
STATE_FILE_NAME = "memory-state.json"
CHANGELOG_FILE_NAME = "memory-changelog.json"
PATHS_CACHE_FILE_NAME = "memory-paths.json"   # v5.3.0：校验通过后的本地路径记录

# 对话敲定的 8 个 YAML 必填字段
REQUIRED_FRONTMATTER_FIELDS = ["title", "topic", "tags", "related", "scope", "created", "updated", "parent"]

# v5.2.2：主索引「大文件降级指向」的规模阈值（行数）。
# 取代原先硬编码的文件名判定，与 state 的 max_lines 口径一致（零硬编码文件名）。
LARGE_FILE_INDEX_THRESHOLD = 1000

# v5.2.3（双审计第二轮 P2-7，成立）：体系内合法链接目标的**单一事源**。
# 手册 §0.17 / §8 红线的白名单 = 子记忆文件 Memory-*.md ∪ 本手册 ∪ 主文件。
# 此前 'WorkBuddy记忆文件说明.md' / 'MEMORY.md' 两个字面量散落在
#   · check 维度3（白名单内分流）
#   · check 维度14（_check_out_of_scope_refs）
#   · 断链检测.py 的 ALLOWED_TARGETS
# 三处，且互不会自动同步——改一处不会触发另两处，属「伪单一事源」。
# 现收归本常量；断链检测.py 以 import 复用（与 extract_target_filename 同机制）。
MANUAL_FILE_NAME = 'WorkBuddy记忆文件说明.md'
MAIN_FILE_NAME = 'MEMORY.md'
ALLOWED_EXTRA_TARGETS = frozenset({MANUAL_FILE_NAME, MAIN_FILE_NAME})

# ============================================================================
# 路径默认值（v5.3.0 可移植化）：禁止硬编码用户名 / 盘符
# ============================================================================
# 背景：原默认值是两条字面量
#     "C:/Users/15794/.workbuddy/MEMORY.md"
#     "D:/Documents/AI_MCP-Skill-CLI/Memory-Data"
# 换机、换用户名、仓库迁移后**立即失效**，且失效是静默的——不会报错，只会去读写
# 一个不存在的路径，表现为「主文件不存在 / 0 个子文件」，排查成本极高。
#
# 现改为两条推导规则：
#   ① 主记忆文件 = <用户目录>/.workbuddy/MEMORY.md
#      用户目录取 os.path.expanduser('~')：Windows 11 上即系统变量 %USERPROFILE%
#      （如 C:/Users/<当前用户名>），换机自动跟随；Linux/macOS 同理取 $HOME。
#   ② 子记忆目录 = memory-mgr.py **自身所在目录**
#      取 os.path.dirname(os.path.abspath(__file__))，仓库整体迁移自动跟随。
#
# 覆盖优先级（高 → 低）：
#   命令行 --main-file / --sub-files-dir
#     > 环境变量 MEMORY_MAIN_FILE / MEMORY_SUB_FILES_DIR
#     > 本地已保存路径 memory-paths.json（仅当仍校验通过）
#     > 上述两条推导规则

# 子记忆文件名规则：前缀 `Memory-` + 后缀 `.md`，匹配**大小写不敏感**。
# （Windows 文件系统本身不敏感，但 glob/listdir 的口径随平台而变；显式统一，
#   避免 memory-mgr.py 与断链检测.py 两处判定漂移。）
SUB_FILE_PREFIX = 'Memory-'
SUB_FILE_SUFFIX = '.md'


def _norm(p: str) -> str:
    """路径归一：统一正斜杠、去尾部斜杠（轻量版，供本块在 normalize_path 之前使用）"""
    return p.replace('\\', '/').rstrip('/')


def _env_path(name: str):
    """读取环境变量路径，未设置或为空时返回 None"""
    v = os.environ.get(name)
    return _norm(v) if v and v.strip() else None


def default_main_file() -> str:
    """主记忆文件默认路径：<用户目录>/.workbuddy/MEMORY.md"""
    env = _env_path('MEMORY_MAIN_FILE')
    if env:
        return env
    return _norm(os.path.join(os.path.expanduser('~'), '.workbuddy', MAIN_FILE_NAME))


def default_sub_files_dir() -> str:
    """子记忆目录默认路径：本脚本 memory-mgr.py 所在目录"""
    env = _env_path('MEMORY_SUB_FILES_DIR')
    if env:
        return env
    return _norm(os.path.dirname(os.path.abspath(__file__)))


DEFAULT_MAIN_FILE = default_main_file()
DEFAULT_SUB_FILES_DIR = default_sub_files_dir()


def is_sub_file_name(name) -> bool:
    """子记忆文件名判定（大小写不敏感）：前缀 Memory- 且后缀 .md"""
    if not isinstance(name, str) or not name:
        return False
    low = name.lower()
    return (low.startswith(SUB_FILE_PREFIX.lower())
            and low.endswith(SUB_FILE_SUFFIX.lower()))


def list_sub_file_names(dir_path: str) -> list:
    """列出目录下的子记忆文件名（大小写不敏感、仅文件、已排序）

    单一事源：memory-mgr.py 与断链检测.py 共用，避免两处枚举口径漂移。
    """
    if not dir_path or not os.path.isdir(dir_path):
        return []
    try:
        entries = os.listdir(dir_path)
    except OSError:
        return []
    return sorted(e for e in entries
                  if is_sub_file_name(e) and os.path.isfile(os.path.join(dir_path, e)))

# v3.3.0 新增：子记忆文件「四要素」字段（归属判定的权威定义源，就近维护于各子文件 YAML）
# 主文件路由卡（ROUTE_CARD 区）与手册 §2.2 的明细表均由 index 从这些字段生成，不再手工维护。
ROUTE_CARD_FIELDS = ["positioning", "role", "theme", "scope_in", "scope_out"]
ROUTE_CARD_FIELD_LABELS = {
    "positioning": "定位（一句话）",
    "role": "角色",
    "theme": "主题",
    "scope_in": "收录（in-scope）",
    "scope_out": "不收录（out-of-scope）",
}
ROUTE_CARD_MISSING_PLACEHOLDER = "[待补]"

# 子文件最大行数（Memory-GitHub全流程操作.md ~968 行，设为 1000）
MAX_SUB_FILE_LINES = 1000
LARGE_FILE_EXCEPTION = ["Memory-GitHub全流程操作.md"]

# 子文件排序依据（v5.0.0 起）：各文件 YAML 的 `file_number` 字段。
# 【零硬编码】排序数据就近维护于各文件 YAML，工具动态读取；新增 / 删除子文件
# 无需改动本工具。（旧版 SUB_FILE_ORDER 硬编码清单已于 v5.0.0 废弃 → §6 D-16 / G6）
# 【兜底顺序】`file_number` 缺失时，按各文件「首个 H2 的旧编号」升序——该编号在
# 原「跨文件连续」编号体系中天然反映人工定义的语义顺序（实测：1 / 6 / 8 / 23 / 26），
# 故可在零硬编码前提下复现正确次序；两者皆无时回退文件名字典序（仅保证确定性）。
SUB_FILE_ORDER = None  # 已废弃（保留符号占位，任何残留引用将显式报错而非静默错序）

# ============================================================================
# 正则表达式
# ============================================================================

MARKDOWN_LINK_PATTERN = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
H2_PATTERN = re.compile(r'^##\s+(.+)$', re.MULTILINE)
H3_PATTERN = re.compile(r'^###\s+(.+)$', re.MULTILINE)
# H4 仅用于锚点存在性检查，不用于索引生成（对话确认索引只到 H3）
H4_PATTERN = re.compile(r'^####\s+(.+)$', re.MULTILINE)
# v5.2.1（P0 修复）：按「文档出现顺序」一次性收集 H2/H3/H4 的通用模式。
# 用途：rewrite 前后锚点映射必须逐条按位置对应，分组收集（先全部 H2 再全部 H3）
# 会导致位置错位，进而把跨文件锚点改写为错误目标（表现为断链 / 章节丢失）。
ALL_HEADING_PATTERN = re.compile(r'^(#{2,4})(?!#)\s+(.+)$')
FENCE_PATTERN = re.compile(r'^\s*(```|~~~)')
FILE_LINK_PATTERN = re.compile(r'file:///([^)]+)')

# 主文件「写前路由卡」哨兵（v3.3.0：由 index 从子文件 YAML 四要素生成，禁止手工编辑区内容）
ROUTE_CARD_START_TAG = '<!-- ROUTE_CARD_START -->'
ROUTE_CARD_END_TAG = '<!-- ROUTE_CARD_END -->'
# 主索引区哨兵（v5.2.1：原为散落字面量，收拢为常量，供 index 与 check 维度13 共用同一定义）
MAIN_INDEX_START_TAG = '<!-- MAIN_INDEX_START -->'
MAIN_INDEX_END_TAG = '<!-- MAIN_INDEX_END -->'

# 外部协议前缀（v5.2.1：与 断链检测.py 共用同一定义，避免两处漂移）
# 非本地文件链接（http(s)/ftp 带 ://，mailto/tel 仅带单冒号）不参与越界引用判定
EXTERNAL_SCHEME_PATTERN = re.compile(r'^(?:https?|ftp)://|^(?:mailto|tel):', re.IGNORECASE)


def extract_target_filename(url: str):
    """从链接 URL 提取本地目标文件名；外部链接 / 纯锚点链接返回 None（v5.2.1 单一事源）

    归一化链路：去锚点 → 剥 `file://` 协议 → 反斜杠转斜杠 → 取末段文件名。
    本函数由 `check` 维度14 与 `断链检测.py` P-1 共用（后者以 import 复用，见其文件头）。
    """
    url = url.strip()
    if EXTERNAL_SCHEME_PATTERN.match(url):
        return None
    path_part = url.split('#')[0]
    if not path_part:
        return None
    path_part = re.sub(r'^file:///*', '', path_part)
    path_part = path_part.replace('\\', '/')
    fn = path_part.split('/')[-1]
    return fn or None


# ============================================================================
# 路径工具函数
# ============================================================================

def strip_inline_code(line: str) -> str:
    """移除行内的**内联代码**片段（`` `...` ``）（v5.2.2）

    用于 §10 格式扫描：禁用词 / 引用方向只应判定**正文**用词，
    反引号内的示例文本、命令片段、字面量不应计入（双审计 P2-6，部分成立）。

    v5.2.3（双审计第二轮 N-5，成立）：先吞双反引号 `` ``...`` `` 再吞单反引号——
    原正则 ` ` ` 对形如 `` ``a ` b`` `` 的双反引号内联代码会在首个单反引号处断开，
    把代码内部文本残留为正文，造成禁用词误报。
    """
    return re.sub(r'``.*?``|`[^`]*`', '', line)


def unescape_yaml_scalar(text: str) -> str:
    """按 `_build_yaml_frontmatter` 的转义口径做**对称反转义**（v5.2.2）

    写入侧：`v.replace('\\\\', '\\\\\\\\').replace('"', '\\\\"')`
    读取侧此前只做 `strip('"')`，不还原内部转义 → 含 `"` 的值往返一次即被污染
    （写 `"a\\"b"` → 读回 `a\\"b`），属**读写不对称**。本函数补齐读取侧。

    先用占位符保护 `\\\\`，避免二次替换（与写入侧「先反斜杠后引号」互为逆序）。

    v5.2.3（双审计第二轮 N-4，成立）：原实现借 NUL（`\\x00`）作占位符，若值中真含
    NUL 会与占位符碰撞。改用 `re.sub` **单趟**扫描，天然无占位符、无二次替换。
    """
    return re.sub(r'\\\\|\\"', lambda m: '\\' if m.group(0) == '\\\\' else '"', text)


def strip_yaml_inline_comment(value: str) -> str:
    """按 YAML 规范剥离**行内注释**（v5.2.3 · 双审计第二轮 P1-1 部分成立项）

    原实现把 `key: value # 注释` 的整段（含 `# 注释`）当字段值，会静默把注释并进
    `scope_in` / `theme` / `positioning` 等字段，进而污染主文件写前路由卡（§2.2）——
    属「静默错误、不报错」，与手册 §0.5 单一事源的准确性要求冲突。

    YAML 规范口径（与本工具写入侧对称）：
      · 未加引号标量：遇「空格 + #」即起注释，其后一律截断；
      · 加引号标量：以**闭合引号**为界，闭合引号之后方为注释（值内的 `#` 保留）。
    仅处理这两种情形；引号键名 / 嵌套列表 / `\\n` 转义 / 布尔变体仍不支持（见手册 §6.1 D-14）。
    """
    v = value.strip()
    if v[:1] in ('"', "'"):
        quote = v[0]
        end = 1
        while end < len(v):
            if v[end] == '\\':          # 引号内的转义字符不参与闭合判定
                end += 2
                continue
            if v[end] == quote:
                end += 1
                break
            end += 1
        return v[:end]
    idx = v.find(' #')
    return v[:idx] if idx >= 0 else v


def normalize_path(path_str: str) -> str:
    """将路径字符串统一转换为正斜杠格式"""
    return path_str.replace('\\', '/').rstrip('/')


def join_paths(base: str, *parts: str) -> str:
    """跨平台路径拼接，确保输出正斜杠格式"""
    p = Path(base)
    for part in parts:
        p = p / part
    return normalize_path(str(p))


def heading_to_anchor(heading_text: str) -> str:
    """将 Markdown 标题文本（不含 # 前缀）转换为 GFM 锚点
    规则：全小写、空格换连字符、去除特殊字符（保留中文、字母、数字、连字符、下划线）
    """
    text = heading_text.lower()
    text = text.replace(' ', '-')
    text = re.sub(r'[^\w\u4e00-\u9fff\-]', '', text)
    return text


def strip_heading_number(title: str) -> str:
    """去除标题前导编号（v5.0.0：同时兼容连字符与点号分隔）

    'git/gh工具' <- '3-13 git/gh工具'（新体系，连字符）
    '认证'       <- '7.1 认证'（旧体系 / 兼容点号）
    '发布与制品' <- '3-10-8 发布与制品'
    '小节标题'   <- '3-13-3-1 小节标题'
    """
    return re.sub(r'^\d+(?:[-.]\d+)*\s*', '', title).strip()


def normalize_list(value) -> list:
    """将 related/tags 字段统一为列表格式"""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        if not value.strip():
            return []
        return [x.strip() for x in value.split(',') if x.strip()]
    return []


def find_cycles(graph: dict) -> list:
    """找出有向图中的环，返回环路径列表（迭代式，非递归）——单一事源

    ⚠️ 语义边界（v5.2.4 Round1 B-9，实测校正）：本函数**不保证枚举出全部简单环**。
    迭代 DFS 对每个节点只展开一次，指向已探索完毕（BLACK）邻居的**交叉边不再展开**，
    因此当一个环存在多条 DFS 可达路径时会漏报其中一部分。实测：
      `{'A':{'B','C'}, 'B':{'C'}, 'C':{'A'}}` 中存在 A→B→C→A 与 A→C→A 两个环，
      本函数只报前者。
    对本体系**无实际影响**：`check` 与 `validate` 纪律5 只需判定「是否存在环」
    （布尔语义），报出任一环即足够。若将来需要「列出全部环供人工清理」，须改用
    Johnson / Tarjan SCC 枚举算法。
    保证：① 无环必返回 []；② 有环必至少返回一个环；③ 无递归深度上限。

    v5.2.3（双审计第二轮 P1-2 / P3-1，**部分成立**）：
      · 成立部分：① `check` 与 `validate` 纪律5 原各有一份**独立**的递归 DFS 实现，
        两份长期并行必然漂移（与 §6.1 D-8 已确立的「同源、结论须一致」要求相悖）；
        ② 递归深度随子文件数线性增长，硬依赖 Python 默认递归栈。
      · **不成立部分**：审计称原实现「多节点长环 / 多独立环漏报」——实测**不成立**。
        原实现的 `rec_stack` 即当前 DFS 路径（等价于 gray 集合），
        `neighbor in rec_stack` 是有向图环检测的**完备**判据；实测 3 节点长环
        （A→B→C→A）、双独立环（B↔C 与 D↔E）、长链成环（A→B→C→D→B）均正确报出。
        故本改动是**等价替换 + 深度安全加固**，不是补漏。

    实现：显式栈 + white/gray/black 三色迭代 DFS（无递归）。
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in graph}
    cycles = []
    for root in graph:
        if color.get(root, WHITE) != WHITE:
            continue
        color[root] = GRAY
        path = [root]
        stack = [(root, iter(sorted(graph.get(root, ()))))]
        while stack:
            node, it = stack[-1]
            advanced = False
            for nb in it:
                if nb not in color:
                    continue
                if color[nb] == GRAY:
                    # 回边：指向当前路径上的祖先 → 成环
                    cycles.append(path[path.index(nb):] + [nb])
                elif color[nb] == WHITE:
                    color[nb] = GRAY
                    path.append(nb)
                    stack.append((nb, iter(sorted(graph.get(nb, ())))))
                    advanced = True
                    break
            if not advanced:
                color[node] = BLACK
                stack.pop()
                path.pop()
    return cycles


# ============================================================================
# 交互式路径确认
# ============================================================================

def interactive_path_confirm() -> tuple:
    """交互式确认路径，允许直接回车采用默认值（对话明确要求）"""
    print("=" * 55)
    print("  memory-mgr.py - MEMORY.md 记忆系统维护工具")
    print("=" * 55)
    main_input = input(f"主文件路径 [默认: {DEFAULT_MAIN_FILE}]: ").strip()
    main_file = main_input if main_input else DEFAULT_MAIN_FILE
    sub_input = input(f"子文件目录 [默认: {DEFAULT_SUB_FILES_DIR}]: ").strip()
    sub_dir = sub_input if sub_input else DEFAULT_SUB_FILES_DIR
    print(f"\n  主文件: {main_file}")
    print(f"  子目录: {sub_dir}")
    print("=" * 55)
    return main_file, sub_dir


# ============================================================================
# v5.3.0：启动期路径校验 + 本地记录复用
# ============================================================================
# 动因：默认路径失效是**静默**的——不会报错，只会去读写一个不存在的路径，表现为
# 「主文件不存在 / 0 个子文件」，Agent 无从判断是"路径错了"还是"记忆体系真的空了"。
# 现改为：执行初期显式校验，缺失即向 Agent 返回精准诊断与修正指令并中止。

def paths_cache_path() -> str:
    """本地路径记录文件位置：恒位于 memory-mgr.py 同目录（与 state/changelog 并列）"""
    return os.path.join(_norm(os.path.dirname(os.path.abspath(__file__))),
                        PATHS_CACHE_FILE_NAME)


def load_paths_cache():
    """读取本地路径记录；不存在或损坏时返回 None"""
    p = paths_cache_path()
    if not os.path.isfile(p):
        return None
    try:
        with open(p, encoding='utf-8') as f:
            d = json.load(f)
        mf, sd = d.get('main_file'), d.get('sub_files_dir')
        if isinstance(mf, str) and isinstance(sd, str) and mf and sd:
            return _norm(mf), _norm(sd)
    except Exception:
        pass
    return None


def save_paths_cache(main_file: str, sub_files_dir: str) -> bool:
    """原子写本地路径记录（tmp + os.replace），失败不影响主流程"""
    p = paths_cache_path()
    tmp = p + '.tmp'
    try:
        payload = {
            'main_file': _norm(main_file),
            'sub_files_dir': _norm(sub_files_dir),
            'saved_at': datetime.now(timezone(timedelta(hours=8))).isoformat(),
            'note': 'v5.3.0 启动期校验通过后自动记录，供后续复用；路径失效会自动回落重校验。',
        }
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
        return True
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


def validate_paths(main_file: str, sub_files_dir: str) -> tuple:
    """校验记忆体系路径，返回 (ok, problems)；problems 为 [(项, 实际值, 原因), ...]

    判据（v5.3.0）：
      · 主记忆文件：存在、且文件名**恒为** MEMORY.md（大小写不敏感）
      · 子记忆目录：存在、且目录内至少有一个 Memory-*.md（大小写不敏感）
    """
    problems = []
    if not main_file:
        problems.append(('主记忆文件', '(未指定)', '路径为空'))
    elif not os.path.isfile(main_file):
        problems.append(('主记忆文件', _norm(main_file), '文件不存在'))
    elif os.path.basename(main_file).lower() != MAIN_FILE_NAME.lower():
        problems.append(('主记忆文件', _norm(main_file),
                         f'文件名须恒为 {MAIN_FILE_NAME}（大小写不敏感）'))

    if not sub_files_dir:
        problems.append(('子记忆目录', '(未指定)', '路径为空'))
    elif not os.path.isdir(sub_files_dir):
        problems.append(('子记忆目录', _norm(sub_files_dir), '目录不存在'))
    else:
        n = len(list_sub_file_names(sub_files_dir))
        if n == 0:
            problems.append(('子记忆目录', _norm(sub_files_dir),
                             '目录内无子记忆文件（须含 Memory-*.md，大小写不敏感）'))
    return (len(problems) == 0), problems


def _print_paths_error(problems, sources):
    """向 Agent 输出精准诊断与修正指令（stdout，便于 Agent 直接读取）"""
    print("=" * 72)
    print("[ERROR] 记忆体系路径校验未通过 —— 已中止，未执行任何命令")
    print("=" * 72)
    for item, actual, reason in problems:
        print(f"  ✗ {item}")
        print(f"      实际: {actual}")
        print(f"      原因: {reason}")
    if sources:
        print(f"  · 本次取值来源: {sources}")
    print("  ---- 请显式传入路径后重新执行（任选其一）----")
    print("  方式 A（推荐，Agent 直接传参）：")
    print('    python memory-mgr.py --main-file "<主文件绝对路径\\MEMORY.md>" '
          '--sub-files-dir "<子记忆目录绝对路径>" <命令>')
    print("      · 主文件名恒为 MEMORY.md；子记忆文件名为 Memory-*.md（大小写不敏感）")
    print("      · 主文件默认位于用户目录下 .workbuddy/ ；子记忆目录默认与本脚本同目录")
    print("  方式 B（设置环境变量后重跑）：")
    print("    MEMORY_MAIN_FILE=<主文件绝对路径>  MEMORY_SUB_FILES_DIR=<子记忆目录绝对路径>")
    print("  方式 C（由用户交互确认，需终端 TTY，勿加 --no-interactive）：")
    print("    python memory-mgr.py <命令>")
    print("=" * 72)


def resolve_paths(main_file=None, sub_files_dir=None, no_interactive=False,
                  verbose=False):
    """启动期路径解析：命令行 > 本地记录 > 默认推导，随后校验；通过则记录复用。

    返回 (main_file, sub_files_dir)；校验失败时打印诊断并返回 None。
    """
    explicit = bool(main_file or sub_files_dir)
    cached = load_paths_cache()

    def _candidates():
        """候选路径序列：已校验通过者即采用。

        · 显式传参时**只**校验该组合（尊重调用方意图，不静默改用其它路径）；
          未传的那一项用本地记录 / 默认补全。
        · 未显式传参时依次尝试：本地记录 → 默认推导（本地记录失效会自动回落，
          这正是「记录复用」应有的自愈行为——缓存只是加速手段，不是权威配置）。
        """
        if explicit:
            mf = _norm(main_file or (cached[0] if cached else default_main_file()))
            sd = _norm(sub_files_dir or (cached[1] if cached else default_sub_files_dir()))
            yield ('命令行参数', mf, sd)
            return
        if cached:
            yield ('本地记录 memory-paths.json', cached[0], cached[1])
        yield ('默认推导（主文件=用户目录/.workbuddy；子目录=脚本同目录）',
               default_main_file(), default_sub_files_dir())

    src_main = src_sub = ''
    for src, mf, sd in _candidates():
        ok, problems = validate_paths(mf, sd)
        if ok:
            main_file, sub_files_dir = mf, sd
            src_main = src_sub = src
            break
    else:
        main_file = _norm(main_file or (cached[0] if cached else default_main_file()))
        sub_files_dir = _norm(sub_files_dir or (cached[1] if cached else default_sub_files_dir()))
        src_main = src_sub = '全部候选均未通过'
        ok, problems = validate_paths(main_file, sub_files_dir)

    if not ok and sys.stdin.isatty() and not no_interactive:
        # 交互环境下给一次机会：由用户现场确认/修正路径
        print("[WARN] 自动解析的路径未通过校验，请确认路径：")
        for item, actual, reason in problems:
            print(f"  ✗ {item}: {actual} —— {reason}")
        im, isd = interactive_path_confirm()
        main_file, sub_files_dir = _norm(im), _norm(isd)
        src_main = src_sub = '交互确认'
        ok, problems = validate_paths(main_file, sub_files_dir)

    if not ok:
        _print_paths_error(problems, f"主文件={src_main}；子目录={src_sub}")
        return None

    if save_paths_cache(main_file, sub_files_dir) and verbose:
        print(f"[INFO] 路径校验通过并已记录: {paths_cache_path()}")
    return main_file, sub_files_dir


# ============================================================================
# 主类
# ============================================================================

class MemoryManager:
    """记忆管理系统主类"""

    def __init__(self, main_file: str = None, sub_files_dir: str = None):
        self.main_file = normalize_path(main_file or DEFAULT_MAIN_FILE)
        self.sub_files_dir = normalize_path(sub_files_dir or DEFAULT_SUB_FILES_DIR)
        self.state_file = join_paths(self.sub_files_dir, STATE_FILE_NAME)
        self.changelog_file = join_paths(self.sub_files_dir, CHANGELOG_FILE_NAME)

        # 确保子文件目录存在
        os.makedirs(self.sub_files_dir, exist_ok=True)

        # v5.2.4（Round1 B-5，P2）：**单进程内备份去重**登记表。
        # 动因：`index` 会连续两次写主文件（表② MAIN_INDEX 与表① ROUTE_CARD 各一次），
        # 第二次的 .bak 会把第一次覆盖掉，最终 .bak 是「主索引已重建、路由卡未更新」的
        # **中间态**，事后无法回滚到本次执行前 —— 与手册 §0.3「备份优先 / 破坏可回滚」
        # 相悖。去重后，.bak 恒为「本次进程首次写入该路径前」的完整快照。
        self._backed_up_paths = set()

        # 初始化状态文件
        self.state = self._load_state()

    # ------------------------------------------------------------------------
    # 文件 I/O（含 .bak 备份）
    # ------------------------------------------------------------------------

    def _read_file(self, filepath: str) -> str:
        """读取文件内容"""
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()

    def _write_file(self, filepath: str, content: str, backup: bool = True):
        """写入文件内容，修改前自动创建 .bak 备份（对话安全边界要求）

        v5.2.2（P2-8，成立）：备份失败时**阻断写入**并返回 False——原实现仅打印
        WARN 后继续覆写原文件，一旦备份因权限 / 磁盘满 / 跨分区失败，就变成
        「无备份的破坏性写入」，与手册 §0.3「备份优先」直接冲突。

        v5.2.3（双审计第二轮 P2-2，成立）：改为**原子写**——先落 `.tmp` 再
        `os.replace` 原子换名。原实现直接 `open(path,'w')` 就地覆写：写入途中
        崩溃 / 断电 / 磁盘满会把文件截成半截，而 `.bak` 只在**写入前**生成，
        挡不住写入中途的损坏。`os.replace` 在同分区内是原子操作，失败时
        原文件**一字不动**（`.tmp` 已清理），与 §0.3 同源。
        """
        if backup and os.path.exists(filepath):
            # v5.2.4（B-5）：同一路径在同一进程内只备份一次，保证 .bak 是「执行前完整
            # 快照」而非中间态。已备份过则跳过（不覆盖），不视为失败。
            if filepath in self._backed_up_paths:
                pass
            elif not self._backup_file(filepath):
                print(f"[ERROR] 备份失败，已**放弃**写入以避免无备份的破坏性修改: {filepath}")
                return False
            else:
                self._backed_up_paths.add(filepath)
        os.makedirs(os.path.dirname(filepath) or '.', exist_ok=True)
        tmp_path = filepath + '.tmp'
        try:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, filepath)
        except Exception as e:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass
            print(f"[ERROR] 写入失败，原文件未被改动: {filepath} -> {e}")
            return False
        return True

    def _backup_file(self, filepath: str) -> bool:
        """创建 .bak 备份；返回 True/False（v5.2.2：失败可被 `_write_file` 用于阻断）"""
        backup_path = filepath + '.bak'
        try:
            shutil.copy2(filepath, backup_path)
            return True
        except Exception as e:
            print(f"[WARN] 备份失败 {filepath}: {e}")
            return False

    def _to_file_url(self, path: str) -> str:
        """转换为 file:// URL"""
        normalized = path.replace('\\', '/')
        return f"file:///{normalized}"

    # ------------------------------------------------------------------------
    # 状态文件管理
    # ------------------------------------------------------------------------

    def _load_state(self) -> dict:
        """加载 memory-state.json"""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                print("[ERROR] memory-state.json 解析失败，将重新生成")
        return self._create_default_state()

    def _create_default_state(self) -> dict:
        """创建默认状态文件（v2.0.0 修正：8 个必填字段、max_lines=1000、large_file_exception）"""
        now = datetime.now(timezone.utc).isoformat()
        return {
            "version": "2.0.0",
            "schema": "memory-mgr-v2",
            "created_at": now,
            "last_updated": now,
            "paths": {
                "main_file": self.main_file,
                "sub_files_dir": self.sub_files_dir,
                "state_file": self.state_file,
                "changelog_file": self.changelog_file
            },
            "sub_files": [],
            "chapter_offsets": {},
            "index": {
                "main_file_index": {
                    "high_frequency_rules": [],
                    "file_entries": []
                },
                "generated_at": now,
                "generator_version": "2.0.0"
            },
            "constraints": {
                "max_sub_file_lines": MAX_SUB_FILE_LINES,
                "max_main_file_lines": 100,
                "allow_circular_refs": False,
                "required_frontmatter_fields": REQUIRED_FRONTMATTER_FIELDS,
                "naming_pattern": r"^Memory-[^\s]+\.md$",
                "large_file_exception": LARGE_FILE_EXCEPTION
            }
        }

    def _save_state(self, state: dict = None):
        """保存 memory-state.json"""
        if state is None:
            state = self.state
        state['last_updated'] = datetime.now(timezone.utc).isoformat()
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        with open(self.state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------------------
    # 变更日志管理
    # ------------------------------------------------------------------------

    def _load_changelog(self) -> list:
        """加载 memory-changelog.json"""
        if os.path.exists(self.changelog_file):
            try:
                with open(self.changelog_file, 'r', encoding='utf-8') as f:
                    return json.load(f).get('entries', [])
            except json.JSONDecodeError:
                return []
        return []

    def _save_changelog(self, entries: list):
        """保存 memory-changelog.json"""
        data = {"version": "2.0.0", "entries": entries}
        os.makedirs(os.path.dirname(self.changelog_file), exist_ok=True)
        with open(self.changelog_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _add_changelog_entry(self, action: str, target_file: str, initiator: str,
                             summary: str, details: dict = None):
        """添加变更日志条目（v2.0.0: 含 git_commit 字段，git 可用时填充）"""
        entries = self._load_changelog()
        git_commit = self._git_get_head() if self._git_available() else None
        entry = {
            "id": f"entry-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{len(entries)+1:03d}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "target_file": target_file,
            "initiator": initiator,
            "summary": summary,
            "details": details or {},
            "git_commit": git_commit
        }
        entries.append(entry)
        self._save_changelog(entries)

    # ------------------------------------------------------------------------
    # Git 集成（可选增强，git 不可用时所有功能降级）
    # ------------------------------------------------------------------------

    def _git_available(self) -> bool:
        """检查 git 是否可用且子文件目录位于 git 仓库中"""
        try:
            result = subprocess.run(
                ['git', '-C', self.sub_files_dir, 'rev-parse', '--is-inside-work-tree'],
                capture_output=True, text=True, timeout=5
            )
            return result.returncode == 0 and result.stdout.strip() == 'true'
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def _git_get_head(self) -> str:
        """获取当前 HEAD commit hash（git 不可用时返回 None）"""
        try:
            result = subprocess.run(
                ['git', '-C', self.sub_files_dir, 'rev-parse', 'HEAD'],
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip() if result.returncode == 0 else None
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None

    def _git_log(self, filepath: str = None, limit: int = 10) -> list:
        """获取 git log（git 不可用时返回空列表）"""
        if not self._git_available():
            return []
        cmd = ['git', '-C', self.sub_files_dir, 'log', f'--oneline', f'-{limit}']
        if filepath:
            cmd.append('--')
            cmd.append(filepath)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return []

    def _git_diff(self, before: str = None, after: str = None, filepath: str = None) -> str:
        """获取 git diff 输出（git 不可用时返回空字符串）"""
        if not self._git_available():
            return ""
        cmd = ['git', '-C', self.sub_files_dir, 'diff']
        if before and after:
            cmd.append(f'{before}..{after}')
        elif before:
            cmd.append(f'{before}..HEAD')
        if filepath:
            cmd.append('--')
            cmd.append(filepath)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            return result.stdout if result.returncode == 0 else ""
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return ""

    def _git_repo_root(self) -> str:
        """返回 sub_files_dir 所在 git 仓库根（git 不可用时回退到 sub_files_dir）"""
        if not self._git_available():
            return self.sub_files_dir
        try:
            result = subprocess.run(['git', '-C', self.sub_files_dir, 'rev-parse',
                                     '--show-toplevel'], capture_output=True, text=True, timeout=15)
            return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else self.sub_files_dir
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return self.sub_files_dir

    def _git_show(self, commit: str, filepath: str = None) -> str:
        """查看单版本文件内容（git show <commit>[:<file>]，git 不可用时返回空字符串）

        对话.txt 七、git 集成能力要求：git show → 单版本查看
        """
        if not self._git_available():
            return ""
        try:
            if filepath:
                rel = os.path.relpath(filepath, self._git_repo_root())
                cmd = ['git', '-C', self.sub_files_dir, 'show', f'{commit}:{rel}']
            else:
                cmd = ['git', '-C', self.sub_files_dir, 'show', commit]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            return result.stdout if result.returncode == 0 else ""
        except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
            return ""

    def _git_restore(self, commit: str, filepath: str, force: bool = False) -> bool:
        """回滚文件到历史版本（git checkout <commit> -- <file>，需 --force + .bak 备份）

        对话.txt 七、git 集成能力要求：git restore → 回滚到历史版本
        """
        if not self._git_available():
            print("[ERROR] git 不可用，无法回滚（可手动依据 memory-changelog.json 追溯并编辑恢复）")
            return False
        if not force:
            print(f"[WARN] 回滚将覆盖 {filepath} 的当前内容，请加 --force 确认")
            return False
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filepath}")
            return False
        # v5.2.4（Round1 B-4，P2）：原实现丢弃 `_backup_file` 的返回值，备份失败
        # （权限 / 磁盘满 / 跨分区）后仍执行 `git checkout` 覆盖当前内容 —— 与手册
        # §0.3「备份优先」直接冲突：回滚是不可逆覆盖，无备份即不可回滚。现改为
        # 备份失败即**中止**，宁可不回滚也不制造无备份的覆盖。
        if not self._backup_file(filepath):
            print(f"[ERROR] 回滚前备份失败，已**放弃**回滚以避免无备份的破坏性覆盖: {filepath}")
            return False
        rel = os.path.relpath(filepath, self._git_repo_root())
        try:
            result = subprocess.run(['git', '-C', self.sub_files_dir, 'checkout', commit,
                                      '--', rel], capture_output=True, text=True, timeout=15)
            if result.returncode == 0:
                print(f"[OK] 已回滚 {filepath} 到 {commit}（备份: {filepath}.bak）")
                self._add_changelog_entry('restore', os.path.basename(filepath), 'agent',
                                          f'回滚到 {commit}', {'commit': commit})
                self.sync(force=True)
                return True
            print(f"[ERROR] 回滚失败: {result.stderr.strip()}")
            return False
        except (FileNotFoundError, subprocess.TimeoutExpired):
            print("[ERROR] git 执行失败")
            return False

    # ------------------------------------------------------------------------
    # YAML Front Matter 解析（v2.0.0: 支持多行列表 + 行内列表）
    # ------------------------------------------------------------------------

    def _parse_yaml_frontmatter(self, content: str) -> tuple:
        """解析 YAML Front Matter
        支持：
        - 简单键值: key: value
        - 行内列表: key: [a, b, c]
        - 多行列表: key:\\n  - item1\\n  - item2
        - 带引号值: key: "value"（v5.2.2：读取侧做**对称反转义**，与写入侧口径一致）

        v5.2.2 加固（双审计 P0-1 的部分成立项）：
        · **不支持** YAML 多行字符串指示符 `|` / `>` —— 原实现会静默丢弃后续缩进行，
          现显式报错并中止该次解析，杜绝「元数据悄悄少一半」；
        · **行内 `#` 注释**（v5.2.3）：审计指出 `key: value # 注释` 会被整段当值——
          复核**属实**（取值正则捕获整行剩余内容，`#` 及其后原样并入值），已按 YAML
          规范剥离（未加引号标量遇「空格+#」截断；加引号标量以闭合引号为界），
          见 `strip_yaml_inline_comment`。整行以 `#` 开头仍作注释跳过。
        """
        if not content.startswith('---'):
            return {}, content
        # 更严格的 YAML 块边界匹配：匹配第一个 \n--- 到下一个行首独立 \n---
        # 避免 re.DOTALL 下 .*? 跨多个 --- 水平线误匹配
        fm_start = 4  # 跳过开头的 '---\n'
        fm_end = content.find('\n---\n', fm_start)
        if fm_end < 0:
            # 兼容：尝试 \n---\r\n
            fm_end = content.find('\n---\r\n', fm_start)
        if fm_end < 0:
            return {}, content
        yaml_content = content[fm_start:fm_end]
        body_start = fm_end + 5  # len('\n---\n')
        if body_start < len(content) and content[body_start] == '\n':
            body_start += 1
        body = content[body_start:]
        metadata = {}
        lines = yaml_content.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i]
            if not line.strip() or line.strip().startswith('#'):
                i += 1
                continue
            m = re.match(r'^(\w[\w-]*)\s*:\s*(.*)$', line)
            if not m:
                i += 1
                continue
            key = m.group(1)
            # v5.2.3：行内注释剥离（YAML 规范口径，见 strip_yaml_inline_comment）
            value = strip_yaml_inline_comment(m.group(2))
            if value == '':
                # 多行列表起始
                items = []
                i += 1
                while i < len(lines) and lines[i].strip().startswith('- '):
                    item = lines[i].strip()[2:].strip()
                    if len(item) >= 2 and item[0] == item[-1] and item[0] in ('"', "'"):
                        item = unescape_yaml_scalar(item[1:-1]) if item[0] == '"' else item[1:-1]
                    else:
                        item = item.strip('"').strip("'")
                    items.append(item)
                    i += 1
                metadata[key] = items
                continue
            elif value.startswith('[') and value.endswith(']'):
                # 行内列表
                inner = value[1:-1]
                items = []
                for x in inner.split(','):
                    x = x.strip()
                    if not x:
                        continue
                    if len(x) >= 2 and x[0] == x[-1] and x[0] in ('"', "'"):
                        items.append(unescape_yaml_scalar(x[1:-1]) if x[0] == '"' else x[1:-1])
                    else:
                        items.append(x.strip('"').strip("'"))
                metadata[key] = items
            else:
                # v5.2.2：多行字符串指示符检测（零依赖解析器无法表达该语法，
                # 原实现会静默丢弃后续缩进行 → 显式报错，不静默降级）
                stripped = value.strip()
                if stripped in ('|', '>', '|-', '>-', '|+', '>+') or stripped.endswith((' |', ' >')):
                    print(f"[ERROR] YAML 字段 '{key}' 使用了多行字符串指示符（| / >），"
                          f"本工具为零依赖简易解析器不支持该语法（会静默丢弃后续行）。"
                          f"请改为单行值或行内列表 `[a, b]` 后重试。")
                    return {}, content
                # 简单值：去包裹引号 + 对称反转义
                if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in ('"', "'"):
                    metadata[key] = (unescape_yaml_scalar(stripped[1:-1]) if stripped[0] == '"'
                                     else stripped[1:-1])
                else:
                    metadata[key] = stripped.strip('"').strip("'")
            i += 1
        return metadata, body

    def _build_yaml_frontmatter(self, metadata: dict) -> str:
        """构建 YAML Front Matter 字符串（related 用多行列表，tags 用行内列表）"""
        lines = ['---']
        for key, value in metadata.items():
            if isinstance(value, list):
                if key == 'related':
                    lines.append(f'{key}:')
                    for item in value:
                        lines.append(f'  - "{item}"')
                else:
                    items = ', '.join([f'"{v}"' if any(c in str(v) for c in ' ,:') else str(v) for v in value])
                    lines.append(f'{key}: [{items}]')
            else:
                v = str(value)
                # YAML 规范：含特殊字符或以特殊字符开头的值必须引号包裹
                needs_quote = (
                    any(c in v for c in ' :#\'"')
                    or v.startswith(('[', '{', '*', '&', '!', '|', '>', '%', '@', '`', '?', '-', ','))
                    or key in ('title', 'topic', 'created', 'updated', 'scope', 'parent')
                )
                if needs_quote:
                    # 转义反斜杠与双引号，避免生成非法 YAML（修复 豆包BUG-3）
                    escaped = v.replace('\\', '\\\\').replace('"', '\\"')
                    lines.append(f'{key}: "{escaped}"')
                else:
                    lines.append(f'{key}: {v}')
        lines.append('---')
        return '\n'.join(lines) + '\n'

    # ------------------------------------------------------------------------
    # 章节提取（H2/H3，索引只到 H3；H4 仅用于锚点检查）
    # ------------------------------------------------------------------------

    def _extract_chapters(self, content: str) -> list:
        """从 Markdown 内容提取 H2/H3 章节（含行号范围）
        算法：先收集所有章节起始行号，然后：
        - H2 的 end_line = 下一个 H2 的 start_line - 1（若无则 = 文件总行数）
        - H3 的 end_line = 下一个 H3 的 start_line - 1（若无则 = 父 H2 的 end_line）
        """
        lines = content.split('\n')
        total_lines = len(lines)
        all_chapters = []
        for i, line in enumerate(lines, 1):
            h2_match = H2_PATTERN.match(line)
            if h2_match:
                all_chapters.append({'level': 2, 'start_line': i, 'title': h2_match.group(1).strip()})
                continue
            h3_match = H3_PATTERN.match(line)
            if h3_match:
                all_chapters.append({'level': 3, 'start_line': i, 'title': h3_match.group(1).strip()})

        # 计算 end_line
        level_indices = {2: [], 3: []}
        for idx, ch in enumerate(all_chapters):
            level_indices[ch['level']].append(idx)

        h2_pos = level_indices[2]
        for pos, idx in enumerate(h2_pos):
            ch = all_chapters[idx]
            if pos + 1 < len(h2_pos):
                next_idx = h2_pos[pos + 1]
                ch['end_line'] = all_chapters[next_idx]['start_line'] - 1
            else:
                ch['end_line'] = total_lines

        h3_pos = level_indices[3]
        for pos, idx in enumerate(h3_pos):
            ch = all_chapters[idx]
            # 定位当前 H3 所属的父 H2
            parent_h2_idx = None
            for j in range(idx - 1, -1, -1):
                if all_chapters[j]['level'] == 2:
                    parent_h2_idx = j
                    break
            if pos + 1 < len(h3_pos):
                next_idx = h3_pos[pos + 1]
                # 定位下一个 H3 所属的父 H2
                next_h2_idx = None
                for j in range(next_idx - 1, -1, -1):
                    if all_chapters[j]['level'] == 2:
                        next_h2_idx = j
                        break
                if next_h2_idx is not None and next_h2_idx == parent_h2_idx:
                    # 同 H2 内的下一个 H3：end_line = 其起始行 - 1
                    ch['end_line'] = all_chapters[next_idx]['start_line'] - 1
                else:
                    # 下一个 H3 已跨入新的 H2：H3 范围不得吞掉后续 H2 标题，
                    # 以父 H2 的 end_line 为界（修复 豆包BUG-1 / DeepSeek BUG-5）
                    ch['end_line'] = all_chapters[parent_h2_idx]['end_line'] if parent_h2_idx is not None else total_lines
            else:
                ch['end_line'] = all_chapters[parent_h2_idx]['end_line'] if parent_h2_idx is not None else total_lines

        # 格式化输出
        result = []
        for ch in all_chapters:
            heading = f"{'##' if ch['level'] == 2 else '###'} {ch['title']}"
            # 找到最近的 H2 作为 parent
            parent = None
            for j in range(len(result) - 1, -1, -1):
                if result[j]['level'] == 2:
                    parent = result[j]['heading']
                    break
            result.append({
                'level': ch['level'],
                'title': ch['title'],
                'heading': heading,
                'start_line': ch['start_line'],
                'end_line': ch['end_line'],
                'parent': parent  # 若文件以 H3 开头，parent 为 None（Q3 修复）
            })
        return result

    def _extract_all_headings_for_anchors(self, content: str) -> set:
        """提取文件中所有 H2/H3/H4 标题的锚点集合（用于锚点存在性检查）

        v5.2.4（Round1 B-15，P2，已实测复现）：原实现用 H2/H3/H4_PATTERN 对**全文**
        做 finditer，不维护代码围栏状态，会把 ``` 代码块内的伪标题（如示例里的
        `## 1-9 xxx`）纳入锚点集合。后果是「指向不存在的锚点」被判为存在——即
        **漏报真实断链**，与本项目「宁可多报不可漏报」的取向相反。
        现复用 `_scan_headings_ordered`（已实现围栏跳过，与 rewrite 同口径）作为
        单一事源，锚点文本取「完整行去掉 # 前缀」，与原 `m.group(1).strip()` 等价。
        """
        anchors = set()
        for _lvl, full_line, _title in self._scan_headings_ordered(content):
            text = full_line.lstrip('#').strip()
            if text:
                anchors.add(heading_to_anchor(text))
        return anchors

    def _compute_offsets_dict(self, chapters: list) -> dict:
        """将章节列表转为消歧后的偏移字典（重复标题用出现序号消歧）"""
        offsets = {}
        seen = {}
        for ch in chapters:
            key = ch['heading']
            n = seen.get(key, 0)
            seen[key] = n + 1
            store_key = key if n == 0 else f"{key} #{n}"
            offsets[store_key] = {
                'start_line': ch['start_line'],
                'end_line': ch['end_line']
            }
        return offsets

    def _update_chapter_offsets(self, sub_file: str, chapters: list):
        """更新 chapter_offsets"""
        self.state['chapter_offsets'][sub_file] = self._compute_offsets_dict(chapters)

    def _has_link_to(self, content: str, filename: str) -> bool:
        """判断 content 中是否存在指向 filename 的 Markdown 链接"""
        for _, url in MARKDOWN_LINK_PATTERN.findall(content):
            target = url.split('/')[-1].split('#')[0]
            if target == filename:
                return True
        return False

    def _strip_redundant_h1(self, content: str, title: str) -> str:
        """C-3: 剥离与 title/topic 重复的冗余 H1（篇级 H1 保留）

        子记忆文件普遍以 H1 作「篇」级标题（如 `# 第三篇：账户与身份`），属合法结构；
        仅当 H1 文本与文件 title/topic 实质重复（标题冗余、未承载篇级语义）时才剥离，
        避免新建文件出现「YAML title = abc」+「# abc」的无意义重复。
        """
        lines = content.split('\n')
        if not lines:
            return content
        m = re.match(r'^#\s+(.+?)\s*$', lines[0])
        if not m:
            return content
        h1_text = m.group(1).strip()
        norm = lambda s: re.sub(r'[\s\W]+', '', s.lower())
        if norm(h1_text) and norm(h1_text) == norm(title or ''):
            print(f"[INFO] 已剥离与 title 重复的冗余 H1: '# {h1_text}'")
            return '\n'.join(lines[1:]).lstrip('\n')
        return content

    def _ensure_main_backlink(self, content: str) -> str:
        """C-1: 正文缺失「子→主」回链时自动补全

        主↔子双向链接是本体系中枢模式（见 §10 第 11 条主↔子豁免），新建子文件必须带
        回链，否则 `check` 维度 7 与主索引双向校验均无法闭环。回链置于文件末尾。
        """
        if self._has_link_to(content, 'MEMORY.md'):
            return content
        main_url = self._to_file_url(self.main_file)
        backlink = f"\n\n[→主文件]({main_url})\n"
        print(f"[INFO] 正文缺少指向主文件的回链，已自动补全: {main_url}")
        return content.rstrip('\n') + backlink

    def _safe_filename(self, filename: str) -> str:
        """净化文件名，拒绝路径穿越"""
        safe = os.path.basename(filename)
        if safe != filename or '..' in filename:
            raise ValueError(f"非法文件名（含路径分隔符或 ..）: {filename}")
        return safe

    def _sub_file_sort_key(self, filename: str):
        """子文件排序键（v5.0.0，零硬编码）

        优先级：① YAML `file_number`（新体系权威依据）
                ② 首个 H2 的旧编号（file_number 缺失时的兜底，忠实原语义顺序）
                ③ 文件名字典序（两者皆无时的确定性回退）
        返回 (分组号, 编号, 文件名)，保证 key 可比较、不抛异常。
        """
        try:
            content = self._read_file(join_paths(self.sub_files_dir, filename))
        except Exception:
            return (2, 0, filename)
        meta, _ = self._parse_yaml_frontmatter(content)
        fn = meta.get('file_number')
        if fn is not None:
            try:
                return (0, int(str(fn).strip()), filename)
            except (TypeError, ValueError):
                pass  # file_number 非法（非整数）→ 降级到兜底
        m = re.search(r'^##\s+(\d+)', content, re.MULTILINE)
        if m:
            return (1, int(m.group(1)), filename)
        return (2, 0, filename)

    def _list_sub_files(self) -> list:
        """列出所有子文件，按 YAML `file_number` 升序（v5.0.0）

        v5.0.0：废弃 SUB_FILE_ORDER 硬编码清单，改按各文件 YAML 的 `file_number`
        动态排序（字段就近维护，工具零硬编码文件名）。兜底规则见 _sub_file_sort_key。
        """
        # v5.2.2（P2-1，成立）：加 isfile 过滤——若目录中存在名为 `Memory-x.md`
        # 的**子目录**（不是文件），会被当成子文件列出，后续 _read_file 直接抛异常。
        # v5.3.0：改用单一事源 `list_sub_file_names`，匹配**大小写不敏感**。
        disk = list_sub_file_names(self.sub_files_dir)
        return sorted(disk, key=self._sub_file_sort_key)

    # ------------------------------------------------------------------------
    # 编号完整性 / 清单一致性（v5.0.0：check 维度11/12 与 validate 纪律3 共用）
    # ------------------------------------------------------------------------

    def _check_numbering_integrity(self, sub_files: list, sub_contents: dict,
                                   sub_metadata: dict) -> tuple:
        """编号完整性检查（v5.0.0 · 手册 §3.9 ① 判据 1~9）

        判据 1~3：YAML `file_number` 存在 / 全局唯一 / 取值合法（非负整数）
        判据 4：章编号前缀 N 与 YAML `file_number` 一致
        判据 5~7：M / X / Z 在各自父级内从 1 起连续、不重复、不跳号
        判据 8：层级从属正确（H3 必挂 H2、H4 必挂 H3）
        判据 9：编号格式合法（N-M / N-M-X / N-M-X-Z，连字符分隔）
        第 10 项（锚点唯一性）由 `断链检测.py` 负责（它天然持有 anchor_set）。
        返回 (errors, warnings)，供 check 维度11 与 validate 纪律3 共用 → 单一事源。
        """
        errors, warnings = [], []
        seen_n = {}
        for sf in sub_files:
            # ---- 判据 1/2/3：file_number 存在、唯一、合法 ----
            fn_raw = str(sub_metadata[sf].get('file_number', '') or '').strip()
            if not fn_raw:
                errors.append(f"[维度11] {sf}: 缺少 YAML `file_number`（编号体系的 N 值，"
                              f"须先跑 `number --init` 或 `add` 自动分配，见手册 §2.3）")
                continue
            try:
                n = int(fn_raw)
                if n < 0:
                    raise ValueError
            except ValueError:
                errors.append(f"[维度11] {sf}: `file_number` 取值非法 '{fn_raw}'（须为非负整数）")
                continue
            if n in seen_n:
                errors.append(f"[维度11] `file_number` 重复：{sf} 与 {seen_n[n]} 同为 {n}"
                              f"（须全局唯一，见手册 §3.9 判据 2）")
            else:
                seen_n[n] = sf

            # ---- 判据 4~9：逐标题校验 ----
            m_prev = x_prev = z_prev = None   # 各层级上一个序号
            cur_m = None                      # 当前所属 H2 的 M
            in_fence = False
            for ln_no, line in enumerate(sub_contents[sf].split('\n'), 1):
                if re.match(r'^\s*(```|~~~)', line):
                    in_fence = not in_fence
                    continue
                if in_fence:
                    continue
                lvl = None
                for cand, pat in ((2, r'^##(?!#)\s+'), (3, r'^###(?!#)\s+'), (4, r'^####(?!#)\s+')):
                    if re.match(pat, line):
                        lvl = cand
                        title = re.sub(pat, '', line).strip()
                        break
                if lvl is None:
                    continue
                mt = re.match(r'^(\d+)(?:-(\d+))?(?:-(\d+))?(?:-(\d+))?(?!\S)', title)
                if not mt:
                    errors.append(f"[维度11] {sf}:{ln_no}: 标题编号格式非法 → '{title[:32]}'"
                                  f"（须为 N-M / N-M-X / N-M-X-Z，连字符分隔，见手册 §2.3 ③）")
                    continue
                parts = [mt.group(i) for i in (1, 2, 3, 4)]
                depth = sum(1 for v in parts if v is not None)
                expect_depth = {2: 2, 3: 3, 4: 4}[lvl]
                if depth != expect_depth:
                    errors.append(f"[维度11] {sf}:{ln_no}: H{lvl} 编号层级不符"
                                  f"（应 {expect_depth} 段，实 {depth} 段）→ '{title[:32]}'")
                    continue
                if int(parts[0]) != n:
                    errors.append(f"[维度11] {sf}:{ln_no}: 章编号前缀与 `file_number` 不符"
                                  f"（标题 N={parts[0]}，YAML file_number={n}）")
                    continue
                if lvl == 3 and cur_m is None:
                    errors.append(f"[维度11] {sf}:{ln_no}: H3 标题未挂在任何 H2 之下（层级从属错误）")
                    continue
                if lvl == 4 and x_prev is None:
                    errors.append(f"[维度11] {sf}:{ln_no}: H4 标题未挂在任何 H3 之下（层级从属错误）")
                    continue
                if lvl == 2:
                    v = int(parts[1])
                    if m_prev is None and v != 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: 首个章号 M={v}，应从 1 开始")
                    elif m_prev is not None and v != m_prev + 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: 章号 M 不连续 {m_prev}→{v}")
                    m_prev, cur_m = v, v
                    x_prev = z_prev = None
                elif lvl == 3:
                    v = int(parts[2])
                    if x_prev is None and v != 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: ##{n}-{cur_m} 首个节号 X={v}，应从 1 开始")
                    elif x_prev is not None and v != x_prev + 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: 节号 X 在 ##{n}-{cur_m} 内不连续 "
                                      f"{x_prev}→{v}")
                    x_prev = v
                    z_prev = None
                else:
                    v = int(parts[3])
                    if z_prev is None and v != 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: 首个小节号 Z={v}，应从 1 开始")
                    elif z_prev is not None and v != z_prev + 1:
                        errors.append(f"[维度11] {sf}:{ln_no}: 小节号 Z 不连续 {z_prev}→{v}")
                    z_prev = v
        return errors, warnings

    def _check_manifest_consistency(self, sub_files: list, main_content: str) -> list:
        """清单一致性检查（v5.0.0 · check 维度12）

        双向 diff：主文件索引引用的 `Memory-*.md` 集合 ↔ 目录内实体集合。
        · 有引用无实体 → ERROR（按手册 §5 步骤4 A 段做"删除 or 更名"三步判定）
        · 有实体无引用 → WARN（跑 `index` 重建即可）
        返回 [(level, message)]，level ∈ {'error', 'warn'}。
        """
        referenced = set()
        for _, url in MARKDOWN_LINK_PATTERN.findall(main_content):
            if url.startswith('file:///'):
                fn = url.split('/')[-1].split('#')[0]
                if is_sub_file_name(fn):      # v5.3.0：大小写不敏感
                    referenced.add(fn)
        entities = set(sub_files)
        issues = []
        for fn in sorted(referenced - entities):
            issues.append(('error', f"[维度12] 清单不一致：主文件引用了不存在的子文件 '{fn}'"
                                    f"（按手册 §5 步骤4 A 段判定「删除 or 更名」；判不了即暂停询问用户）"))
        for fn in sorted(entities - referenced):
            issues.append(('warn', f"[维度12] 清单不一致：子文件 '{fn}' 未被主索引引用"
                                   f"（跑 `index` 重建即可；若仍缺失请核对其文件名与 YAML）"))
        return issues

    def _find_duplicate_paragraphs(self, sub_files: list, contents: dict) -> dict:
        """段落级内容指纹扫描（v5.2.2：`check` 维度6 与 `validate` 纪律2 的**单一事源**）

        此前两处各写一份、过滤口径不同：维度6 额外排除以 `-` 开头的长列表项，
        纪律2 不排除 → 同一段重复内容在两处会得出**不同结论**，与手册 §10 第 7 条
        「单一事源」自相矛盾（双审计 P1-3，成立）。现统一为**不排除**列表项
        （覆盖更全：列表项同样会承载重复事实；宁可提示级误报，不可漏检）。

        返回 {归一化指纹: [(文件名, 行号, 预览50字), ...]}
        """
        paragraph_hashes = {}
        for sf in sub_files:
            _, body = self._parse_yaml_frontmatter(contents.get(sf, ''))
            for i, line in enumerate(body.split('\n'), 1):
                stripped = line.strip()
                if (len(stripped) > 30 and not stripped.startswith('#')
                        and not stripped.startswith('|') and not stripped.startswith('>')
                        and 'file:///' not in stripped):
                    normalized = re.sub(r'[\d\s\W]+', '', stripped.lower())
                    if len(normalized) > 20:
                        paragraph_hashes.setdefault(normalized, []).append((sf, i, stripped[:50]))
        return paragraph_hashes

    # ------------------------------------------------------------------------
    # 维度13 主文件必备结构 / 维度14 越界引用（v5.2.1 新增）
    # ------------------------------------------------------------------------

    # 主文件「规则三」识别：正名写法 + 仅出现主题词的宽松写法均须命中
    MAIN_RULE3_PATTERN = re.compile(r'规则三[：:][^\n]*|记忆读取纪律')

    def _check_main_file_structure(self, main_content: str, main_display: str = 'MEMORY.md') -> list:
        """主文件必备结构检查（v5.2.1 · check 维度13，依据手册 §2.1 验收清单）

        逐项核对主文件 4 类组成部分：
          1) YAML Front Matter 8 必填字段齐全，且 `parent: null`（§3 约定 5）
          2) 高频纪律速览**必须含「规则三：记忆读取纪律」**——这是 §3.3 读前加载纪律
             在主文件的唯一落地载体；重建主文件时最易漏掉，故设为 ERROR 而非警告
          3) 两个工具写入区哨兵对（表① ROUTE_CARD / 表② MAIN_INDEX）齐全、顺序正确
          4) 禁止项：不得残留「自动整合候选」类手工维护区（v5.1.1 已回收，§2.1 禁止项 1）
        返回 [(level, message)]，level ∈ {'error', 'warn'}。
        """
        # v5.2.2（P2-5）：显示名取自真实路径 basename，不硬编码 'MEMORY.md'
        tag = f"[维度13] {main_display}"
        issues = []
        meta, body = self._parse_yaml_frontmatter(main_content)
        if not meta:
            issues.append(('error', f"{tag} 缺少 YAML Front Matter（必备结构第 1 项，手册 §2.1）"))
        else:
            for field in REQUIRED_FRONTMATTER_FIELDS:
                if field not in meta:
                    issues.append(('error', f"{tag} YAML 缺少必填字段 '{field}'（§3 约定 5）"))
            parent_raw = meta.get('parent')
            if str(parent_raw).strip().lower() not in ('null', 'none', '~', ''):
                issues.append(('error', f"{tag} YAML `parent` 应为 null，"
                                        f"当前为 '{parent_raw}'（§3 约定 5）"))

        if not self.MAIN_RULE3_PATTERN.search(body):
            issues.append(('error', f"{tag} 缺少「规则三：记忆读取纪律」"
                                    f"（§2.1 第 2 项；权威定义源 §3.3，重建主文件时必须补回）"))

        for label, (s_tag, e_tag) in (('表①写前路由卡', (ROUTE_CARD_START_TAG, ROUTE_CARD_END_TAG)),
                                      ('表②主索引', (MAIN_INDEX_START_TAG, MAIN_INDEX_END_TAG))):
            has_s, has_e = s_tag in main_content, e_tag in main_content
            if not has_s or not has_e:
                issues.append(('error', f"{tag} {label} 工具写入区哨兵不完整"
                                        f"（{'缺 START' if not has_s else '缺 END'}）"
                                        f"—— 须由 `index` 重建，禁止手工补写（§2.1 第 3 项）"))
            elif main_content.index(s_tag) > main_content.index(e_tag):
                issues.append(('error', f"{tag} {label} 哨兵顺序颠倒（END 在 START 之前）"))

        if '自动整合候选' in main_content:
            issues.append(('warn', f"{tag} 残留「自动整合候选」手工维护区"
                                   f"（v5.1.1 已回收；候选应按 §3.1 判定归属后直接入库目标子文件）"))
        return issues

    def _check_out_of_scope_refs(self, sub_files: list, sub_contents: dict,
                                 main_content: str = None, main_display: str = 'MEMORY.md') -> list:
        """越界引用检查（v5.2.1 · check 维度14，依据手册 §0.17 白名单制）

        合法链接目标 = 全部子记忆文件 ∪ 本手册 ∪ 主文件；指向体系外任意本地文件的
        链接一律违规（§8 红线）。

        本维度原为 `断链检测.py` P-1 独有能力，`check` 对其完全盲（手册 §6 D-8 记为
        已知盲区，导致"只跑 check 就认为验收通过"的漏检）。v5.2.1 并入 check，
        使单跑 `check` 即全覆盖；`断链检测.py` 保留原 P-1 输出以便交叉验证。
        返回 [(level, message)]。
        """
        # v5.2.3：白名单与手册 §0.17 同源的**单一事源**（= 断链检测.py 的
        # ALLOWED_TARGETS，后者以 import 复用同一常量，不再各写字面量）。
        # 主文件以真实 basename 计入（沿用 v5.2.2 P2-5「不硬编码显示名」的口径）。
        allowed = set(sub_files) | set(ALLOWED_EXTRA_TARGETS) | {main_display}
        issues = []
        targets = []
        if main_content is None and os.path.exists(self.main_file):
            main_content = self._read_file(self.main_file)
        # v5.2.3（双审计第二轮 N-6，成立）：用真值判定而非 `is not None`——
        # 主文件不存在时 check 传入的是空串，会往 targets 里塞一条 ('MEMORY.md', '')，
        # 语义上是「主文件不存在却仍参与越界扫描」，虽无副作用但表述不实。
        if main_content:
            targets.append((main_display, main_content))
        targets.extend((sf, sub_contents.get(sf, '')) for sf in sub_files)
        for name, content in targets:
            for i, line in enumerate(content.split('\n'), 1):
                for text, url in MARKDOWN_LINK_PATTERN.findall(line):
                    fn = extract_target_filename(url)
                    if fn is None or fn in allowed:
                        continue
                    issues.append(('error', f"[维度14] {name}:L{i} 越界引用 '{fn}'"
                                            f"（链接文本 '{text[:24]}'）—— 体系外引用非法，"
                                            f"须删除或改为指向已有权威章节（§0.17 / §8）"))
        return issues

    def _build_sub_ref_graph(self, sub_files: list, contents: dict) -> dict:
        """构建「子文件 → 子文件」引用图（v5.2.3：构图口径单一事源）

        仅收 **子↔子** 边：子文件回链主文件（`[→主文件]`）是设计中枢模式（§0.4 / D-2），
        不纳入环图，避免把合法中枢误报为环。只有「子A → 子B → 子A」才是真违规。

        `check`（ERROR 级）与 `validate` 纪律5 共用此构图 + `find_cycles`，
        二者结论必然一致（手册 §6.1 D-8 确立的同源要求）。
        """
        sub_set = set(sub_files)
        graph = {}
        for sf in sub_files:
            refs = set()
            for _, url in MARKDOWN_LINK_PATTERN.findall(contents.get(sf, '')):
                fn = url.split('/')[-1].split('#')[0]
                if fn in sub_set and fn != sf:   # 自环在本体系中无意义，不收
                    refs.add(fn)
            graph[sf] = refs
        return graph

    # ------------------------------------------------------------------------
    # check — 双向完整性检查（v5.0.0: 6 核心维度 + 6 扩展维度 = 12 维度；
    #          v5.2.1: +维度13 主文件必备结构 +维度14 越界引用 = 14 维度）
    # ------------------------------------------------------------------------

    def check(self, verbose: bool = False, fix: bool = False):
        """双向完整性检查
        核心维度（对话敲定 6 项）：
          1. [主↔子] 主文件链接有效性
          2. [主↔子] related 字段有效性
          3. [子↔子] 跨文件链接有效性
          4. [锚点] 锚点存在性（H2/H3/H4）
          5. [悬空] 孤儿引用检测
          6. [重复] 单一事源违反检测
        扩展维度：
          7. [子→主] 子文件回链有效性
          8. [YAML] Front Matter 完整性（8 个必填字段）
          9. [子→主] 回链存在性（C-6）
         10. [YAML] 四要素完整性（v3.3.0，路由卡生成的数据源）
         11. [编号] 编号完整性（v5.0.0，file_number 与 N-M-X-Z 判据见手册 §3.9 ①）
         12. [清单] 主文件引用 ↔ 目录实体双向一致性（v5.0.0，见手册 §5 步骤4 A 段）
         13. [主文件] 必备结构（v5.2.1，§2.1 四组成部分 + 禁止项；含「规则三」强制项）
         14. [越界] 体系外引用（v5.2.1，白名单制 §0.17；原为 断链检测.py P-1 独有，消解 §6 D-8）
        """
        print(f"[INFO] 检查主文件: {self.main_file}")
        print(f"[INFO] 检查子文件目录: {self.sub_files_dir}")

        errors = []
        warnings = []
        broken_links = []  # (filepath, line_index_0based, url) 仅用于 --fix

        sub_files = self._list_sub_files()
        sub_file_set = set(sub_files)

        # 预加载所有子文件内容和锚点（避免重复读取）
        sub_contents = {}
        sub_anchors = {}
        sub_metadata = {}
        for sf in sub_files:
            fp = join_paths(self.sub_files_dir, sf)
            content = self._read_file(fp)
            sub_contents[sf] = content
            sub_anchors[sf] = self._extract_all_headings_for_anchors(content)
            meta, _ = self._parse_yaml_frontmatter(content)
            sub_metadata[sf] = meta

        # ===== 维度 1: [主↔子] 主文件链接有效性 =====
        # v5.2.2（P2-6，成立）：主文件**只读一次**并在后续维度复用——原实现在
        # 维度1 / 12 / 13 / 14 各读一遍，既放大 I/O，也带来「中途被外部改动 →
        # 各维度读到不同内容」的竞态窗口。
        main_exists = os.path.exists(self.main_file)
        main_content = self._read_file(self.main_file) if main_exists else ""
        main_display = os.path.basename(self.main_file)
        if main_exists:
            main_lines = main_content.split('\n')
            for i, line in enumerate(main_lines):
                for text, url in MARKDOWN_LINK_PATTERN.findall(line):
                    # D-1 修复：仅校验指向子记忆文件（文件名以 Memory- 开头）的链接。
                    # 原逻辑用 'Memory-' in url 误命中 Memory-Data 目录名，导致指向本目录内
                    # 非 Memory- 开头文件（如 WorkBuddy记忆文件说明.md）被误报为断链。
                    filename = url.split('/')[-1].split('#')[0]
                    if not is_sub_file_name(filename):   # v5.3.0：大小写不敏感
                        continue
                    if '..' in filename or filename != os.path.basename(filename):
                        continue
                    if filename not in sub_file_set:
                        errors.append(f"[维度1] 主文件断链: {text} -> {url}")
                        broken_links.append((self.main_file, i, url))
            if verbose:
                print("[OK] 维度1 主文件链接检查完成")
        else:
            errors.append("[维度1] 主文件不存在")

        # ===== 维度 2: [主↔子] related 字段有效性 =====
        for sf in sub_files:
            related = normalize_list(sub_metadata[sf].get('related'))
            for r in related:
                if r not in sub_file_set and r != 'MEMORY.md':
                    errors.append(f"[维度2] {sf}: related 引用不存在的文件 '{r}'")
        if verbose:
            print("[OK] 维度2 related 字段有效性检查完成")

        # ===== 维度 3: [子↔子] 跨文件链接有效性 + 维度 4: 锚点存在性 =====
        for sf in sub_files:
            content = sub_contents[sf]
            for i, line in enumerate(content.split('\n')):
                for text, url in MARKDOWN_LINK_PATTERN.findall(line):
                    if not (url.startswith('file:///') or 'Memory-' in url):
                        continue
                    filename = url.split('/')[-1].split('#')[0]
                    if '..' in filename or filename != os.path.basename(filename):
                        continue
                    # 维度3: 文件存在性（v5.2.2 改为白名单内校验，双审计 P1-2 成立项）
                    # 原逻辑「体系外文件只要存在即放行」与手册 §0.17 白名单制直接冲突——
                    # 体系外文件（含 `Memory-Data` 内的过程文档 / .py / .json）即便真实存在
                    # 也属**越界**，不应被判为合法链路。现改为：
                    #   · 白名单内（子文件 ∪ 手册 ∪ 主文件）→ 校验存在性 / 锚点
                    #   · 白名单外 → 一律交维度14 裁决，维度3 不重复定罪
                    if filename not in (sub_file_set | set(ALLOWED_EXTRA_TARGETS)):
                        continue
                    if filename not in sub_file_set:
                        # 白名单内的非子文件（本手册 / 主文件）：路径须真实存在
                        if url.startswith('file:///') and not os.path.exists(
                                url.replace('file:///', '').split('#')[0]):
                            errors.append(f"[维度3] {sf} 断链（白名单目标不存在）: {text} -> {url}")
                            broken_links.append((join_paths(self.sub_files_dir, sf), i, url))
                        continue
                    # 维度4: 锚点存在性（仅检查有锚点的链接）
                    if '#' in url and filename in sub_file_set:
                        anchor = url.split('#', 1)[1]
                        # 去除可能的查询参数
                        anchor = anchor.split('?')[0]
                        if anchor and anchor not in sub_anchors[filename]:
                            errors.append(f"[维度4] {sf} 锚点不存在: {url} (目标文件 {filename} 中无此锚点)")
        if verbose:
            print("[OK] 维度3 跨文件链接 + 维度4 锚点检查完成")

        # ===== 维度 5: [悬空] 孤儿引用检测 =====
        for sf in sub_files:
            content = sub_contents[sf]
            related = normalize_list(sub_metadata[sf].get('related'))
            linked_files = set()
            for _, url in MARKDOWN_LINK_PATTERN.findall(content):
                if 'Memory-' in url:
                    fn = url.split('/')[-1].split('#')[0]
                    if fn in sub_file_set:
                        linked_files.add(fn)
            for lf in linked_files:
                if lf not in related:
                    warnings.append(f"[维度5] {sf}: 正文链接到 '{lf}' 但未在 related 字段中声明（孤儿引用）")
        if verbose:
            print("[OK] 维度5 孤儿引用检查完成")

        # ===== 维度 6: [重复] 单一事源违反检测（段落级内容指纹） =====
        # v5.2.2：与 validate 纪律2 共用 `_find_duplicate_paragraphs`（消除双源）
        paragraph_hashes = self._find_duplicate_paragraphs(sub_files, sub_contents)
        for h, occurrences in paragraph_hashes.items():
            files = set(o[0] for o in occurrences)
            if len(files) > 1:
                detail = '; '.join([f"{o[0]}:{o[1]}" for o in occurrences])
                warnings.append(f"[维度6] 疑似重复内容（单一事源违反）: {detail}")
        if verbose:
            print("[OK] 维度6 单一事源检查完成")

        # ===== 维度 7: [子→主] 子文件回链有效性 =====
        for sf in sub_files:
            content = sub_contents[sf]
            for _, url in MARKDOWN_LINK_PATTERN.findall(content):
                # v5.2.2（P1-5，成立）：原 `'MEMORY.md' in url` 是子串匹配，
                # `MEMORY.md.bak` / `MEMORY.md.old` 之类也会被当成回链纳入校验。
                # 改用精确取文件名判定（与维度14 同一 `extract_target_filename` 口径）。
                if extract_target_filename(url) == 'MEMORY.md' and url.startswith('file:///'):
                    main_path = url.replace('file:///', '').split('#')[0]
                    if not os.path.exists(main_path):
                        errors.append(f"[维度7] {sf} 回链主文件失效: {url}")
        if verbose:
            print("[OK] 维度7 子文件回链检查完成")

        # ===== 维度 8: [YAML] Front Matter 完整性（8 个必填字段） =====
        for sf in sub_files:
            meta = sub_metadata[sf]
            for field in REQUIRED_FRONTMATTER_FIELDS:
                if field not in meta or not meta[field]:
                    warnings.append(f"[维度8] {sf}: 缺少 Front Matter 必填字段 '{field}'")
        if verbose:
            print("[OK] 维度8 YAML 完整性检查完成")

        # ===== 维度 9: [子→主] 回链存在性（C-6，见 §10 第 11 条主↔子豁免） =====
        # 与维度7 互补：维度7 校验「已有回链是否可达」，本维度校验「回链是否存在」。
        # 缺回链不构成断链（故为 WARN 而非 ERROR），但会破坏主↔子双向闭环。
        for sf in sub_files:
            if not self._has_link_to(sub_contents[sf], 'MEMORY.md'):
                warnings.append(
                    f"[维度9] {sf}: 缺少指向主文件的回链，"
                    f"应在文件末尾补 `[→主文件]({self._to_file_url(self.main_file)})`")
        if verbose:
            print("[OK] 维度9 子→主回链存在性检查完成")

        # ===== 维度 10: [YAML] 四要素完整性（v3.3.0） =====
        # 四要素是主文件写前路由卡与手册 §2.2 判据的唯一数据源；缺字段会导致路由卡出现 [待补]，
        # 并使“新信息该放哪”的判定失去依据。故为 WARN 级（不阻断，但必须补齐）。
        for sf in sub_files:
            meta = sub_metadata[sf]
            missing = [f for f in ROUTE_CARD_FIELDS
                       if not str(meta.get(f, '') or '').strip()]
            if missing:
                warnings.append(
                    f"[维度10] {sf}: 缺少四要素字段 {missing}，"
                    f"请在 YAML 补齐（字段语义见手册 §2.2）")
        if verbose:
            print("[OK] 维度10 四要素完整性检查完成")

        # ===== 维度 11: [编号] 编号完整性（v5.0.0，判据见手册 §3.9 ①） =====
        # 与 validate 纪律3 共用 _check_numbering_integrity（单一事源）
        n_errs, n_warns = self._check_numbering_integrity(sub_files, sub_contents, sub_metadata)
        errors.extend(n_errs)
        warnings.extend(n_warns)
        if verbose:
            print(f"[OK] 维度11 编号完整性检查完成（{len(n_errs)} 错误 / {len(n_warns)} 警告）")

        # ===== 维度 12: [清单] 主文件引用 ↔ 目录实体双向一致性（v5.0.0） =====
        if main_exists:
            for level, msg in self._check_manifest_consistency(sub_files, main_content):
                (errors if level == 'error' else warnings).append(msg)
        if verbose:
            print("[OK] 维度12 清单一致性检查完成")

        # ===== 维度 13: [主文件] 必备结构（v5.2.1，手册 §2.1 验收清单） =====
        if main_exists:
            for level, msg in self._check_main_file_structure(main_content, main_display):
                (errors if level == 'error' else warnings).append(msg)
        if verbose:
            print("[OK] 维度13 主文件必备结构检查完成")

        # ===== 维度 14: [越界] 体系外引用（v5.2.1，白名单制，手册 §0.17；消解 §6 D-8 盲区） =====
        for level, msg in self._check_out_of_scope_refs(sub_files, sub_contents,
                                                        main_content, main_display):
            (errors if level == 'error' else warnings).append(msg)
        if verbose:
            print("[OK] 维度14 越界引用检查完成")

        # ===== 循环引用检测（仅子↔子；主文件 MEMORY.md 为中枢，合法回链不算环，见 D-2） =====
        # v5.2.3：构图与判环均收归单一实现（`_build_sub_ref_graph` + `find_cycles`），
        # 与 validate 纪律5 同源，杜绝两份实现漂移。
        graph = self._build_sub_ref_graph(sub_files, sub_contents)
        circular_refs = [f"[循环引用] {' -> '.join(c)}" for c in find_cycles(graph)]

        # 将检测到的循环引用加入错误列表
        for cr in circular_refs:
            errors.append(cr)

        # ===== --fix：v5.2.2 起拒绝执行自动修复（手册 §0.2「严禁盲修」） =====
        # 原实现的两处硬伤（双审计 P0-2 指认，代码复核属实）：
        #   ① 移除链接后若该行变空即 `del lines[idx]` **整行删除**——同行其它链接
        #      与正文一并丢失，且同索引的后续断链不再处理；
        #   ② check 存在已知误报（手册 §6），自动删除会把真实存在的文件误当断链删掉。
        # 手册 §0.2 明令「绝对禁止直接执行 `check --fix`」。故此处**不再做任何写盘**，
        # 改为输出待核清单，交由人工按 §7 纠偏手册处置。
        if fix:
            if broken_links:
                print("\n[REFUSED] 按手册 §0.2「严禁盲修」拒绝自动修复："
                      "check 存在已知误报（§6），自动删除会误删真实文件；"
                      "原逻辑还会整行删除，同行其它内容一并丢失。")
                print("[INFO] 请按 §7 纠偏手册人工处置。待核清单如下"
                      "（**须先 ls 核验目标是否真的不存在**）：")
                for fp, idx, url in broken_links[:20]:
                    print(f"  - {os.path.basename(fp)}:{idx + 1} -> {url[:90]}")
                if len(broken_links) > 20:
                    print(f"  ...（共 {len(broken_links)} 条，已截断显示前 20 条）")
            else:
                print("[INFO] --fix 已按 §0.2 停用（不执行任何自动修改）；"
                      "本次未检出断链，无需处置。")

        # ===== 输出结果 =====
        if errors:
            print(f"\n[ERROR] 检查发现 {len(errors)} 个错误:")
            for err in errors:
                print(f"  ❌ {err}")
        else:
            print("\n[OK] 所有检查通过")
        if warnings:
            print(f"\n[WARN] {len(warnings)} 个警告:")
            for warn in warnings:
                print(f"  ⚠️ {warn}")
        elif verbose:
            print("\n[OK] 无警告")

        return len(errors) == 0

    # ------------------------------------------------------------------------
    # index — 生成/更新索引表（v2.0.0: 全量章节、主索引特殊条目）
    # ------------------------------------------------------------------------

    def _strip_local_index(self, content: str) -> str:
        """移除已有的『本文件速查索引』区块，保证 index 幂等

        v5.2.2（DeepSeek P2-8，成立）：原实现以「沿途每行都必须是 `|` / `>` / 空行」
        为条件推进到结束哨兵——一旦索引区中间夹了一行**普通文本**（如人工备注），
        推进提前终止，`<!-- INDEX_END -->` 哨兵**不被消费而残留**；下次 index 时
        marker 已不在、识别不出旧索引，于是**再插一块**，形成索引叠加。
        现改为**按哨兵定界**：从 marker 起找最近的 `INDEX_END`，整段切除；
        哨兵缺失时退化为「切到第一行不像索引内容的行」。
        """
        marker = '> **本文件速查索引**'
        end_tag = '<!-- INDEX_END -->'
        if marker not in content:
            return content
        lines = content.split('\n')
        out = []
        i = 0
        while i < len(lines):
            if marker in lines[i]:
                end = None
                for j in range(i + 1, len(lines)):
                    if lines[j].strip() == end_tag:
                        end = j
                        break
                if end is None:
                    end = i
                    for j in range(i + 1, len(lines)):
                        s = lines[j]
                        if s.startswith('|') or s.lstrip().startswith('>') or s.strip() == '':
                            end = j
                        else:
                            break
                i = end + 1
                while i < len(lines) and lines[i].strip() == '':
                    i += 1
                continue
            out.append(lines[i])
            i += 1
        return '\n'.join(out)

    def index(self, force: bool = False, target_file: str = None, record: bool = True):
        """生成/更新索引表
        force=True 时强制重新生成（即使检测到无变化）
        record=False 供内部调用（rewrite/sync/remove/add）使用，避免 changelog 刷屏
        """
        # v5.2.2（P0 修复，豆包/DeepSeek 双审计确认）：
        # `--file X` 的语义是「只刷新 X 的头部速查索引」，**不是**「主索引只留 X 一条」。
        # 原实现把收窄后的列表一路传进 _generate_main_index / _generate_route_card，
        # 而这两个函数按哨兵**整区替换**——于是执行 `index --file "Memory-x.md"`
        # 会把主文件表②主索引与表①写前路由卡整体重写为仅剩 X 一条，其余子文件条目
        # 全部丢失（数据破坏级）。现拆成两个列表：target_list 用于刷新头部索引，
        # all_sub_files 用于生成两个工具写入区。
        all_sub_files = self._list_sub_files()
        if target_file:
            if target_file not in all_sub_files:
                print(f"[ERROR] 指定文件不存在于子文件目录: {target_file}")
                return
            target_list = [target_file]
        else:
            target_list = all_sub_files
        if not all_sub_files:
            print("[WARN] 未找到任何子文件")
            return

        for sub_file in target_list:
            filepath = join_paths(self.sub_files_dir, sub_file)
            content = self._read_file(filepath)
            metadata, _ = self._parse_yaml_frontmatter(content)
            chapters = self._extract_chapters(content)

            # 生成子文件头部速查索引表（精确到 H3 级别）
            index_lines = [
                "> **本文件速查索引**（按章节顺序排列）",
                "> 精确定位到 ### 级别，避免全文加载。",
                "",
                "| 适用场景 | 章节位置 | 备注 |",
                "|---------|---------|------|"
            ]
            for chapter in chapters:
                scene = chapter['title'][:30] + "..." if len(chapter['title']) > 30 else chapter['title']
                index_lines.append(f"| {scene} | `{chapter['heading']}` |  |")
            index_table = '\n'.join(index_lines)
            index_block = index_table + '\n<!-- INDEX_END -->'

            # 先剥离已有索引表，保证幂等
            content = self._strip_local_index(content)

            # 在 Front Matter 之后插入索引表
            if content.startswith('---'):
                fm_close = content.find('\n---', 3)
                if fm_close >= 0:
                    insert_at = fm_close + 4
                    new_content = content[:insert_at] + '\n' + index_block + content[insert_at:]
                else:
                    new_content = f"{index_block}{content}"
            else:
                new_content = f"{index_block}\n{content}"

            self._write_file(filepath, new_content)

            # 基于写入后的内容重新计算章节行号
            chapters = self._extract_chapters(new_content)
            self._update_chapter_offsets(sub_file, chapters)

            # 更新状态中的子文件元数据（v2.0.0: 同步 YAML 元数据）
            found = False
            for sf in self.state['sub_files']:
                if sf['filename'] == sub_file:
                    sf['chapters'] = chapters
                    sf['lines_total'] = len(new_content.split('\n'))
                    sf['display_name'] = metadata.get('title', sub_file)
                    sf['tags'] = normalize_list(metadata.get('tags'))
                    sf['related'] = normalize_list(metadata.get('related'))
                    found = True
                    break
            if not found:
                self.state['sub_files'].append({
                    'filename': sub_file,
                    'display_name': metadata.get('title', sub_file),
                    'chapters': chapters,
                    'lines_total': len(new_content.split('\n')),
                    'tags': normalize_list(metadata.get('tags')),
                    'related': normalize_list(metadata.get('related'))
                })

        # v5.2.2：两个工具写入区恒按全量生成（见上方 P0 修复说明）
        self._generate_main_index(all_sub_files)
        self._generate_route_card(all_sub_files)
        self._save_state()
        if record:
            self._add_changelog_entry('index', target_file or '(全部)', 'agent', '更新索引表 + 写前路由卡')
        print(f"[OK] 索引表已更新（刷新头部索引 {len(target_list)} 个 / 主索引与路由卡按全量 "
              f"{len(all_sub_files)} 个子文件生成）")

    def _generate_main_index(self, sub_files: list):
        """生成主文件索引表（v2.0.0: 全量章节 + 特殊条目）
        特殊条目：
        - 对 Memory-GitHub全流程操作.md 头部二级索引的指向
        - 高频使用的 GitHub 纪律/工作流独立索引
        """
        # v5.1.0: 纯定位表——删除原「适用场景」列（其值长期等于文件名，为无效触发词），
        # 本表只回答"某文件的章节在哪"；读前精判改由表① ROUTE_CARD 的 scope_in 承担。
        lines = [
            "| 目标文件 | 章节位置 | 备注 |",
            "|---------|---------|------|"
        ]

        large_files = []
        for sub_file in sub_files:
            filepath = join_paths(self.sub_files_dir, sub_file)
            content = self._read_file(filepath)
            chapters = self._extract_chapters(content)
            # 显示全部 H2 章节（章节级定位，配合子文件头部速查索引的 H3 构成两级定位）
            h2_chapters = [ch for ch in chapters if ch['level'] == 2]
            sections_text = ' '.join([f'`{ch["heading"]}`' for ch in h2_chapters])
            file_url = self._to_file_url(filepath)
            lines.append(f"| [{sub_file}]({file_url}) | {sections_text} |  |")
            if len(content.split('\n')) >= LARGE_FILE_INDEX_THRESHOLD:
                large_files.append((sub_file, filepath))

        # 特殊条目: 对超大文件头部二级索引的降级指向
        # （v5.1.0: 删除原「高频关键词独立索引」条目组——其场景词已含于对应 H2 标题内，
        #   由全量 H2 语义匹配即可命中，保留即为冗余）
        # v5.2.2（P1-4，成立）：原实现硬编码文件名 `Memory-GitHub全流程操作.md`，
        # 与 v5.0.0「零硬编码文件名、工具动态发现」的声明自相矛盾；该文件一旦更名或
        # 删除，降级指向即静默失效。改为按**规模阈值**判定（零硬编码、随文件增减自适应）。
        for sub_file, filepath in large_files:
            file_url = self._to_file_url(filepath)
            lines.append(
                f"| [{sub_file}]({file_url}) | `[文件头部速查索引表]` | 大文件二次索引，详见文件内 |"
            )

        new_index = '\n'.join(lines)
        new_block = f"{MAIN_INDEX_START_TAG}\n{new_index}\n{MAIN_INDEX_END_TAG}\n"

        main_content = self._read_file(self.main_file) if os.path.exists(self.main_file) else ""
        start_tag = MAIN_INDEX_START_TAG
        end_tag = MAIN_INDEX_END_TAG
        idx_start = main_content.find(start_tag)

        if idx_start >= 0:
            idx_end = main_content.find(end_tag, idx_start)
            if idx_end >= 0:
                end_pos = idx_end + len(end_tag)
                if end_pos < len(main_content) and main_content[end_pos] == '\n':
                    end_pos += 1
                main_content = main_content[:idx_start] + new_block + main_content[end_pos:]
                self._write_file(self.main_file, main_content)
                return

        # 兼容旧格式（无哨兵）
        legacy = main_content.find('| 适用场景 | 目标文件 | 章节位置 | 备注 |')
        if legacy >= 0:
            after = main_content[legacy:].split('\n')
            consumed = 0
            for i, line in enumerate(after):
                if i == 0 or line.startswith('|') or line.strip() == '':
                    consumed += len(line) + 1
                else:
                    break
            end_pos = legacy + consumed
            main_content = main_content[:legacy] + new_block + main_content[end_pos:]
            self._write_file(self.main_file, main_content)
            return

        # 主文件尚无索引表：插入新段
        if main_content.startswith('#'):
            nl = main_content.find('\n')
            insert_at = nl + 1 if nl > 0 else 0
            main_content = (main_content[:insert_at]
                            + '\n## 速查索引表\n\n' + new_block + main_content[insert_at:])
        else:
            main_content = f"## 速查索引表\n\n{new_block}{main_content}"
        self._write_file(self.main_file, main_content)

    # ------------------------------------------------------------------------
    # v3.3.0：写前路由卡 —— 由子文件 YAML 四要素生成，消除手册/主文件手工同步
    # ------------------------------------------------------------------------

    def _build_route_card_block(self, sub_files: list) -> tuple:
        """从子文件 YAML 四要素构建主文件「写前路由卡」区块

        返回 (block_text, quality)：
        - block_text: 含 ROUTE_CARD 哨兵的完整 Markdown 区块
        - quality: {filename: [缺失字段, ...]}，供 check 维度 10 与调用方复用
        """
        rows = []
        quality = {}
        for sub_file in sub_files:
            filepath = join_paths(self.sub_files_dir, sub_file)
            content = self._read_file(filepath)
            metadata, _ = self._parse_yaml_frontmatter(content)
            display = metadata.get('title', sub_file.replace('Memory-', '').replace('.md', ''))
            file_url = self._to_file_url(filepath)
            cells = []
            missing = []
            for field in ROUTE_CARD_FIELDS:
                val = metadata.get(field)
                if isinstance(val, list):
                    val = ' / '.join([str(v) for v in val])
                val = ('' if val is None else str(val)).strip()
                if not val:
                    missing.append(field)
                    val = ROUTE_CARD_MISSING_PLACEHOLDER
                # 单元格内竖线 / 换行会破坏 Markdown 表格结构，做转义
                cells.append(val.replace('|', '\\|').replace('\n', ' '))
            quality[sub_file] = missing
            rows.append(f"| [{display}]({file_url}) | " + ' | '.join(cells) + " |")

        header = "| 子文件 | " + " | ".join(ROUTE_CARD_FIELD_LABELS[f] for f in ROUTE_CARD_FIELDS) + " |"
        sep = "|" + "---|" * (len(ROUTE_CARD_FIELDS) + 1)
        table = '\n'.join([header, sep] + rows)

        block = '\n'.join([
            ROUTE_CARD_START_TAG,
            "## 子记忆文件定位与收录范围（写前路由 · 入库判定用）",
            "",
            "> **用途**：新信息入库前，先按本表「收录（in-scope）」列锁定目标子文件——"
            "命中 1 个 → 并入该文件（再按该文件头部速查索引定位章节）；"
            "命中 0 个 → 按《WorkBuddy记忆文件说明.md》§3.8 第 3 步评估新建；"
            "命中 ≥2 个或无法唯一判定 → 暂停并询问用户，不得自行裁决。",
            "> **权威定义源**：各子文件 YAML Front Matter 的 `positioning` / `role` / `theme` / "
            "`scope_in` / `scope_out` 五个字段（就近维护——改四要素只改子文件 YAML）。"
            "本卡是 `memory-mgr.py index` 自动生成的**派生视图**，**禁止手工编辑本区**。",
            "> **易混边界的裁决规则**：见该手册 §2.2 末「边界判据（易混项裁决）」。",
            "",
            table,
            ROUTE_CARD_END_TAG,
            "",
        ])
        return block, quality

    def _remove_legacy_route_card(self, main_content: str) -> tuple:
        """移除 v3.2.x 及以前的手工路由卡区（用于一次性迁移，幂等）

        仅在 ROUTE_CARD 哨兵尚未出现时生效；删除范围 = 手工标题所在行 → MAIN_INDEX 起点。
        返回 (新内容, 是否发生删除)。
        """
        if ROUTE_CARD_START_TAG in main_content:
            return main_content, False
        heading = '## 子记忆文件定位与收录范围'
        idx = main_content.find(heading)
        if idx < 0:
            return main_content, False
        anchor = main_content.find('<!-- MAIN_INDEX_START -->')
        if anchor < 0 or anchor <= idx:
            return main_content, False
        line_start = main_content.rfind('\n', 0, idx) + 1
        return main_content[:line_start] + main_content[anchor:], True

    def _replace_main_block(self, main_content: str, block: str,
                            start_tag: str, end_tag: str) -> str:
        """按哨兵替换主文件区块；尚无哨兵时插入到 MAIN_INDEX 区之前"""
        idx_start = main_content.find(start_tag)
        if idx_start >= 0:
            idx_end = main_content.find(end_tag, idx_start)
            if idx_end >= 0:
                end_pos = idx_end + len(end_tag)
                if end_pos < len(main_content) and main_content[end_pos] == '\n':
                    end_pos += 1
                return main_content[:idx_start] + block + main_content[end_pos:]
        anchor = main_content.find('<!-- MAIN_INDEX_START -->')
        if anchor < 0:
            m = re.search(r'^##\s+', main_content, re.MULTILINE)
            anchor = m.start() if m else 0
        return main_content[:anchor] + block + main_content[anchor:]

    def _generate_route_card(self, sub_files: list, verbose: bool = True) -> dict:
        """生成 / 更新主文件「写前路由卡」（v3.3.0 新增）

        数据源：各子文件 YAML 的 ROUTE_CARD_FIELDS 字段。
        返回 quality 字典（{filename: [缺失字段]}），供 check 维度 10 复用。
        """
        block, quality = self._build_route_card_block(sub_files)
        if not os.path.exists(self.main_file):
            if verbose:
                print(f"[WARN] 主文件不存在，跳过路由卡生成: {self.main_file}")
            return quality
        main_content = self._read_file(self.main_file)
        main_content, removed = self._remove_legacy_route_card(main_content)
        new_content = self._replace_main_block(
            main_content, block, ROUTE_CARD_START_TAG, ROUTE_CARD_END_TAG)
        if new_content != self._read_file(self.main_file):
            self._write_file(self.main_file, new_content)
        if verbose:
            print(f"[OK] 写前路由卡已更新（{len(sub_files)} 个子文件，数据源：子文件 YAML 四要素）")
            if removed:
                print("[OK] 已移除原有的手工路由卡区（改由 YAML 四要素生成，手工同步成本归零）")
            for fn, fields in quality.items():
                if fields:
                    print(f"[WARN] {fn}: 四要素字段缺失 {fields}"
                          f"（路由卡该单元格显示为 {ROUTE_CARD_MISSING_PLACEHOLDER}）")
        return quality

    # ------------------------------------------------------------------------
    # add — 创建新子文件（v2.0.0: 创建后自动 check）
    # ------------------------------------------------------------------------

    def add(self, topic: str, content: str = None, start_number: int = None,
            related: str = None, tags: str = None, dry_run: bool = False,
            title: str = None, summary: str = None,
            positioning: str = None, role: str = None, theme: str = None,
            scope_in: str = None, scope_out: str = None):
        """创建新子文件"""
        if not topic:
            print("[ERROR] 必须提供 --topic 参数")
            return False
        # 路径遍历防护
        safe_topic = os.path.basename(topic)
        if safe_topic != topic or '..' in topic or topic.strip() == '':
            print(f"[ERROR] 非法主题名（含路径分隔符或 ..）: {topic}")
            return False

        filename = f"Memory-{topic}.md"
        filepath = join_paths(self.sub_files_dir, filename)
        if os.path.exists(filepath):
            print(f"[ERROR] 文件已存在: {filepath}")
            return False
        if content is None:
            print("[ERROR] 必须提供 --content 参数")
            return False

        # v2.0.0: 仅当内容不含实际换行时才替换字面 \n（避免破坏文件内容）
        if '\\n' in content and '\n' not in content:
            content = content.replace('\\n', '\n')

        if start_number is not None:
            # v5.2.2（双审计 P1-7，成立）：手册 §0.12 明令 `file_number` 由 `add`
            # 自动分配（取当前最大 N + 1）、禁止手工指定。该参数存在即为绕过后门。
            print("[ERROR] --start-number 已停用：手册 §0.12 规定 `file_number` 由 `add` "
                  "自动分配（当前最大 N + 1），禁止手工指定。请移除该参数后重试。")
            return False
        # v5.2.2（双审计 P1-6，成立）：以**磁盘真实 YAML** 为准取最大 N，不再只信 state。
        # 原实现仅读 state 缓存，而 state 的 file_number 由 rewrite 在「内容确有变更」时
        # 才回写——新建文件若内容已是目标编号形态则不回写，下次 add 的 max_fn 偏小，
        # 会分配出**重复 file_number**，触发维度11 编号冲突、编号体系崩坏。
        max_fn = 0
        for sf in self._list_sub_files():
            try:
                fn = int(str(self._parse_yaml_frontmatter(
                    self._read_file(join_paths(self.sub_files_dir, sf)))[0].get('file_number')).strip())
            # v5.2.3（双审计第二轮 N-1，成立）：原只捕 (TypeError, ValueError)（对应
            # `int(str(None))`）；既有子文件若因权限 / 编码 / 竞态抛 OSError /
            # UnicodeDecodeError，会直接冒泡**中断 add**——而 add 的语义是「创建新文件」，
            # 不应被既有文件的读取失败拖垮。拓宽后逐个跳过、继续取最大值。
            except (TypeError, ValueError, OSError, UnicodeDecodeError) as e:
                print(f"[WARN] 读取既有子文件 {sf} 失败，跳过其 file_number（{type(e).__name__}）")
                continue
            max_fn = max(max_fn, fn)
        start_number = max_fn + 1

        now = datetime.now(timezone.utc).isoformat()
        # C-2: tags 判空——区分「未传参」与「传了但解析为空」两种情形：
        #   ① 未传参（tags is None）：自动补默认标签，避免新建文件必然违反纪律11（标签有效）；
        #   ② 传参但解析为空：视为参数格式错误，直接报错而非静默填空。
        if tags is None:
            tags_list = [topic, '记忆']
            print(f"[INFO] 未提供 --tags，已自动补默认标签: {', '.join(tags_list)}")
        else:
            tags_list = normalize_list(tags)
            if not tags_list:
                print("[ERROR] --tags 已提供但解析后为空，请检查参数格式（逗号分隔，如 --tags \"a,b\"）")
                return False
        # 若无 related 则默认回链主文件，避免纪律6报错
        related_list = normalize_list(related) or ['MEMORY.md']

        # C-3: 剥离与 title 重复的冗余 H1（篇级 H1 如「# 第N篇：xxx」保留）
        content = self._strip_redundant_h1(content, title or topic)
        # C-1: 正文缺失子→主回链时自动补全（中枢模式，见 §10 第 11 条主↔子豁免）
        content = self._ensure_main_backlink(content)

        # 构建 YAML（related 多行列表；v3.3.0 起含四要素，作为主文件写前路由卡的数据源）
        meta = {
            'title': title or topic,
            'topic': topic,
            'tags': tags_list,
            'related': related_list,
            'scope': '永久记忆',
            'created': now,
            'updated': now,
            'parent': 'MEMORY.md',
        }
        # v3.3.0: 四要素（手册 §2.2 字段规范 / §3.8 新建前置要求）
        four_elements = {
            'positioning': positioning,
            'role': role,
            'theme': theme,
            'scope_in': scope_in,
            'scope_out': scope_out,
        }
        missing_four = [k for k, v in four_elements.items() if not str(v or '').strip()]
        for k, v in four_elements.items():
            if str(v or '').strip():
                meta[k] = str(v).strip()
        # 修复：--summary 原为「声明了但未写入 YAML」的空转参数
        if summary:
            meta['summary'] = summary
        if missing_four:
            print(f"[WARN] 四要素未全部提供，缺失: {missing_four}")
            print(f"[WARN] 新建子文件须先定义四要素（手册 §3.8 第 3 步），"
                  f"否则主文件写前路由卡对应单元格将显示为 {ROUTE_CARD_MISSING_PLACEHOLDER}")
        # v5.0.0：将自动分配的 N 写入 YAML file_number（否则 rewrite() 会因缺 file_number 报错中止）
        meta['file_number'] = start_number

        yaml_block = self._build_yaml_frontmatter(meta)

        full_content = yaml_block + content

        if dry_run:
            print(f"[DRY-RUN] 将创建文件: {filepath}")
            print(f"[DRY-RUN] 起始编号: {start_number}")
            print(f"[DRY-RUN] YAML:\n{yaml_block}")
            return True

        # v5.2.4（Round1 B-2，P1，已实测复现）：原实现丢弃返回值，写入失败后仍继续
        # 写 state / changelog、仍调用 rewrite、仍打印「[OK] 已创建子文件」并 return True
        # —— 磁盘未变而状态已变，且向调用方谎报成功（退出码 0）。写入失败即中止并回滚。
        if not self._write_file(filepath, full_content, backup=False):  # 新文件无需备份
            print(f"[ERROR] 创建子文件失败（写入未成功），已中止，不写状态/变更记录: {filepath}")
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)   # 清理可能的半截文件
            except OSError:
                pass
            return False
        chapters = self._extract_chapters(full_content)
        h2_count = len([c for c in chapters if c['level'] == 2])
        end_number = start_number + max(h2_count, 1) - 1

        # v5.2.2（双审计 P1-1，成立）：state 记录须直接带 `file_number`。
        # 原记录只有 start_number / end_number（旧跨文件连续体系遗留），而后续取最大 N
        # 时查的是 file_number → 新建文件的 N 在 state 中永久缺失。
        self.state['sub_files'].append({
            'filename': filename,
            'display_name': topic,
            'file_number': start_number,
            'start_number': start_number,
            'end_number': end_number,
            'chapters': chapters,
            'lines_total': len(full_content.split('\n')),
            'tags': tags_list,
            'related': related_list
        })
        self._update_chapter_offsets(filename, chapters)
        self._save_state()
        self._add_changelog_entry('add', filename, 'agent', f'新增子文件: {topic}',
                                  {'start_number': start_number, 'end_number': end_number})
        # v5.0.0：新增后调用 rewrite() 按各文件 YAML 的 file_number 重建 N-M-X-Z 编号
        # （新文件已写入 file_number = start_number，rewrite 内含 index(record=False) + 跨文件/同文件锚点同步）
        self.rewrite()
        # v2.0.0: 创建后自动检查（验证无循环引用、无断链）
        print("[INFO] 创建完成，运行完整性检查...")
        self.check(verbose=False)
        print(f"[OK] 已创建子文件: {filename} (编号 {start_number}-{end_number})")
        return True

    # ------------------------------------------------------------------------
    # remove — 删除子文件（v2.0.0: .bak备份、清理related、删除后check）
    # ------------------------------------------------------------------------

    def remove(self, filename: str, force: bool = False, dry_run: bool = False):
        """删除子文件（含引用清理、related 字段同步、重新编号、完整性检查）"""
        # 路径遍历防护
        try:
            safe_filename = self._safe_filename(filename)
        except ValueError as e:
            print(f"[ERROR] {e}")
            return False

        # v5.2.4（Round1 B-1，P1 安全缺陷，已实测复现）：删除目标**白名单**。
        # 原实现的 `_safe_filename` 只做 basename 净化与 '..' 检查，不校验是否属于
        # 本体系子记忆文件——实测 `remove --file memory-mgr.py --force` 会删掉工具自身，
        # `remove --file WorkBuddy记忆文件说明.md --force` 会删掉手册，二者均属 §0.17 /
        # §8 明令保护的体系资产。现限定：只允许删除 `Memory-*.md` 且确在当前子文件集合中者。
        if not is_sub_file_name(safe_filename):      # v5.3.0：大小写不敏感
            print(f"[ERROR] 拒绝删除：'{safe_filename}' 不是子记忆文件（须 Memory-*.md）。"
                  f"工具脚本 / 手册 / 状态文件不在可删范围（手册 §0.17 / §8）。")
            return False
        if safe_filename not in self._list_sub_files():
            print(f"[ERROR] 拒绝删除：'{safe_filename}' 不在当前子文件集合中"
                  f"（可能已被删除或位于其它目录）。")
            return False

        filepath = join_paths(self.sub_files_dir, safe_filename)
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filepath}")
            return False

        # 检测引用
        references = []
        main_content = self._read_file(self.main_file) if os.path.exists(self.main_file) else ""
        if self._has_link_to(main_content, safe_filename):
            references.append(('主文件', self.main_file))
        for other_file in self._list_sub_files():
            if other_file != safe_filename:
                other_path = join_paths(self.sub_files_dir, other_file)
                other_content = self._read_file(other_path)
                if self._has_link_to(other_content, safe_filename):
                    references.append((other_file, other_path))

        if references and not force:
            print(f"[WARN] 以下文件引用了 {safe_filename}:")
            for ref_file, _ in references:
                print(f"  - {ref_file}")
            # 交互式确认（非 TTY / Agent 自动化场景自动跳过）
            if sys.stdin.isatty():
                confirm = input(f"确认删除 {safe_filename}？(y/N): ").strip().lower()
                if confirm not in ('y', 'yes'):
                    print("[INFO] 已取消删除")
                    return False
            else:
                print("使用 --force 跳过确认（非交互模式下必须显式指定）")
                return False

        if dry_run:
            print(f"[DRY-RUN] 将删除文件: {filepath}")
            print(f"[DRY-RUN] 受影响引用: {len(references)} 个")
            for ref_file, _ in references:
                print(f"  - {ref_file}")
            return True

        # v2.0.0: 删除前创建 .bak 备份（v5.2.2：备份失败即放弃删除，见 §0.3 备份优先）
        if not self._backup_file(filepath):
            print(f"[ERROR] 删除前备份失败，已放弃删除（手册 §0.3 备份优先）: {filepath}")
            return False
        os.remove(filepath)

        # v5.2.2（P1-3 的成立部分）：原实现命中即 `continue` **整行丢弃**——
        # 若一行含多个链接（其中一个指向待删文件），同行其它链接与正文一并丢失。
        # 现改为只移除「指向该文件的链接 token」，保留行内其余内容。
        # 另加边界：文件名后必须是 `#锚点` 或 `)`，避免 `Memory-A.md.bak` 之类误命中。
        link_to_target = re.compile(
            rf'\[[^\]]*\]\([^)]*{re.escape(safe_filename)}(?:#[^)]*)?\)')
        bare_url = re.compile(
            rf'file:///[^)\s]*{re.escape(safe_filename)}(?:#[^)\s]*)?')

        def _purge(text: str) -> str:
            return bare_url.sub('', link_to_target.sub('', text))

        # 清理主文件中的链接
        if safe_filename in main_content:
            new_main = '\n'.join(_purge(line) for line in main_content.split('\n'))
            if new_main != main_content:
                self._write_file(self.main_file, new_main)

        # 清理其他子文件中的链接 + v2.0.0: 清理 related 字段
        for other_file in self._list_sub_files():
            other_path = join_paths(self.sub_files_dir, other_file)
            other_content = self._read_file(other_path)
            modified = False

            # 清理正文链接（v5.2.2：同上，只删链接 token，不整行丢弃）
            if safe_filename in other_content:
                purged = '\n'.join(_purge(line) for line in other_content.split('\n'))
                if purged != other_content:
                    other_content = purged
                    modified = True

            # v2.0.0: 清理 YAML related 字段中的引用
            meta, body = self._parse_yaml_frontmatter(other_content)
            related = normalize_list(meta.get('related'))
            if safe_filename in related:
                meta['related'] = [r for r in related if r != safe_filename]
                other_content = self._build_yaml_frontmatter(meta) + body
                modified = True

            if modified:
                self._write_file(other_path, other_content)

        # 更新状态
        self.state['sub_files'] = [sf for sf in self.state['sub_files']
                                   if sf['filename'] != safe_filename]
        if safe_filename in self.state.get('chapter_offsets', {}):
            del self.state['chapter_offsets'][safe_filename]
        self._save_state()
        self._add_changelog_entry('remove', safe_filename, 'agent', f'删除子文件: {safe_filename}')

        # 重新编号 + 更新索引（rewrite 末尾已调用 index，避免重复）
        self.rewrite()

        # v2.0.0: 删除后自动检查（验证无悬空链接）
        print("[INFO] 删除完成，运行完整性检查...")
        self.check(verbose=False)
        print(f"[OK] 已删除子文件: {safe_filename}")
        return True

    # ------------------------------------------------------------------------
    # rewrite — 以 file_number 重建 N-M-X-Z 编号（v5.0.0）
    # ------------------------------------------------------------------------

    def _collect_headings_for_anchor(self, content: str) -> list:
        """收集 H2 / H3 / H4 标题的 (完整行, 去编号标题) 列表（v5.0.0：含 H4）

        供 rewrite 前后做锚点映射；**列表顺序 = 文件内出现顺序**，新旧按位置一一对应。

        v5.2.1（P0 缺陷修复）：
          原实现按 `全部 H2 → 全部 H3 → 全部 H4` 分组收集，列表顺序 ≠ 文件内出现顺序，
          与上述契约自相矛盾。后果：一旦插章使新旧标题集合发生位移，按位置 zip 配对
          即产生「错配」（例如旧 `### 2-1-1 A子节` 被配到新 `## 2-3 新章`），
          `_sync_cross_file_anchors` 会据此把跨文件锚点改写为错误目标 —— 表现为主文件
          与子文件间的链接跳错位置，即用户所见的「章节丢失 / 断链」。
          现改为**单遍扫描、按文档顺序收集**（并跳过代码围栏内的行，与
          `_renumber_content` 口径一致），从根源消除错配。
        """
        # v5.2.2（消除重复实现）：与 `_scan_headings_ordered` 是同一套逻辑的两份拷贝，
        # 现收敛为单一实现——本方法只做元组形态适配（(完整行, 去编号标题)）。
        return [(full, title) for _lvl, full, title in self._scan_headings_ordered(content)]

    def _renumber_content(self, content: str, n: int) -> str:
        """按 `N-M-X-Z` 重建标题编号（v5.0.0，纯函数、无副作用）

          H2 → `## N-M 标题`        M 本文件内从 1 连续
          H3 → `### N-M-X 标题`     X 所属 H2 内从 1 连续
          H4 → `#### N-M-X-Z 标题`  Z 所属 H3 内从 1 连续

        · 新编号一律由 strip_heading_number 剥净旧号后重写 → 对新旧体系均幂等
        · 代码围栏（``` / ~~~）内的行不参与重编号，避免误改代码注释
        · 孤立 H3 / H4（无对应父级）保持原样，交由 check 维度11 报错（不静默吞掉）
        """
        h2_re = re.compile(r'^##(?!#)\s+(.+)$')
        h3_re = re.compile(r'^###(?!#)\s+(.+)$')
        h4_re = re.compile(r'^####(?!#)\s+(.+)$')
        fence_re = re.compile(r'^\s*(```|~~~)')

        out_lines = []
        m_cnt = x_cnt = z_cnt = 0
        in_fence = False
        for line in content.split('\n'):
            if fence_re.match(line):
                in_fence = not in_fence
                out_lines.append(line)
                continue
            if in_fence:
                out_lines.append(line)
                continue
            m2 = h2_re.match(line)
            if m2:
                m_cnt += 1
                x_cnt = z_cnt = 0
                out_lines.append(f'## {n}-{m_cnt} ' + strip_heading_number(m2.group(1).strip()))
                continue
            if m_cnt == 0:      # 首个 H2 之前的行：无 N-M 可挂，保持原样
                out_lines.append(line)
                continue
            m3 = h3_re.match(line)
            if m3:
                x_cnt += 1
                z_cnt = 0
                out_lines.append(f'### {n}-{m_cnt}-{x_cnt} ' + strip_heading_number(m3.group(1).strip()))
                continue
            m4 = h4_re.match(line)
            if m4:
                if x_cnt == 0:  # 孤立 H4（无父 H3）→ 原样保留，交 check 维度11 报错
                    out_lines.append(line)
                    continue
                z_cnt += 1
                out_lines.append(f'#### {n}-{m_cnt}-{x_cnt}-{z_cnt} ' + strip_heading_number(m4.group(1).strip()))
                continue
            out_lines.append(line)
        return '\n'.join(out_lines)

    def rewrite(self, target_file: str = None, dry_run: bool = False):
        """以各文件 YAML 的 `file_number` 为准重建 `N-M-X-Z` 编号（v5.0.0）

        规则见手册 §2.3：
          H2 → `## N-M 标题`        H3 → `### N-M-X 标题`     H4 → `#### N-M-X-Z 标题`
        · N 取自 YAML `file_number`（缺失即报错退出，不猜、不硬编码文件名）
        · 分隔符一律连字符 `-`（点号会被 GFM 锚点规则删除 → §2.3 ③）
        · 重编号后自动同步跨文件与同文件锚点，并重建索引
        """
        sub_files = self._list_sub_files()
        if target_file:
            if target_file not in sub_files:
                print(f"[ERROR] 指定文件不在状态中: {target_file}")
                return
            sub_files = [target_file]
        if not sub_files:
            print("[INFO] 没有子文件需要重新编号")
            return

        # 1) 读入各文件 file_number（缺失即中止，禁止猜测顺序）
        plan, missing = [], []
        for sf in sub_files:
            content = self._read_file(join_paths(self.sub_files_dir, sf))
            meta, _ = self._parse_yaml_frontmatter(content)
            try:
                n = int(str(meta.get('file_number')).strip())
            except (TypeError, ValueError):
                missing.append(sf)
                continue
            plan.append((sf, n, content))
        if missing:
            print("[ERROR] 以下子文件缺少合法 `file_number`（须先跑 `number --init` 补齐）："
                  + ", ".join(missing))
            return

        # 2) 重编号前记录旧标题映射（H2/H3/H4，用于锚点同步）
        old_headings_map = {sf: self._collect_headings_for_anchor(c) for sf, _, c in plan}

        # 3) 逐文件重编号（预览或写盘）
        changed = 0
        write_failed = []   # v5.2.4（B-2）：记录写入失败的文件，末尾汇总告警
        for sf, n, content in plan:
            new_content = self._renumber_content(content, n)
            if new_content == content:
                if dry_run:
                    print(f"[SKIP] {sf}: 编号已是目标形态（file_number = {n}）")
                continue
            changed += 1
            filepath = join_paths(self.sub_files_dir, sf)
            if dry_run:
                print(f"\n{'=' * 68}\n[DRY-RUN] {sf}  (file_number = {n})\n{'=' * 68}")
                old_h = self._collect_headings_for_anchor(content)
                new_h = self._collect_headings_for_anchor(new_content)
                if len(old_h) != len(new_h) or [t for _, t in old_h] != [t for _, t in new_h]:
                    # v5.2.1（P0）：标题数量或文本序列不一致 = 重编号改变了章节结构，
                    # 此时按位置配对不可信，只告警、不做逐条对照打印，避免输出误导性 diff。
                    print(f"[WARN] {sf}: 重编号前后标题序列不一致 "
                          f"({len(old_h)} -> {len(new_h)})，请人工复核；已跳过逐条 diff")
                    for oh, _ in old_h:
                        print(f"  - {oh}")
                    for nh, _ in new_h:
                        print(f"  + {nh}")
                    continue
                for (oh, _ot), (nh, _nt) in zip(old_h, new_h):
                    if oh != nh:
                        print(f"  - {oh}")
                        print(f"  + {nh}")
                continue
            # v5.2.4（Round1 B-2，P1）：写入失败即跳过该文件的状态更新，避免
            # 「磁盘未变而 state 已变」。rewrite 是批量重编号，单点失败不中断整批，
            # 但必须记账并在末尾汇总告警。
            if not self._write_file(filepath, new_content):
                write_failed.append(sf)
                print(f"[ERROR] {sf}: 重编号写入失败，已跳过其状态更新（磁盘内容未变）")
                continue
            chapters = self._extract_chapters(new_content)
            self._update_chapter_offsets(sf, chapters)
            for rec in self.state.get('sub_files', []):
                if rec.get('filename') == sf:
                    rec['chapters'] = chapters
                    rec['file_number'] = n
                    break

        if dry_run:
            print(f"\n[DRY-RUN] 预览完成：{changed} 个文件待重编号（未写盘）")
            return

        # 4) 同步锚点（跨文件 + 同文件），并重建索引
        self._sync_cross_file_anchors(old_headings_map, [sf for sf, _, _ in plan])

        self._save_state()
        self.index(record=False)
        self._add_changelog_entry('rewrite', '(全部)', 'agent',
                                  '按 file_number 重建 N-M-X-Z 编号（跨文件 + 同文件锚点已同步）')
        if write_failed:
            print(f"[WARN] rewrite 完成，但 {len(write_failed)} 个文件写入失败、未重编号："
                  f"{', '.join(write_failed)}——须排查磁盘 / 权限后重跑（其 state 未更新，磁盘内容未变）")
        print(f"[OK] 章节编号已按 N-M-X-Z 重建（{len(plan)} 个子文件，{changed} 个实际变更），锚点已同步")

    def _sync_cross_file_anchors(self, old_headings_map: dict, changed_files: list):
        """重编号后同步更新跨文件链接中的锚点
        逻辑：对每个被重编号的文件，构建 old_anchor -> new_anchor 映射，
        然后在所有其他文件中查找指向该文件的链接并更新锚点。
        """
        # 构建每个文件的新标题映射（H2/H3/H4，与 rewrite 的收集口径严格一致）
        new_headings_map = {sf: self._collect_headings_for_anchor(
            self._read_file(join_paths(self.sub_files_dir, sf))) for sf in changed_files}

        # 对每个被修改的文件，构建 old_anchor -> new_anchor 映射（按位置匹配）
        for sf in changed_files:
            old_list = old_headings_map.get(sf, [])
            new_list = new_headings_map.get(sf, [])
            if len(old_list) != len(new_list):
                # 标题数量变化（不应该发生在 rewrite 中），跳过该文件的锚点同步
                print(f"[WARN] {sf}: 重编号前后标题数量不一致 ({len(old_list)} -> {len(new_list)})，跳过锚点同步")
                continue

            # v5.2.1（P0）：数量相同 ≠ 配对可信。再校验「去编号标题」文本序列是否逐条一致；
            # 若不一致说明章节发生了插入/删除/重排，按位置配对会静默错配锚点，
            # 此时仅对文本一致的条目建映射，其余明确告警（不再无声跳过）。
            old_titles = [t for _, t in old_list]
            new_titles = [t for _, t in new_list]
            mismatched = sum(1 for a, b in zip(old_titles, new_titles) if a != b)
            if mismatched:
                print(f"[WARN] {sf}: 重编号前后有 {mismatched} 条标题文本不对应，"
                      f"这些条目的锚点映射已跳过（其余 {len(old_list) - mismatched} 条正常同步）")

            anchor_mapping = {}
            for i in range(len(old_list)):
                old_heading_full, old_title = old_list[i]
                new_heading_full, new_title = new_list[i]
                # 按标题文本匹配（双重验证）
                if old_title == new_title:
                    old_anchor = heading_to_anchor(old_heading_full.lstrip('#').strip())
                    new_anchor = heading_to_anchor(new_heading_full.lstrip('#').strip())
                    if old_anchor != new_anchor:
                        anchor_mapping[old_anchor] = new_anchor

            if not anchor_mapping:
                continue

            # 锚点按长度降序排列，避免前缀重叠误匹配（如 '9-gh' 被 '9-gh-能力速查' 误吞）
            alts = sorted((re.escape(a) for a in anchor_mapping.keys()), key=len, reverse=True)
            alts_group = '(' + '|'.join(alts) + ')'

            # ---- 跨文件链接同步（单遍替换，避免相邻编号级联：9->10 后再被 10->11 误伤）----
            all_files = self._list_sub_files() + ([self.main_file] if os.path.exists(self.main_file) else [])
            for other_file in all_files:
                if other_file == sf:
                    continue
                fp = self.main_file if other_file == self.main_file else join_paths(self.sub_files_dir, other_file)
                content = self._read_file(fp)
                if sf not in content:
                    continue
                pattern_cross = rf'(\[[^\]]*\]\([^)]*{re.escape(sf)}#{alts_group}[^)]*\))'
                modified = False

                def replace_cross(m, _map=anchor_mapping):
                    nonlocal modified
                    modified = True
                    oa = m.group(2)
                    return m.group(1).replace(f'#{oa}', f'#{_map[oa]}', 1)

                new_content = re.sub(pattern_cross, replace_cross, content)
                if modified:
                    self._write_file(fp, new_content)

            # ---- 同文件链接同步（修复 BUG：rewrite 原仅同步跨文件锚点，
            #      导致子文件内自引用锚点在重编号后全部失效）----
            # v5.2.2（P0-3 修复）：原模式 `\(#{alts}` **不限定上下文**——正文、表格、
            # 代码块中凡出现 `(#锚点` 形态的普通文本都会被替换，属篡改非链接内容；
            # 且与跨文件分支「仅在 Markdown 链接内部替换」的口径不对称。
            # 现统一为：仅在 `[文本](#锚点)` 链接内部替换，并跳过代码围栏。
            self_fp = join_paths(self.sub_files_dir, sf)
            self_content = self._read_file(self_fp)
            pattern_self = rf'(\[[^\]]*\]\()#{alts_group}(?=[\s)])'
            self_modified = False

            def replace_self(m, _map=anchor_mapping):
                nonlocal self_modified
                oa = m.group(2)
                if oa not in _map:
                    return m.group(0)
                self_modified = True
                return f'{m.group(1)}#{_map[oa]}'

            out_lines, in_fence = [], False
            for line in self_content.split('\n'):
                if FENCE_PATTERN.match(line):
                    in_fence = not in_fence
                    out_lines.append(line)
                    continue
                if in_fence:
                    out_lines.append(line)
                    continue
                out_lines.append(re.sub(pattern_self, replace_self, line))
            new_self = '\n'.join(out_lines)
            if self_modified:
                self._write_file(self_fp, new_self)

    # ------------------------------------------------------------------------
    # number — 批量分配 / 校正 YAML `file_number`（v5.0.0 新增，迁移用）
    # ------------------------------------------------------------------------

    def _set_file_number(self, content: str, n: int) -> str:
        """在 YAML Front Matter 内写入 / 更新 `file_number: n`（其余字段原样保留）"""
        if not content.startswith('---'):
            print("[WARN] 文件无 YAML Front Matter，跳过 file_number 写入")
            return content
        fm_end = content.find('\n---\n', 4)
        if fm_end < 0:
            fm_end = content.find('\n---\r\n', 4)
        if fm_end < 0:
            print("[WARN] YAML Front Matter 边界异常，跳过 file_number 写入")
            return content
        fm = content[4:fm_end]
        if re.search(r'^file_number\s*:', fm, re.MULTILINE):
            fm_new = re.sub(r'^file_number\s*:.*$', f'file_number: {n}',
                            fm, count=1, flags=re.MULTILINE)
        else:
            fm_new = fm.rstrip('\n') + f'\nfile_number: {n}'
        return content[:4] + fm_new + content[fm_end:]

    def number_init(self, dry_run: bool = False, force: bool = False):
        """批量为子记忆文件分配 / 校正 YAML `file_number`（v5.0.0）

        分配依据（**零硬编码文件名**）：按各文件「首个 H2 的旧编号」升序——
        该编号在原「跨文件连续」体系中天然反映人工定义的语义顺序。
        · 默认：已有合法 `file_number` 的保留不动，仅补齐缺失者（取未占用最小正整数）
        · `--force`：忽略现有值，按上述顺序整体重排为 1..n
        本命令为**一次性迁移命令**（旧体系 → `N-M-X-Z`）；日常新增文件由 `add` 自动分配。
        """
        all_files = self._list_sub_files()
        if not all_files:
            print("[INFO] 没有子文件需要分配 file_number")
            return

        ranked = []   # (legacy_h2_num, filename, old_file_number, content)
        for sf in all_files:
            content = self._read_file(join_paths(self.sub_files_dir, sf))
            meta, _ = self._parse_yaml_frontmatter(content)
            try:
                old = int(str(meta.get('file_number')).strip())
            except (TypeError, ValueError):
                old = None
            m = re.search(r'^##\s+(\d+)', content, re.MULTILINE)
            legacy = int(m.group(1)) if m else 10 ** 6   # 无编号者排最后
            ranked.append((legacy, sf, old, content))
        ranked.sort(key=lambda x: (x[0], x[1]))

        used = set() if force else {o for _l, _s, o, _c in ranked if o is not None}
        nxt = 1
        plan = []     # (filename, old, new)
        for _legacy, sf, old, _content in ranked:
            if old is not None and not force:
                plan.append((sf, old, old))
                continue
            while nxt in used:
                nxt += 1
            used.add(nxt)
            plan.append((sf, old, nxt))
            nxt += 1

        print(f"{'[DRY-RUN] ' if dry_run else ''}file_number 分配方案"
              f"（依据：各文件首个 H2 旧编号升序{'，--force 整体重排' if force else ''}）：")
        changed = 0
        for sf, old, new in plan:
            if old is None:
                note = f"新增 → {new}"
                changed += 1
            elif old != new:
                note = f"{old} → {new}（重排）"
                changed += 1
            else:
                note = f"{new}（保持）"
            print(f"  · {sf}: {note}")

        if dry_run:
            print(f"\n[DRY-RUN] {changed} 个文件待写入 `file_number`（未落盘）")
            return

        for sf, old, new in plan:
            if old == new:
                continue
            filepath = join_paths(self.sub_files_dir, sf)
            content = self._read_file(filepath)
            new_content = self._set_file_number(content, new)
            if new_content != content:
                self._write_file(filepath, new_content)

        self._add_changelog_entry('number', '(全部)', 'agent',
                                  f'分配 / 校正 file_number（{changed} 个文件变更）')
        print(f"\n[OK] `file_number` 已写入 {changed} 个文件。"
              f"下一步：跑 `rewrite` 重建 N-M-X-Z 编号，再跑 `check` 验收。")

    # ------------------------------------------------------------------------
    # get-offset — 返回章节行号范围
    # ------------------------------------------------------------------------

    def get_offset(self, filename: str, section: str, json_output: bool = True):
        """返回指定章节的行号范围（供 WorkBuddy Read(offset=X, limit=Y) 使用）"""
        try:
            safe = self._safe_filename(filename)
        except ValueError as e:
            print(f"[ERROR] {e}")
            return None

        filepath = join_paths(self.sub_files_dir, safe)
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filename}")
            return None

        # v3.0: 逐文件 mtime 新鲜度校验（修复 P0-4：原全局 last_updated 会被他文件保存掩码）
        # 每个子文件独立记录上次扫描时的 mtime，仅当本文件变更晚于其自身上次扫描才重扫
        file_mtime = os.path.getmtime(filepath)
        file_mtimes = self.state.setdefault('file_mtimes', {})

        def _rescan():
            content = self._read_file(filepath)
            chapters = self._extract_chapters(content)
            self._update_chapter_offsets(safe, chapters)
            # 记录本文件独立扫描时间戳，避免他文件保存 state 时掩码本文件新鲜度
            file_mtimes[safe] = datetime.now(timezone.utc).isoformat()
            self._save_state()

        # v5.2.3（双审计第二轮 P2-4，**部分成立**）：原 `except Exception` 把
        # `_rescan()` 也包在 try 里——一旦重扫自身抛错（IO / 权限），会被捕获后再
        # 调用一次 `_rescan()`，重复劳动且掩盖真实异常类型。现收窄为只捕解析期的
        # (ValueError, TypeError)，重扫动作移到 try 之外，异常类型可辨。
        last_scan = file_mtimes.get(safe)
        need_rescan = True
        if last_scan:
            try:
                last_dt = datetime.fromisoformat(last_scan.replace('Z', '+00:00'))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                file_dt = datetime.fromtimestamp(file_mtime, tz=timezone.utc)
                need_rescan = file_dt > last_dt
            except (ValueError, TypeError) as e:
                print(f"[WARN] 时间戳解析失败（{type(e).__name__}: {e}），将重新扫描")
                need_rescan = True
        if need_rescan:
            _rescan()

        offsets = self.state.get('chapter_offsets', {}).get(safe, {})
        if section not in offsets:
            # 兼容重复标题的消歧键 + 前缀匹配（如 '## 1' 匹配 '## 1 总则'）
            matches = [k for k in offsets if k == section or k.startswith(section + ' #')
                        or (k.startswith(section) and (len(k) == len(section) or k[len(section)] in ' #'))]
            if matches:
                section = matches[0]
            else:
                print(f"[ERROR] 未找到章节: {section}")
                print(f"[INFO] 可用章节: {list(offsets.keys())[:15]}...")
                return None

        result = {
            'file': safe,
            'section': section,
            'start_line': offsets[section]['start_line'],
            'end_line': offsets[section]['end_line'],
            'lines_count': offsets[section]['end_line'] - offsets[section]['start_line'] + 1
        }
        if json_output:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(f"文件: {safe}")
            print(f"章节: {section}")
            print(f"行号范围: {result['start_line']}-{result['end_line']}")
            print(f"行数: {result['lines_count']}")
        return result

    # ------------------------------------------------------------------------
    # route — 归属判定 / 读前精判（v5.2.1 · 手册 §3.1 + §3.3 第 1 步工具化）
    # ------------------------------------------------------------------------

    # 各四要素字段的匹配权重：scope_in 是归属判定的第一权威，故最高
    ROUTE_FIELD_WEIGHTS = (('scope_in', 1.0), ('theme', 0.6), ('positioning', 0.4), ('role', 0.3))
    ROUTE_SCORE_FLOOR = 0.18   # 低于此分不列入候选（避免噪声刷屏）

    @staticmethod
    def _split_scope_entries(field: str, raw) -> list:
        """按手册 §2.2 的分隔符切分四要素条目（v5.2.2，双审计 P0-2 部分成立项）

        事实：子文件 YAML 的 `scope_in` / `scope_out` 实际写法是**单行字符串、以全角
        分号 `；` 分隔多条**（见任意子文件 YAML 头）。而 `normalize_list` 只按逗号切分，
        整段被当成**一条**条目 → 逐条关键词级匹配失效、评分被长文本稀释。
        现对 scope_* 字段按 `；`（兼容半角 `;`）追加切分。
        """
        items = normalize_list(raw)
        if field not in ('scope_in', 'scope_out'):
            return items
        out = []
        for it in items:
            parts = [p.strip() for p in re.split(r'[；;]', it) if p.strip()]
            out.extend(parts if parts else [it])
        return out

    @staticmethod
    def _text_similarity(query: str, entry: str) -> float:
        """中英混排短文本的相似度（0~1，标准库实现）

        双轨取大值：
          · 覆盖率：查询的汉字 / 字符二元组命中条目文本的比例（对中文短查询最稳）
          · 序列比：difflib.SequenceMatcher 的编辑距离比率（对英文与长串更稳）
        """
        q, e = (query or '').strip(), (entry or '').strip()
        if not q or not e:
            return 0.0
        if q in e or e in q:
            return 1.0
        grams = [q[i:i + 2] for i in range(len(q) - 1)] or [q]
        cover = sum(1 for g in grams if g in e) / len(grams)
        return max(cover, SequenceMatcher(None, q, e).ratio())

    def _scan_headings_ordered(self, content: str) -> list:
        """按文档顺序返回 [(level, 完整行, 去编号标题)]（跳过代码围栏，与 rewrite 同口径）"""
        out, in_fence = [], False
        for line in content.split('\n'):
            if FENCE_PATTERN.match(line):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            m = ALL_HEADING_PATTERN.match(line)
            if m:
                out.append((len(m.group(1)), line.strip(), strip_heading_number(m.group(2).strip())))
        return out

    def _best_section(self, content: str, query: str, extra: str = ''):
        """在文件内按标题相似度挑出最匹配的章节（四级定位链第 2 级：表② 章节位置）

        `extra` 传入命中的四要素条目文本：仅用原始 query 匹配标题时，短查询常与
        章节标题用词不同（如查「配置 MCP 服务器」而章节名是「MCP 服务接入」），
        把命中条目一起参与匹配可显著提升定位准确度。
        """
        q = (query + ' ' + extra).strip()
        best, best_score = None, 0.0
        for _lvl, full, title in self._scan_headings_ordered(content):
            s = max(self._text_similarity(query, title), self._text_similarity(extra, title) if extra else 0.0)
            s = max(s, self._text_similarity(q, title) * 0.9)
            if s > best_score:
                best, best_score = full, s
        return best, best_score

    def route(self, query: str, intent: str = 'read', json_output: bool = False, top: int = 3):
        """归属判定 / 读前精判（v5.2.1，只读、不写任何文件）

        两种用途（同一套打分，输出侧重不同）：
          · `--intent read`（默认）：读前精判。按表① ROUTE_CARD 的 scope_in 明细做
            **精判**（手册 §3.3 第 1 步），输出应读哪个子文件、命中哪条 scope_in，
            并给出定位链上的下一步命令（表② 章节位置 → 子文件速查索引 → get-offset）。
          · `--intent write`：写前入库判定。同上打分，额外输出命中文件的 scope_out——
            命中 scope_out 即说明该内容**不应**写入此文件，须按其 `→` 指向改投他处（§3.1）。

        打分口径：scope_in 权重 1.0 > theme 0.6 > positioning 0.4 > role 0.3；
        文本相似度见 `_text_similarity`。低于 ROUTE_SCORE_FLOOR 不列入候选。
        """
        if not query or not query.strip():
            print("[ERROR] --query 不能为空")
            return None

        # v5.2.2（P2-2）：短查询保护。1~3 字的查询其二元组覆盖率虚高，
        # 会把大量无关文件刷成候选（噪声）；此时抬高阈值并提示补充「情境 + 主题」。
        q_len = len(query.strip())
        short_query = q_len < 4
        floor = self.ROUTE_SCORE_FLOOR * 2.5 if short_query else self.ROUTE_SCORE_FLOOR

        sub_files = self._list_sub_files()
        candidates = []
        for sf in sub_files:
            content = self._read_file(join_paths(self.sub_files_dir, sf))
            meta, _ = self._parse_yaml_frontmatter(content)
            score, hits = 0.0, []
            for field, weight in self.ROUTE_FIELD_WEIGHTS:
                for entry in self._split_scope_entries(field, meta.get(field)):
                    s = self._text_similarity(query, entry) * weight
                    if s > score:
                        score = s
                    if s >= floor:
                        hits.append((field, entry, round(s, 3)))
            # scope_out 命中 = 反向信号：该内容不属于本文件
            out_hits = []
            for entry in self._split_scope_entries('scope_out', meta.get('scope_out')):
                s = self._text_similarity(query, entry)
                if s >= floor:
                    out_hits.append((entry, round(s, 3)))
            section, sec_score = self._best_section(
                content, query, extra=' '.join(e for _f, e, _s in hits))
            candidates.append({
                'file': sf,
                'score': round(score, 3),
                'hits': sorted(hits, key=lambda x: -x[2])[:3],
                'scope_out_hits': sorted(out_hits, key=lambda x: -x[1])[:2],
                'suggested_section': section,
                'section_score': round(sec_score, 3),
            })

        candidates = [c for c in candidates if c['score'] >= floor]
        candidates.sort(key=lambda c: (-c['score'], c['file']))
        candidates = candidates[:max(1, top)]

        if json_output:
            print(json.dumps({'query': query, 'intent': intent, 'candidates': candidates},
                             ensure_ascii=False, indent=2))
            return candidates

        print(f"[INFO] 查询: {query}")
        print(f"[INFO] 用途: {'写前入库判定' if intent == 'write' else '读前精判'}"
              f"（打分口径见手册 §3.1 / §3.3）")
        if short_query:
            print(f"[INFO] 查询较短（{q_len} 字），已抬高命中阈值至 {round(floor, 3)}；"
                  f"建议按「情境 + 主题」补全查询以提高区分度")
        if not candidates:
            print("[WARN] 无子文件的四要素匹配到该查询（score 均低于阈值）——"
                  "按 §3.1 决策树，若确属新领域，走 `add` 新建子文件")
            return candidates
        print(f"\n[精判] 命中 {len(candidates)} 个子文件（score 降序）:")
        for i, c in enumerate(candidates, 1):
            print(f"  {i}) {c['file']}   score={c['score']}   file_number="
                  f"{self._parse_yaml_frontmatter(self._read_file(join_paths(self.sub_files_dir, c['file'])))[0].get('file_number')}")
            for field, entry, s in c['hits']:
                print(f"      · 命中 {field}: {entry}  (score={s})")
            if c['suggested_section']:
                print(f"      · 建议章节: {c['suggested_section']} (score={c['section_score']})")
                print(f"      · 下一步: python memory-mgr.py get-offset --file \"{c['file']}\" "
                      f"--section \"{c['suggested_section']}\"")
            if intent == 'write' and c['scope_out_hits']:
                for entry, s in c['scope_out_hits']:
                    print(f"      ⚠️ 命中 scope_out: {entry} (score={s}) "
                          f"—— 该内容不应写入本文件，按其 → 指向改投")
        return candidates

    # ------------------------------------------------------------------------
    # next-num — 增量编号助手（v5.2.1 · 手册 §3.4 插章路径的判据工具化）
    # ------------------------------------------------------------------------

    def next_num(self, filename: str, level: int = 2, after: str = None,
                 json_output: bool = True):
        """给出下一个可用编号 + 应走的插章路径（只读，不写文件）

        解决的问题：手册 §3.4 路径 A 要求「手工计算编号后写入 + 跑 index」，
        但编号计算此前**无任何工具支持**，Agent 只能肉眼数编号（易错、且与
        「编号由工具生成」的通用表述形成方向性冲突）。本命令把计算工具化。

        参数：
          · `--level 2`（默认）：返回 `## N-(M+1)`（M = 本文件最大章号）
          · `--level 3`：`--after` 指定所属 H2（如 `2-3`），返回 `### 2-3-(X+1)`
          · `--level 4`：`--after` 指定所属 H3（如 `2-3-1`），返回 `#### 2-3-1-(Z+1)`

        路径判定（§3.4）：
          · 路径 A：插入点之后**没有**同级标题（即追加到末尾）→ 手工写编号 + 跑 `index`
          · 路径 B：插入点之后**仍有**同级标题（插在中间）→ 后续编号会连锁位移，须跑 `rewrite`
        """
        try:
            safe = self._safe_filename(filename)
        except ValueError as e:
            print(f"[ERROR] {e}")
            return None
        filepath = join_paths(self.sub_files_dir, safe)
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filename}")
            return None

        content = self._read_file(filepath)
        meta, _ = self._parse_yaml_frontmatter(content)
        try:
            n = int(str(meta.get('file_number')).strip())
        except (TypeError, ValueError):
            print(f"[ERROR] {safe} 缺少合法 `file_number`，先跑 `number --init`")
            return None

        headings = self._scan_headings_ordered(content)

        # `--after` 双语义：可指向「父级标题」（H{level-1}，追加到该父级末尾）
        #                   或「同级标题」（H{level}，插在其后）
        anchor_idx = anchor_lvl = None
        if after:
            anchor_norm = after.strip().lstrip('#').strip()
            for i, (lv, full, _t) in enumerate(headings):
                if lv in (level - 1, level) and anchor_norm in full:
                    anchor_idx, anchor_lvl = i, lv
                    break
            if anchor_idx is None:
                print(f"[ERROR] 未定位到标题 '{after}'（应为 H{level - 1} 父标题或 H{level} 同级标题）")
                return None

        if anchor_lvl == level:
            # 插在某同级标题之后：新编号 = 该标题尾号 + 1（后续编号由 rewrite 顺移）
            anchor_full = headings[anchor_idx][1]
            anchor_num = anchor_full.lstrip('#').strip().split(' ')[0]
            tail = self._parse_num_tail(anchor_full) or 0
            parent_prefix = '-'.join(anchor_num.split('-')[:level - 1]) if level > 2 else str(n)
            next_label = f"{parent_prefix}-{tail + 1}"
            has_following = False
            for j in range(anchor_idx + 1, len(headings)):
                if headings[j][0] < level:
                    break
                if headings[j][0] == level:
                    has_following = True
                    break
        else:
            # 追加到某父级末尾（--after 指父级）或文件末尾（--after 省略）
            if anchor_lvl == level - 1:
                parent_prefix = headings[anchor_idx][1].lstrip('#').strip().split(' ')[0]
                start = anchor_idx + 1
            else:
                if level != 2:
                    print(f"[ERROR] --level {level} 必须用 --after 指定父标题（H{level - 1}）"
                          f"或同级标题（H{level}）")
                    return None
                parent_prefix, start = str(n), 0
            cur_max, j = 0, start
            while j < len(headings) and headings[j][0] >= level:
                if headings[j][0] == level:
                    cur_max = max(cur_max, self._parse_num_tail(headings[j][1]) or 0)
                j += 1
            next_label = f"{parent_prefix}-{cur_max + 1}"
            has_following = False

        # 路径判定（§3.4）：
        #   · 路径 A：追加到末尾，不影响既有编号 → 手工写编号后跑 `index`
        #   · 路径 B：插在中间，后续编号连锁位移 → 须跑 `rewrite`
        path = 'B' if has_following else 'A'
        result = {
            'file': safe,
            'file_number': n,
            'level': level,
            'next_number': next_label,
            'insert_after': after,
            'path': path,
            'reason': ('插入点之后仍有同级标题 → 后续编号会连锁位移，须跑 rewrite（路径 B）'
                       if path == 'B' else
                       '追加到末尾，不影响既有编号 → 手工写编号后跑 index 即可（路径 A）'),
            'next_command': (f'python memory-mgr.py rewrite --file "{safe}"' if path == 'B'
                             else f'python memory-mgr.py index --file "{safe}"'),
        }
        if json_output:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"文件: {safe}（file_number={n}）")
            print(f"下一个可用编号: {'#' * level} {next_label}")
            print(f"建议路径: 路径{path} —— {result['reason']}")
            print(f"下一步命令: {result['next_command']}")
        return result

    @staticmethod
    def _parse_num_tail(heading_line: str):
        """取标题编号串的**最后一段**整数（'### 2-3-1' -> 1；'## 2-3' -> 3）

        v5.2.3（双审计第二轮 P2-5，成立）：原正则以 `\\s` 收尾，编号后**无空格**直接接
        标题文字时（如 `## 2-3标题`）匹配失败返回 None，静默跳过编号 → next-num /
        rewrite 判据失真。改为负向预查 `(?![-.\\d])`——「编号之后不得再接数字或分隔符」，
        既吞下「编号后直接接标题文字」的形态，又杜绝把 `2-3` 误截成 `2`。
        既有合法形态（`## 2-3 标题`、`### 1-2-3 小节`、`## 2026 年度`）判定结果不变。
        """
        m = re.match(r'^#{2,4}\s+(\d+(?:[-.]\d+)*)(?![-.\d])', heading_line.strip())
        if not m:
            return None
        try:
            return int(m.group(1).replace('.', '-').split('-')[-1])
        except ValueError:
            return None

    # ------------------------------------------------------------------------
    # verify — 五项验收一键化（v5.2.1 · 手册 §5 标准审计流程）
    # ------------------------------------------------------------------------

    def verify(self, skip_git: bool = False) -> bool:
        """一键跑完手册 §5 的五项验收，汇总为一张表（只读，不改文件）

          1. `check`（14 维度）
          2. `断链检测.py`（链接级：断链锚点 / P-1 越界 / P-2 回链 / P-4 锚点唯一性）
          3. `validate`（12 条纪律 + §10 格式要求）
          4. 逐章完整性核验（统计各文件 H2/H3 章节数，与状态文件记录比对）
          5. `git status --short`（确认无越界 / 未预期的改动）
        """
        results = []

        # 1) check
        try:
            ok1 = self.check(verbose=False, fix=False)
            results.append(('1. check（14 维度）', 'PASS' if ok1 else 'FAIL', ''))
        except Exception as e:
            results.append(('1. check（14 维度）', 'ERROR', str(e)))

        # 2) 断链检测.py（子进程调用，沿用当前解释器 → 符合本机禁裸 python 的约束）
        # v5.3.0：查找位置由「子记忆目录」改为「本脚本所在目录」。
        #   原按 self.sub_files_dir 查找，隐含假设「断链检测.py 位于子记忆目录内」；
        #   一旦 --sub-files-dir 指向别处，脚本找不到即 **SKIP 静默跳过**——验收项
        #   静默失效比报错更危险（看似通过，实则未检查）。按 v5.3.0 约定，断链检测.py
        #   恒与 memory-mgr.py 同目录，故从 __file__ 推导才是正确且稳定的依据。
        link_script = join_paths(os.path.dirname(os.path.abspath(__file__)), '断链检测.py')
        if os.path.exists(link_script):
            try:
                # v5.3.0：透传当前生效路径 —— 否则自定义 --main-file / --sub-files-dir
                # 时，第 1 项 check 检查 A 套文件而第 2 项断链检测仍检查默认路径的
                # B 套文件，五项验收内部自相矛盾。
                proc = subprocess.run(
                    [sys.executable, link_script,
                     '--main-file', self.main_file,
                     '--sub-files-dir', self.sub_files_dir],
                    capture_output=True, text=True, encoding='utf-8',
                    errors='replace', timeout=120)
                out = (proc.stdout or '') + (proc.stderr or '')
                # v5.2.4（Round1 B-3，P1，已实测复现）：原判据靠 emoji / 关键词子串，
                # 而 `断链检测.py` 的「断链锚点」段（L288-291 / L307）既不用 ❌ 也不含
                # 这些关键词 —— 实测「断链锚点总计: 3 处」时 bad 仍为 False，verify 第 2 项
                # 假通过，与手册 §5「第 2 项覆盖断链锚点」的契约不符。现改为**数值判定**，
                # 四项各取计数，任一 > 0 即 FAIL，不再依赖任何 emoji。
                def _cnt(pattern: str) -> int:
                    m = re.search(pattern, out)
                    return int(m.group(1)) if m else 0
                n_broken = _cnt(r'断链锚点总计:\s*(\d+)\s*处')
                n_oos = _cnt(r'越界引用合计:\s*(\d+)\s*处')
                n_noback = _cnt(r'缺回链子文件:\s*(\d+)\s*个')
                n_dup = _cnt(r'锚点重复合计:\s*(\d+)\s*处')
                bad = (n_broken > 0) or (n_oos > 0) or (n_noback > 0) or (n_dup > 0) \
                    or (proc.returncode != 0)
                detail = ''
                if bad:
                    for line in out.split('\n'):
                        if '❌' in line or '⚠️' in line:
                            detail = line.strip()[:100]
                            break
                results.append(('2. 断链检测.py（链接级）', 'FAIL' if bad else 'PASS', detail))
            except Exception as e:
                results.append(('2. 断链检测.py（链接级）', 'ERROR', str(e)))
        else:
            # v5.3.0：改为 FAIL —— 验收项静默 SKIP 会被误读为「通过」，实则未检查。
            results.append(('2. 断链检测.py（链接级）', 'FAIL',
                            f'脚本不存在（应在 memory-mgr.py 同目录）: {link_script}'))

        # 3) validate
        try:
            ok3 = self.validate(strict=False, auto_fix=False)
            results.append(('3. validate（12 纪律 + §10 格式）', 'PASS' if ok3 else 'FAIL', ''))
        except Exception as e:
            results.append(('3. validate（12 纪律 + §10 格式）', 'ERROR', str(e)))

        # 4) 逐章完整性核验（与状态文件比对，替代手工 grep）
        try:
            mismatches = []
            for sf in self._list_sub_files():
                content = self._read_file(join_paths(self.sub_files_dir, sf))
                disk = [h for h in self._scan_headings_ordered(content) if h[0] in (2, 3)]
                recorded = self.state.get('chapter_offsets', {}).get(sf, {})
                # v5.2.4（Round1 B-11，P2）：原 `if recorded and ...` 对「状态文件
                # 无该子文件记录」静默跳过，第 4 项照样输出 PASS，掩盖真实缺口。
                if not recorded:
                    mismatches.append(f"{sf}: 状态文件无章节记录（须先跑 sync）")
                elif len(recorded) != len(disk):
                    mismatches.append(f"{sf}: 磁盘 {len(disk)} 章 / 状态 {len(recorded)} 章")
            if mismatches:
                results.append(('4. 逐章完整性核验', 'FAIL', '；'.join(mismatches[:3])))
            else:
                results.append(('4. 逐章完整性核验', 'PASS',
                                f"{len(self._list_sub_files())} 个文件章节数一致"))
        except Exception as e:
            results.append(('4. 逐章完整性核验', 'ERROR', str(e)))

        # 5) git status --short
        if skip_git:
            results.append(('5. git status --short', 'SKIP', '显式跳过'))
        elif not self._git_available():
            # v5.2.3（双审计第二轮 P1-8 补完，成立）：`_git_repo_root()` 在 git 不可用时
            # 返回 sub_files_dir（非空），故 `or` 右侧的回退永远不生效，最终 `git status`
            # 抛 FileNotFoundError 被标 ERROR。非 git 环境不是故障，应判 SKIP。
            results.append(('5. git status --short', 'SKIP', '非 git 环境（git 不可用或不在仓库内）'))
        else:
            try:
                # v5.2.2（P1-8，成立）：原取「子目录的父目录」当仓库根，若仓库根在更上层
                # 则 git status 会跑到别的仓库或失败。改用已有的 `_git_repo_root()`
                #（`git rev-parse --show-toplevel`），失败时回退父目录。
                repo_root = self._git_repo_root() or os.path.dirname(os.path.abspath(self.sub_files_dir))
                proc = subprocess.run(['git', 'status', '--short'], cwd=repo_root,
                                      capture_output=True, text=True, encoding='utf-8',
                                      errors='replace', timeout=60)
                out = (proc.stdout or '').strip()
                if proc.returncode != 0:
                    results.append(('5. git status --short', 'ERROR',
                                    (proc.stderr or '').strip()[:80]))
                else:
                    lines = [l for l in out.split('\n') if l.strip()]
                    results.append(('5. git status --short', 'INFO',
                                    f"{len(lines)} 项变更" + (f"（如 {lines[0].strip()[:40]}）" if lines else '')))
            except Exception as e:
                results.append(('5. git status --short', 'ERROR', str(e)))

        print("\n" + "=" * 68)
        print("五项验收汇总（手册 §5）")
        print("=" * 68)
        for name, status, detail in results:
            mark = {'PASS': '✅', 'FAIL': '❌', 'ERROR': '💥', 'SKIP': '⏭️', 'INFO': 'ℹ️'}.get(status, '')
            print(f"  {mark} {status:<5} {name}" + (f"  —— {detail}" if detail else ""))
        print("=" * 68)
        failed = [r for r in results if r[1] in ('FAIL', 'ERROR')]
        if failed:
            print(f"[FAIL] {len(failed)} 项未通过，按手册 §7 纠偏手册逐项修复后重跑 `verify`")
            return False
        print("[OK] 五项验收全部通过（第 5 项为变更清单，须人工确认无越界改动）")
        return True

    # ------------------------------------------------------------------------
    # validate — 综合校验（v2.0.0: 12 条纪律自检）
    # ------------------------------------------------------------------------

    def validate(self, strict: bool = False, auto_fix: bool = False):
        """综合校验：check + 索引一致性 + 12 条纪律自检"""
        print("=" * 60)
        print("综合校验开始")
        print("=" * 60)

        # [1/3] 链接完整性检查
        print("\n[1/3] 检查链接完整性（14 维度）...")
        check_ok = self.check(verbose=True, fix=auto_fix)
        if auto_fix:
            # v5.2.3（双审计第二轮 N-2，成立）：v5.2.2 已按手册 §0.2「严禁盲修」让
            # `check(fix=True)` 拒绝任何写盘，但 validate 侧仍打印「--auto-fix 已尝试修复」
            # 并调用 `sync(force=True)` 写盘——前者是**虚假陈述**（实际一行未修），
            # 后者让一个名为「校验」的命令产生写副作用，均属接口与行为不一致。
            # 现与 `check --fix` 同源：只出待核清单、不做任何写盘。
            print("[REFUSED] --auto-fix 已按手册 §0.2「严禁盲修」停用："
                  "本次未修改任何文件、未同步状态。请按上方待核清单人工逐条确认后，"
                  "显式执行 `sync`（同步状态）或按 §7 纠偏手册处置。")

        # [2/3] 索引一致性
        print("\n[2/3] 检查索引一致性...")
        sub_files = self._list_sub_files()
        index_ok = True
        for sub_file in sub_files:
            filepath = join_paths(self.sub_files_dir, sub_file)
            content = self._read_file(filepath)
            if '本文件速查索引' not in content:
                print(f"  ⚠️ 子文件缺少头部索引表: {sub_file}")
                if strict:
                    index_ok = False
            # 检查索引表中的章节是否实际存在（H2 + H3 两级，索引只到 H3）
            meta, body = self._parse_yaml_frontmatter(content)
            actual_h2 = set(m.group(1).strip() for m in H2_PATTERN.finditer(content))
            actual_h3 = set(m.group(1).strip() for m in H3_PATTERN.finditer(content))
            # v5.1.1：校验范围限定为「本文件速查索引」区间。原逻辑遍历全文，会把正文表格中
            # 以 `|` 开头且含反引号章节引用的行（如对照表 `| 适用纪律 | [`## 2-4`](#...) |`）
            # 误判为索引条目——其解析出的标题只剩编号，strip 编号后为空串，必然匹配失败。
            idx_start = content.find('本文件速查索引')
            idx_end = content.find('<!-- INDEX_END -->')
            if idx_start == -1 or idx_end == -1 or idx_end < idx_start:
                index_block = ''
            else:
                index_block = content[idx_start:idx_end]
            for line in index_block.split('\n'):
                if line.startswith('|') and '`##' in line:
                    indexed_heading = re.search(r'`(##\s+.+?)`', line)
                    if indexed_heading:
                        indexed_title = indexed_heading.group(1).lstrip('#').strip()
                        indexed_title_no_num = strip_heading_number(indexed_title)
                        found = any(strip_heading_number(h) == indexed_title_no_num for h in actual_h2)
                        if not found:
                            print(f"  ⚠️ {sub_file}: 索引表中章节 '{indexed_title}' 不存在于文件中")
                            index_ok = False
                elif line.startswith('|') and '`###' in line:
                    indexed_heading = re.search(r'`(###\s+.+?)`', line)
                    if indexed_heading:
                        indexed_title = indexed_heading.group(1).lstrip('#').strip()
                        indexed_title_no_num = strip_heading_number(indexed_title)
                        found = any(strip_heading_number(h) == indexed_title_no_num for h in actual_h3)
                        if not found:
                            print(f"  ⚠️ {sub_file}: 索引表中章节 '{indexed_title}' 不存在于文件中")
                            index_ok = False

        # [3/3] 12 条纪律自检
        print("\n[3/3] 检查 12 条纪律...")
        discipline_results = self._check_12_disciplines(sub_files, strict)
        discipline_ok = all(r[0] for r in discipline_results)

        # [附加] §10 格式强制要求校验（C-5，提示级，不参与通过 / 失败判定）
        # v5.2.4（Round1 B-12，P2）：第 10 条已于 v5.2.3 移出自动化——跨文件 `§X`
        # 引用按 §10 第13条豁免，且工具只对本手册启用该扫描，而手册不在 targets 中，
        # 故此处不应再宣称检查第 10 条（能力与声明须一致，见手册 §10 对应关系表）。
        print("\n[附加] 检查 §10 格式强制要求（第 3 / 6 / 9 条，提示级）...")
        fmt_findings = self._check_format_requirements(sub_files)
        by_item = {}
        for item, loc, desc in fmt_findings:
            by_item.setdefault(item, []).append((loc, desc))
        if not fmt_findings:
            print("  ✅ 无可自动化检出项（第 1、2、5、12 条仍须按 §5 步骤4 C 段判读）")
        else:
            for item in sorted(by_item):
                hits = by_item[item]
                print(f"  ⚠️ {item}: {len(hits)} 处")
                for loc, desc in hits[:15]:
                    print(f"       - {loc} {desc}")
                if len(hits) > 15:
                    print(f"       - …… 其余 {len(hits) - 15} 处已省略")

        # 汇总
        print("\n" + "=" * 60)
        print("校验完成")
        print("=" * 60)
        print(f"链接检查: {'✅ 通过' if check_ok else '❌ 失败'}")
        print(f"索引一致性: {'✅ 通过' if index_ok else '❌ 失败'}")
        print(f"纪律检查: {'✅ 通过' if discipline_ok else '❌ 失败'}")
        print(f"§10 格式提示: {len(fmt_findings)} 处（提示级，不计入通过判定；"
              f"第 1、2、5、10、12 条须按 §5 步骤4 C 段判读）")
        if not discipline_ok:
            print("\n纪律详情:")
            for passed, name, detail in discipline_results:
                status = '✅' if passed else '❌'
                print(f"  {status} {name}: {detail}")
        return check_ok and index_ok and discipline_ok

    def _check_12_disciplines(self, sub_files: list, strict: bool) -> list:
        """12 条纪律自检（来源：file-structure-organizer Skill）
        返回 [(passed: bool, name: str, detail: str), ...]
        """
        results = []
        all_contents = {}
        all_metadata = {}
        for sf in sub_files:
            filepath = join_paths(self.sub_files_dir, sf)
            content = self._read_file(filepath)
            all_contents[sf] = content
            meta, _ = self._parse_yaml_frontmatter(content)
            all_metadata[sf] = meta

        # 纪律 1: 标题层级规范（H1→H2→H3→H4，不乱跳）
        # 规则：相邻标题层级差 <= 1（允许 H2→H1 回退，不允许 H2→H4 跳级）
        # 注意：跳过代码块内的注释行（``` 到 ``` 之间的内容）和 blockquote
        d1_ok = True
        d1_detail = []
        for sf in sub_files:
            lines = all_contents[sf].split('\n')
            last_level = 0
            in_code_block = False
            for line in lines:
                # 检测代码块边界（``` 或 ~~~ 开始/结束）
                if line.strip().startswith('```') or line.strip().startswith('~~~'):
                    in_code_block = not in_code_block
                    continue
                # 跳过代码块内的内容
                if in_code_block:
                    continue
                # 跳过 blockquote 行（> 开头）和 HTML 注释
                if line.startswith('#') and not line.startswith('<!--') and not line.startswith('> '):
                    level = len(line) - len(line.lstrip('#'))
                    # 只统计真正的标题（行首 # 数量与行长度一致，排除代码注释）
                    if level >= 1 and level <= 6:
                        # 允许层级回退（如 H3→H2），只检测正向跳级（如 H2→H4）
                        if last_level > 0 and level > last_level + 1:
                            d1_ok = False
                            d1_detail.append(f"{sf}: #{last_level}->#{level}")
                        last_level = level
        results.append((d1_ok, "纪律1-标题层级规范", "通过" if d1_ok else "; ".join(d1_detail)))

        # 纪律 2: 单一事源（同一事实只在一处定义）
        d2_ok = True
        d2_detail = []
        # v5.2.2：与 check 维度6 共用 `_find_duplicate_paragraphs`（消除双源）
        paragraph_hashes = self._find_duplicate_paragraphs(sub_files, all_contents)
        for h, occurrences in paragraph_hashes.items():
            files = set(o[0] for o in occurrences)
            if len(files) > 1:
                d2_ok = False
                d2_detail.append(f"重复于: {', '.join(files)}")
        results.append((d2_ok, "纪律2-单一事源", "通过" if d2_ok else f"{len(d2_detail)} 处疑似重复"))

        # 纪律 3: 章节编号完整性（v5.0.0：改与 check 维度11 共用同一校验，消除双源）
        # 判据 = 手册 §3.9 ① 的 1~9 项（file_number 与 N-M-X-Z 的完整性）
        num_errs, _num_warns = self._check_numbering_integrity(sub_files, all_contents, all_metadata)
        results.append((not num_errs, "纪律3-章节编号完整性",
                        "通过" if not num_errs else "; ".join(num_errs[:5])))

        # 纪律 4: 链接有效性（委托给 check，此处做快速校验）
        d4_ok = True
        d4_detail = []
        for sf in sub_files:
            for _, url in MARKDOWN_LINK_PATTERN.findall(all_contents[sf]):
                if 'Memory-' in url or url.startswith('file:///'):
                    fn = url.split('/')[-1].split('#')[0]
                    if fn not in sub_files and fn != 'MEMORY.md' and not os.path.exists(url.replace('file:///', '').split('#')[0]):
                        d4_ok = False
                        d4_detail.append(f"{sf}: {url}")
        results.append((d4_ok, "纪律4-链接有效性", "通过" if d4_ok else f"{len(d4_detail)} 个断链"))

        # 纪律 5: 无循环引用（v5.2.3：与 check 共用 `find_cycles`，单一事源）
        graph5 = self._build_sub_ref_graph(sub_files, all_contents)
        cycles5 = find_cycles(graph5)
        d5_ok = not cycles5
        results.append((d5_ok, "纪律5-无循环引用",
                        "通过" if d5_ok else f"检测到 {len(cycles5)} 个循环引用（如 "
                                             f"{' -> '.join(cycles5[0])}）"))

        # 纪律 6: YAML 必填字段（8 个）
        d6_ok = True
        d6_detail = []
        for sf in sub_files:
            meta = all_metadata[sf]
            for field in REQUIRED_FRONTMATTER_FIELDS:
                if field not in meta or not meta[field]:
                    d6_ok = False
                    d6_detail.append(f"{sf}: 缺 {field}")
        results.append((d6_ok, "纪律6-YAML必填字段", "通过" if d6_ok else "; ".join(d6_detail[:5])))

        # 纪律 7: 跨文件引用使用标准链接格式
        d7_ok = True
        d7_detail = []
        for sf in sub_files:
            for _, url in MARKDOWN_LINK_PATTERN.findall(all_contents[sf]):
                if 'Memory-' in url and not url.startswith('file:///'):
                    d7_ok = False
                    d7_detail.append(f"{sf}: {url} 非 file:/// 格式")
        results.append((d7_ok, "纪律7-标准链接格式", "通过" if d7_ok else f"{len(d7_detail)} 个非标准链接"))

        # 纪律 8: 速查索引表与实际文件一致
        d8_ok = True
        d8_detail = []
        for sf in sub_files:
            if '本文件速查索引' not in all_contents[sf]:
                d8_ok = False
                d8_detail.append(f"{sf}: 无索引表")
        results.append((d8_ok, "纪律8-索引表一致", "通过" if d8_ok else "; ".join(d8_detail)))

        # 纪律 9: 文件命名规范
        d9_ok = True
        d9_detail = []
        naming_re = re.compile(r"^Memory-[^\s]+\.md$")
        for sf in sub_files:
            if not naming_re.match(sf):
                d9_ok = False
                d9_detail.append(sf)
        results.append((d9_ok, "纪律9-文件命名规范", "通过" if d9_ok else f"非法命名: {', '.join(d9_detail)}"))

        # 纪律 10: 每文件有摘要/概述段落（软约束，只告警）
        d10_ok = True
        d10_detail = []
        for sf in sub_files:
            meta = all_metadata[sf]
            _, body = self._parse_yaml_frontmatter(all_contents[sf])
            has_summary = bool(meta.get('summary')) or body.strip().startswith('>')
            if not has_summary and strict:
                d10_ok = False
                d10_detail.append(sf)
        results.append((d10_ok, "纪律10-摘要概述", "通过" if d10_ok else f"缺摘要: {', '.join(d10_detail)}"))

        # 纪律 11: 标签/关键词字段有效
        d11_ok = True
        d11_detail = []
        for sf in sub_files:
            tags = normalize_list(all_metadata[sf].get('tags'))
            if not tags:
                d11_ok = False
                d11_detail.append(sf)
        results.append((d11_ok, "纪律11-标签有效", "通过" if d11_ok else f"缺标签: {', '.join(d11_detail)}"))

        # 纪律 12: 版本/日期追踪
        d12_ok = True
        d12_detail = []
        for sf in sub_files:
            meta = all_metadata[sf]
            for field in ('created', 'updated'):
                val = meta.get(field, '')
                if not val:
                    d12_ok = False
                    d12_detail.append(f"{sf}: 缺 {field}")
                else:
                    try:
                        datetime.fromisoformat(str(val).replace('Z', '+00:00'))
                    except (ValueError, TypeError):
                        d12_ok = False
                        d12_detail.append(f"{sf}: {field} 格式无效")
        results.append((d12_ok, "纪律12-版本日期追踪", "通过" if d12_ok else "; ".join(d12_detail[:5])))

        return results

    # ------------------------------------------------------------------------
    # §10 格式强制要求校验（C-5，提示级 WARN，不计入 validate 通过 / 失败）
    # 来源：《WorkBuddy记忆文件说明.md》§10「记忆文件格式强制要求」14 条
    # ------------------------------------------------------------------------

    FORMAT_BANNED_WORDS = ['视情况', '一般', '通常', '酌情', '尽量',
                           '尽可能', '适当', '必要时', '原则上', '建议']

    def _check_format_requirements(self, sub_files: list) -> list:
        """按 §10 校验可自动化 / 半自动化条目（第 3、6、9、10 条）

        第 1、2、5、12 条须 Agent 判读，判读要点见该手册 §5 步骤4 C 段。
        返回 [(条目, 位置, 说明), ...]，全部为提示级，不改变校验结论。
        """
        findings = []
        targets = [(sf, join_paths(self.sub_files_dir, sf)) for sf in sub_files]
        if os.path.exists(self.main_file):
            # v5.2.4（B-13）：显示名取真实 basename（与 v5.2.2 P2-5「不硬编码显示名」
            # 及 `_check_main_file_structure` 的 main_display 口径一致）。
            targets.insert(0, (os.path.basename(self.main_file), self.main_file))

        for name, path in targets:
            content = self._read_file(path)
            lines = content.split('\n')
            # v5.2.3（双审计第二轮 N-3，成立）：`§X` 是**本手册**（WorkBuddy记忆文件说明.md）
            # 的条目编号标记。对本节的扫描对象（主文件 + 子记忆文件）而言，`§X` 恒为
            # **跨文件引用**；而手册 §10 第13条明定「第 10、11 条的引用方向约束仅作用于
            # 同一文件内部，跨文件引用不受方向约束」。原实现不区分，把子文件里的
            #「依 §10 第5条」判为前向引用——实测子文件2 的 4 处 `§10` 全属此类假阳性
            #（它们指向手册，非本文件章节）。故对非手册文件一律豁免方向判定；
            # 仅当被扫描对象就是本手册时（未来若纳入扫描）才启用。
            scan_direction = (name == MANUAL_FILE_NAME)

            # 标记代码块行，避免把示例/命令里的文本当成正文误报
            in_code = False
            code_flags = []
            for ln in lines:
                if ln.strip().startswith('```') or ln.strip().startswith('~~~'):
                    in_code = not in_code
                    code_flags.append(True)
                    continue
                code_flags.append(in_code)

            # 第 3 条：层级标记——检测「缩进 + 手动编号」伪装层级（篇级 H1 合法，不干预）
            for i, ln in enumerate(lines, 1):
                if code_flags[i - 1]:
                    continue
                if re.match(r'^[ \t]{2,}(?![-*+|>#])(\d+(?:\.\d+)*)[、.．]\s*\S', ln):
                    findings.append(('第3条 层级标记', f'{name}:{i}',
                                     f'疑似缩进伪装层级: {ln.strip()[:40]}'))

            # 第 6 条：常用前置——文首 40 行内应含索引（子文件称「速查索引」，主文件称「主索引」）
            head = '\n'.join(lines[:40])
            if not any(k in head for k in ('速查索引', '主索引', '索引表')):
                findings.append(('第6条 常用前置', f'{name}:1-40',
                                 '文首 40 行内未检出索引表（速查索引 / 主索引 / 索引表）'))

            # 第 9 条：无歧义——具名禁用词扫描
            for i, ln in enumerate(lines, 1):
                if code_flags[i - 1]:
                    continue
                # v5.2.2（P2-6）：跳过内联代码片段，避免示例文本 / 命令字面量误命中
                probe = strip_inline_code(ln)
                for w in self.FORMAT_BANNED_WORDS:
                    if w in probe:
                        findings.append(('第9条 禁用词', f'{name}:{i}',
                                         f'命中「{w}」: {ln.strip()[:40]}'))

            # 第 10 条：引用方向（半自动——列出全部前向引用，是否属导航豁免由 Agent 判定）
            # v5.2.3：非手册文件不参与（跨文件 `§X` 引用按 §10 第13条豁免，见上方说明）。
            if not scan_direction:
                continue
            cur_chapter = 0
            numbered = False
            chapter_is_nm = False   # 本文件是否 `## N-M` 体系（子文件）
            for i, ln in enumerate(lines, 1):
                if code_flags[i - 1]:
                    continue
                probe = strip_inline_code(ln)
                # v5.2.2（P1-6，成立）：子文件编号是 `## N-M`，其中 N 是**文件号**
                # （固定 1~6），M 才是本文件内的**章序**。原实现一律取 N 比较，
                # 导致「子文件2 内引用 §5-2（另一文件的章节）」被误报为前向引用。
                m_nm = re.match(r'^##\s+(\d+)[-.](\d+)', ln)
                m_n = re.match(r'^##\s+(\d+)(?![-.\d])', ln)
                if m_nm:
                    cur_chapter = int(m_nm.group(2))
                    chapter_is_nm = True
                    numbered = True
                    continue
                if m_n:
                    cur_chapter = int(m_n.group(1))
                    chapter_is_nm = False
                    numbered = True
                    continue
                if cur_chapter == 0:
                    continue
                for major, minor in re.findall(r'§(\d+)(?:[-.](\d+))?', probe):
                    # 子文件体系下，引用形如 `§5-2` 时参与比较的是其章序 2
                    tgt = int(minor) if (minor and chapter_is_nm) else int(major)
                    if tgt > cur_chapter:
                        sec = f'§{major}' + (f'.{minor}' if minor else '')
                        findings.append(('第10条 引用方向', f'{name}:{i}',
                                         f'前向引用 {sec}（所在章 {cur_chapter}）'
                                         f'——须判定是否属导航豁免，否则改为后序引用'))
            if not numbered:
                findings.append(('第10条 引用方向', f'{name}:-',
                                 '未检出「## N」数字编号章节，跳过方向判定'))

        return findings

    # ------------------------------------------------------------------------
    # selftest — 核心纯函数回归自测（v5.2.3 · 零依赖，不读写任何业务文件）
    # ------------------------------------------------------------------------

    def selftest(self) -> bool:
        """对核心纯函数跑回归断言（双审计两轮均指认「无单元测试」的落地）

        约束：**零外部依赖**（不引 pytest）、**不读写任何记忆文件**，只做内存断言，
        故可随时安全执行（不触发 §0.3 备份、不产生副作用）。

        覆盖两轮双审计中已被指认 / 已修复的关键点，防止回归：
          锚点换算 / 去编号（D-13）· YAML 反转义对称（v5.2.2 P0）· 行内注释剥离
          （v5.2.3 P1-1）· 越界判定（§0.17 同源）· 编号尾段容错（v5.2.3 P2-5）·
          环检测（v5.2.3 P1-2）· scope 逐条切分（v5.2.2 P0-2）· 内联代码剥离（N-5）。
        """
        checks = []

        def eq(label, got, want):
            checks.append((label, got == want, f'got={got!r} want={want!r}'))

        # 1) 锚点换算 / 去编号（GFM，§3 约定 3）
        eq('heading_to_anchor 中文混排', heading_to_anchor('3-10 gh 能力速查'), '3-10-gh-能力速查')
        eq('heading_to_anchor 去括号', heading_to_anchor('1-2 全局禁令（最高优先级）'),
           '1-2-全局禁令最高优先级')
        eq('strip_heading_number 连字符', strip_heading_number('3-13-3-1 git 推送失败的两类情形'),
           'git 推送失败的两类情形')
        eq('strip_heading_number 点号', strip_heading_number('7.1 认证'), '认证')

        # 2) YAML 读写对称反转义（v5.2.2 P0-1）
        src = 'a"b\\c'
        written = src.replace('\\', '\\\\').replace('"', '\\"')
        eq('unescape 往返对称', unescape_yaml_scalar(written), src)
        eq('unescape 不吞普通转义', unescape_yaml_scalar(r'a\nb'), r'a\nb')

        # 3) YAML 行内注释剥离（v5.2.3 P1-1）
        eq('行内注释-未加引号', strip_yaml_inline_comment('value # 这是注释'), 'value')
        eq('行内注释-加引号保留值内#', strip_yaml_inline_comment('"v # x" # c'), '"v # x"')
        eq('行内注释-无注释不动', strip_yaml_inline_comment('a；b；c'), 'a；b；c')

        # 4) 越界判定（§0.17 白名单同源）
        eq('extract 子文件', extract_target_filename('file:///D:/x/Memory-a.md#1-2'), 'Memory-a.md')
        eq('extract 主文件', extract_target_filename('file:///C:/x/MEMORY.md'), 'MEMORY.md')
        eq('extract 外部链接返回 None', extract_target_filename('https://a.b/c'), None)
        eq('白名单含本手册', MANUAL_FILE_NAME in ALLOWED_EXTRA_TARGETS, True)

        # 5) 编号尾段解析容错（v5.2.3 P2-5）
        eq('编号后有空格', self._parse_num_tail('## 2-3 标题'), 3)
        eq('编号后无空格', self._parse_num_tail('## 2-3标题'), 3)
        eq('三级编号取末段', self._parse_num_tail('### 1-2-3小节'), 3)
        eq('非编号标题返回 None', self._parse_num_tail('## 总则'), None)

        # 6) 环检测（v5.2.3 P1-2 / P3-1：迭代实现，无递归深度上限）
        eq('三元长环', len(find_cycles({'A': {'B'}, 'B': {'C'}, 'C': {'A'}})), 1)
        eq('双独立环', len(find_cycles(
            {'A': {'B'}, 'B': {'C'}, 'C': {'B'}, 'D': {'E'}, 'E': {'D'}})), 2)
        eq('长链末端成环', len(find_cycles({'A': {'B'}, 'B': {'C'}, 'C': {'D'}, 'D': {'B'}})), 1)
        eq('无环', find_cycles({'A': {'B'}, 'B': {'C'}, 'C': set()}), [])
        eq('自环不入图（构图已排除）', find_cycles(self._build_sub_ref_graph(
            ['Memory-A.md'], {'Memory-A.md': '[x](file:///D:/Memory-A.md#1-1)'})), [])
        eq('3000 节点深链不触发递归上限',
           len(find_cycles(dict([(f'N{i}', {f'N{i+1}'}) for i in range(3000)] + [('N3000', set())]))), 0)

        # 7) scope 逐条切分（v5.2.2 P0-2）
        eq('scope 全角分号切分', self._split_scope_entries('scope_in', 'a；b；c'), ['a', 'b', 'c'])
        eq('非 scope 字段不切分', self._split_scope_entries('theme', 'a；b'), ['a；b'])

        # 8) 内联代码剥离（v5.2.3 N-5：双反引号不再漏网）
        eq('剥离单反引号', strip_inline_code('这是 `必要时` 示例'), '这是  示例')
        eq('剥离双反引号（含内部单引号）', strip_inline_code('这是 ``a ` 必要时`` 示例'), '这是  示例')

        # 9) v5.2.4（Round1 B-10）：原子写回归锁 —— 本轮最高危改动此前无任何断言。
        #    仍只用 tempfile，不触碰任何业务文件。
        tmp_dir = tempfile.mkdtemp(prefix='mem_selftest_')
        try:
            tp = os.path.join(tmp_dir, 'x.md')
            with open(tp, 'w', encoding='utf-8') as _f:
                _f.write('原\n')
            ok_w = self._write_file(tp, '新\n')
            with open(tp, encoding='utf-8') as _f:
                after = _f.read()
            leftover = [f for f in os.listdir(tmp_dir) if f.endswith('.tmp')]
            eq('原子写-成功路径返回 True', ok_w, True)
            eq('原子写-成功路径内容正确', after, '新\n')
            eq('原子写-成功路径无 .tmp 残留', leftover, [])
            # 制造 .tmp 写入失败（同名目录），断言失败路径
            os.makedirs(tp + '.tmp')
            ok_f = self._write_file(tp, '不该写入\n')
            with open(tp, encoding='utf-8') as _f:
                after2 = _f.read()
            eq('原子写-失败路径返回 False', ok_f, False)
            eq('原子写-失败路径原文件一字不动', after2, '新\n')
        except Exception as e:      # v5.2.4：断言不再因异常中断整个 selftest
            checks.append(('原子写回归锁', False, f'异常: {type(e).__name__}: {e}'))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        # 10) v5.2.4（B-10）：环**内容**断言 —— 原只校验数量，环路径错配仍会通过
        eq('环内容正确（非仅数量）', find_cycles({'A': {'B'}, 'B': {'C'}, 'C': {'A'}}),
           [['A', 'B', 'C', 'A']])

        passed = sum(1 for _, ok, _ in checks if ok)
        print("\n" + "=" * 68)
        print("selftest — 核心纯函数回归自测（v5.2.3 · 零依赖 · 不读写业务文件）")
        print("=" * 68)
        for label, ok, detail in checks:
            print(f"  {'✅' if ok else '❌'} {label}" + ('' if ok else f"  —— {detail}"))
        print("=" * 68)
        print(f"[{'OK' if passed == len(checks) else 'FAIL'}] {passed}/{len(checks)} 项通过")
        return passed == len(checks)

    # ------------------------------------------------------------------------
    # sync — 同步状态文件（v2.0.0: 同步 YAML 元数据、清理残留）
    # ------------------------------------------------------------------------

    def sync(self, target_file: str = None, force: bool = False):
        """同步状态文件（扫描磁盘文件，对比 state，更新差异）"""
        sub_files = self._list_sub_files()
        if target_file:
            if target_file not in sub_files:
                print(f"[ERROR] 指定文件不存在于子文件目录: {target_file}")
                return
            sub_files = [target_file]

        updated = []
        unchanged = []
        details = []
        for sub_file in sub_files:
            filepath = join_paths(self.sub_files_dir, sub_file)
            content = self._read_file(filepath)
            metadata, _ = self._parse_yaml_frontmatter(content)
            chapters = self._extract_chapters(content)
            computed = self._compute_offsets_dict(chapters)

            # C-4: 忠实区分「章节偏移有变」「元数据有变」「--force 强制」「无变化」四类，
            #      避免旧版"声称同步 N 个、实际只变 1 个"的输出不忠实问题
            offset_changed = computed != self.state.get('chapter_offsets', {}).get(sub_file, {})
            entry = None
            for sf in self.state.get('sub_files', []):
                if sf['filename'] == sub_file:
                    entry = sf
                    break
            if entry is None:
                meta_changed = True
            else:
                meta_changed = (
                    entry.get('display_name') != metadata.get('title', sub_file)
                    or normalize_list(entry.get('tags')) != normalize_list(metadata.get('tags'))
                    or normalize_list(entry.get('related')) != normalize_list(metadata.get('related'))
                )

            need_update = force or offset_changed or meta_changed
            if need_update:
                self._update_chapter_offsets(sub_file, chapters)
                updated.append(sub_file)
                kinds = []
                if offset_changed:
                    kinds.append('章节偏移有变')
                if meta_changed:
                    kinds.append('元数据有变')
                if force and not kinds:
                    kinds.append('--force 强制重写')
                details.append(f"{sub_file}（{'、'.join(kinds)}）")
                for sf in self.state['sub_files']:
                    if sf['filename'] == sub_file:
                        sf['chapters'] = chapters
                        sf['lines_total'] = len(content.split('\n'))
                        # v2.0.0: 同步 YAML 元数据
                        sf['display_name'] = metadata.get('title', sub_file)
                        sf['tags'] = normalize_list(metadata.get('tags'))
                        sf['related'] = normalize_list(metadata.get('related'))
                        break
                else:
                    self.state['sub_files'].append({
                        'filename': sub_file,
                        'display_name': metadata.get('title', sub_file),
                        'chapters': chapters,
                        'lines_total': len(content.split('\n')),
                        'tags': normalize_list(metadata.get('tags')),
                        'related': normalize_list(metadata.get('related'))
                    })
            else:
                unchanged.append(sub_file)

        # 清理已删除文件的状态残留：必须以磁盘实际存在的全部子文件为准，
        # 而非被 target_file 过滤后的 sub_files，否则 sync --file X 会误删其他文件状态
        present = set(self._list_sub_files())
        self.state['sub_files'] = [sf for sf in self.state.get('sub_files', [])
                                   if sf['filename'] in present]
        for k in list(self.state.get('chapter_offsets', {}).keys()):
            if k not in present:
                del self.state['chapter_offsets'][k]

        # C-4: 忠实输出——逐文件列出变更类型，并声明主文件是否被索引重建改动
        main_before = self._read_file(self.main_file) if os.path.exists(self.main_file) else ''
        if updated:
            self._save_state()
            self.index(record=False)
            main_after = self._read_file(self.main_file) if os.path.exists(self.main_file) else ''
            main_changed = main_before != main_after
            self._add_changelog_entry('sync', ', '.join(updated) if updated else '(无变更)', 'agent',
                                      '同步状态文件与实际文件')
            print(f"[OK] 实际更新 {len(updated)}/{len(sub_files)} 个子文件:")
            for d in details:
                print(f"       - {d}")
            if unchanged:
                print(f"[OK] 无变化 {len(unchanged)} 个（未重写）: {', '.join(unchanged)}")
            print(f"[OK] 主文件主索引已重建: {'内容有变更' if main_changed else '内容无变化'}")
        else:
            self._save_state()
            print(f"[OK] {len(sub_files)} 个子文件均无变化（未更新任何子文件）")
            print("[OK] 状态文件已写入；未触发索引重建，主文件未被改动")

    # ------------------------------------------------------------------------
    # changelog — 查看变更历史（v2.0.0: git 增强）
    # ------------------------------------------------------------------------

    def changelog(self, days: int = 7, limit: int = 10, json_output: bool = False, filename: str = None,
                  show: str = None):
        """查看变更历史（自包含，git 可用时显示 commit 信息）

        show: 指定 commit 时调用 git show 查看该版本单文件/全量内容（对话.txt 七、git show 能力）
        """
        # 单版本查看（git show 能力）
        if show:
            if not self._git_available():
                print("[WARN] git 不可用，无法查看历史版本（可手动依据 memory-changelog.json 追溯）")
            else:
                content = self._git_show(show, filepath=filename)
                if content:
                    print(f"\n{'='*60}\nGit Show: {show}{(' @ ' + filename) if filename else ''}\n{'='*60}")
                    print(content[:8000])
                    if len(content) > 8000:
                        print(f"... (截断，共 {len(content)} 字符)")
                else:
                    print(f"[WARN] 未获取到 {show} 的内容（commit 不存在或 git 不可用）")
            return
        entries = self._load_changelog()
        if not isinstance(limit, int) or limit <= 0:
            limit = 10
        if filename:
            entries = [e for e in entries if e.get('target_file') == filename]
        if days == 0:
            today = datetime.now(timezone.utc).date()
            recent = [e for e in entries
                      if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')).date() == today]
        else:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            recent = [e for e in entries
                      if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) >= cutoff]
        recent = recent[-limit:]

        # v2.0.0: git 增强（如果可用，获取 git log 补充信息）
        git_logs = self._git_log(filepath=filename, limit=limit) if self._git_available() else []

        if json_output:
            output = {'changelog': recent, 'git_log': git_logs}
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return

        if not recent and not git_logs:
            print("[INFO] 最近没有变更记录")
            return

        if recent:
            print(f"最近 {len(recent)} 条变更记录:\n")
            for entry in recent:
                print(f"ID: {entry['id']}")
                print(f"时间: {entry['timestamp']}")
                print(f"操作: {entry['action']}")
                print(f"文件: {entry['target_file']}")
                print(f"发起者: {entry['initiator']}")
                print(f"摘要: {entry['summary']}")
                if entry.get('git_commit'):
                    print(f"Git: {entry['git_commit'][:12]}")
                print("-" * 40)

        if git_logs:
            print(f"\nGit 提交记录 ({len(git_logs)} 条):")
            for log in git_logs:
                print(f"  {log}")

    # ------------------------------------------------------------------------
    # diff — 比较版本差异（v2.0.0: git 可用时使用 git diff）
    # ------------------------------------------------------------------------

    def diff(self, before: str = None, after: str = None, filename: str = None, verbose: bool = False):
        """比较变更差异（git 可用时使用 git diff，否则基于 changelog）"""
        entries = self._load_changelog()
        if not entries:
            print("[INFO] 没有变更记录可比较")
            return

        # 解析时间窗口
        def _parse_ts(s):
            if not s:
                return None
            try:
                return datetime.fromisoformat(s.replace('Z', '+00:00'))
            except ValueError:
                try:
                    return datetime.fromisoformat(s + 'T00:00:00+00:00')
                except ValueError:
                    return None

        ts_before = _parse_ts(before)
        ts_after = _parse_ts(after)
        if ts_after is not None and after and 'T' not in after:
            ts_after = ts_after.replace(hour=23, minute=59, second=59, microsecond=999999)

        if ts_before or ts_after:
            filtered = []
            for e in entries:
                try:
                    et = datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00'))
                except ValueError:
                    continue
                if ts_before and et < ts_before:
                    continue
                if ts_after and et > ts_after:
                    continue
                filtered.append(e)
            entries = filtered

        if filename:
            entries = [e for e in entries if e.get('target_file') == filename]

        # v2.0.0: git 增强（如果 before/after 像 commit hash 且 git 可用，直接 git diff）
        git_diff_output = ""
        if self._git_available() and before and re.match(r'^[0-9a-f]{7,}$', before):
            git_diff_output = self._git_diff(before=before, after=after, filepath=filename)

        print(f"\n{'='*60}")
        print(f"变更差异 (共 {len(entries)} 条"
              + (f"，窗口 {before or '…'} ~ {after or '…'}" if (before or after) else "")
              + (f"，文件 {filename}" if filename else "") + ")")
        print(f"{'='*60}")

        added = [e['target_file'] for e in entries if e['action'] == 'add']
        removed = [e['target_file'] for e in entries if e['action'] == 'remove']
        others = [e['target_file'] for e in entries if e['action'] not in ('add', 'remove')]
        print(f"新增: {len(added)} 个 -> {', '.join(added) if added else '无'}")
        print(f"删除: {len(removed)} 个 -> {', '.join(removed) if removed else '无'}")
        print(f"其他操作: {len(others)} 个 -> {', '.join(others) if others else '无'}")
        print(f"{'-'*60}")

        if verbose or not (added or removed):
            for i, entry in enumerate(entries, 1):
                print(f"--- 变更 #{i} ---")
                print(f"操作: {entry['action']}")
                print(f"文件: {entry['target_file']}")
                print(f"时间: {entry['timestamp']}")
                if entry.get('summary'):
                    print(f"摘要: {entry['summary']}")
                if entry.get('git_commit'):
                    print(f"Git: {entry['git_commit'][:12]}")
                if verbose and entry.get('details'):
                    print("详细信息:")
                    print(json.dumps(entry['details'], ensure_ascii=False, indent=2))
                print("-" * 40)

        if git_diff_output:
            print(f"\n{'='*60}")
            print("Git Diff:")
            print(f"{'='*60}")
            print(git_diff_output[:5000])
            if len(git_diff_output) > 5000:
                print(f"... (截断，共 {len(git_diff_output)} 字符)")

    # ------------------------------------------------------------------------
    # restore — 回滚到历史版本（v3.1.0: 对话.txt 七、git restore 能力）
    # ------------------------------------------------------------------------

    def restore(self, filename: str, commit: str, force: bool = False):
        """回滚子文件到指定 git 历史版本（git restore 能力封装）

        - 非 --force 时仅警告并退出（不阻断 Agent 自动化流程）
        - --force 时先创建 .bak 备份，再 git checkout 到目标 commit
        """
        try:
            safe = self._safe_filename(filename)
        except ValueError as e:
            print(f"[ERROR] {e}")
            return False
        filepath = join_paths(self.sub_files_dir, safe)
        return self._git_restore(commit, filepath, force=force)



# ============================================================================
# CLI 入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        prog='memory-mgr.py',
        description='MEMORY.md 多文件记忆系统维护工具 v5.3.0',
        epilog='示例: python memory-mgr.py check --verbose'
    )
    parser.add_argument('--main-file', help='主记忆文件路径（不指定则交互式确认）')
    parser.add_argument('--sub-files-dir', help='子文件目录路径（不指定则交互式确认）')
    parser.add_argument('--no-interactive', action='store_true',
                        help='非交互模式（Agent 调用时使用，跳过路径确认提示）')
    parser.add_argument('-v', '--verbose', action='store_true', help='详细输出')
    parser.add_argument('--dry-run', action='store_true', help='仅预览，不实际执行')

    subparsers = parser.add_subparsers(dest='command', help='可用命令')

    # check
    p = subparsers.add_parser('check', help='双向完整性检查')
    p.add_argument('--verbose', '-v', action='store_true')
    p.add_argument('--fix', action='store_true',
                   help='（已按手册 §0.2 停用）仅输出待核清单，不执行任何自动修改')

    # index
    p = subparsers.add_parser('index', help='生成/更新索引表')
    p.add_argument('--file', help='仅更新指定子文件')
    p.add_argument('--force', action='store_true', help='强制重新生成')

    # add
    p = subparsers.add_parser('add', help='创建新子文件')
    p.add_argument('--topic', required=True)
    p.add_argument('--content', help='内容（字符串、文件路径或 - 表示 stdin）')
    p.add_argument('--title', help='标题（H2 标题，如不指定则从 topic 自动生成）')
    p.add_argument('--summary', help='摘要（YAML frontmatter 的 summary 字段）')
    p.add_argument('--start-number', type=int)
    p.add_argument('--related', help='关联文件（逗号分隔）')
    p.add_argument('--tags', help='标签（逗号分隔）')
    p.add_argument('--positioning', help='四要素1 定位（一句话：这个文件是什么）')
    p.add_argument('--role', help='四要素2 角色（承担哪一层职能，如 硬约束层/作业流程层）')
    p.add_argument('--theme', help='四要素3 主题（覆盖的领域范围，用 / 分隔）')
    p.add_argument('--scope-in', dest='scope_in', help='四要素4 收录范围 in-scope（用 ； 分隔）')
    p.add_argument('--scope-out', dest='scope_out',
                   help='四要素5 不收录范围 out-of-scope（须用 → 指向应去的子文件）')
    p.add_argument('--dry-run', action='store_true', help='仅预览，不实际执行')

    # remove
    p = subparsers.add_parser('remove', help='删除子文件')
    p.add_argument('--file', required=True)
    p.add_argument('--force', action='store_true')
    p.add_argument('--dry-run', action='store_true')

    # rewrite
    p = subparsers.add_parser('rewrite', help='重新计算章节编号')
    p.add_argument('--file', help='仅重新编号指定文件')
    p.add_argument('--dry-run', action='store_true', help='仅预览，不实际执行')

    # number（v5.0.0）
    p = subparsers.add_parser('number', help='批量分配 / 校正 YAML file_number（迁移用）')
    p.add_argument('--init', action='store_true', help='按「首个 H2 旧编号」升序分配（仅补齐缺失）')
    p.add_argument('--force', action='store_true', help='忽略现有值，整体重排为 1..n')
    p.add_argument('--dry-run', action='store_true', help='仅预览，不实际执行')

    # get-offset
    p = subparsers.add_parser('get-offset', help='返回章节行号范围')
    p.add_argument('--file', required=True)
    p.add_argument('--section', required=True)
    p.add_argument('--json', action='store_true')

    # route（v5.2.1）
    p = subparsers.add_parser('route', help='归属判定 / 读前精判（按四要素打分，只读）')
    p.add_argument('--query', required=True, help='自然语言查询，或待入库内容的一句话摘要')
    p.add_argument('--intent', choices=['read', 'write'], default='read',
                   help='read=读前精判（默认）；write=写前入库判定（额外输出 scope_out 反向信号）')
    p.add_argument('--top', type=int, default=3, help='返回候选个数（默认 3）')
    p.add_argument('--json', action='store_true', help='JSON 格式输出')

    # next-num（v5.2.1）
    p = subparsers.add_parser('next-num', help='下一个可用编号 + 插章路径判定（只读）')
    p.add_argument('--file', required=True, help='目标子文件名')
    p.add_argument('--level', type=int, choices=[2, 3, 4], default=2,
                   help='标题层级：2=章（默认）；3=节，需 --after 指定父 H2；4=小节，需 --after 指定父 H3')
    p.add_argument('--after', help='插入位置：所属父标题编号（level 2 时为本文件最后一个 H2 编号）')
    p.add_argument('--json', action='store_true', help='JSON 格式输出')

    # verify（v5.2.1）
    p = subparsers.add_parser('verify', help='五项验收一键化（手册 §5 标准审计流程）')
    p.add_argument('--skip-git', action='store_true', help='跳过第 5 项 git status 检查')

    # validate
    p = subparsers.add_parser('validate', help='综合校验')
    p.add_argument('--strict', action='store_true')
    p.add_argument('--auto-fix', action='store_true')

    # sync
    p = subparsers.add_parser('sync', help='同步状态文件')
    p.add_argument('--file', help='仅同步指定文件')
    p.add_argument('--force', action='store_true')

    # changelog
    p = subparsers.add_parser('changelog', help='查看变更历史')
    p.add_argument('--days', type=int, default=7)
    p.add_argument('--file', help='查看指定文件')
    p.add_argument('--limit', type=int, default=10)
    p.add_argument('--json', action='store_true', help='JSON 格式输出')
    p.add_argument('--show', help='查看指定 commit 的单版本内容（git show 能力，对话.txt 七、）')

    # diff
    p = subparsers.add_parser('diff', help='比较版本差异')
    p.add_argument('--before', help='基准版本（日期或 commit hash）')
    p.add_argument('--after', help='目标版本（日期或 commit hash）')
    p.add_argument('--file', help='仅比较指定文件')
    p.add_argument('--verbose', '-v', action='store_true')

    # restore（git restore 能力，对话.txt 七、）
    p = subparsers.add_parser('restore', help='回滚文件到历史版本（git 能力，需 --force）')
    p.add_argument('--file', required=True, help='目标子文件名')
    p.add_argument('--commit', required=True, help='目标 commit hash')
    p.add_argument('--force', action='store_true', help='确认执行破坏性回滚（先 .bak 备份）')

    # selftest
    subparsers.add_parser('selftest', help='核心纯函数回归自测（v5.2.3，零依赖、不读写业务文件）')

    # help
    p_help = subparsers.add_parser('help', help='显示帮助信息')
    p_help.add_argument('subcommand', nargs='?', help='指定子命令显示详细帮助')

    args = parser.parse_args()

    if not args.command or args.command == 'help':
        sub = getattr(args, 'subcommand', None)
        if sub and sub in subparsers.choices:
            subparsers.choices[sub].print_help()
            return 0
        parser.print_help()
        return 0

    # 路径处理（v5.3.0 重写）：启动期解析 → 校验 → 通过则本地记录复用
    #   优先级：命令行 --main-file/--sub-files-dir
    #            > 本地记录 memory-paths.json（仍须通过校验才采用）
    #            > 默认推导（主文件=用户目录/.workbuddy/MEMORY.md；子目录=脚本同目录）
    #   校验不通过：向 Agent 输出精准诊断 + 修正指令，退出码 2 中止，不执行任何命令。
    #   selftest 例外：纯函数断言、不读写记忆文件，无需路径校验。
    if args.command == 'selftest':
        main_file = args.main_file or default_main_file()
        sub_files_dir = args.sub_files_dir or default_sub_files_dir()
    else:
        resolved = resolve_paths(args.main_file, args.sub_files_dir,
                                 no_interactive=args.no_interactive,
                                 verbose=args.verbose)
        if resolved is None:
            return 2
        main_file, sub_files_dir = resolved

    mgr = MemoryManager(main_file, sub_files_dir)

    if args.command == 'check':
        ok = mgr.check(args.verbose, args.fix)
        sys.exit(0 if ok else 1)
    elif args.command == 'index':
        mgr.index(args.force, args.file)
    elif args.command == 'add':
        content = args.content
        if content and os.path.exists(content):
            with open(content, 'r', encoding='utf-8') as f:
                content = f.read()
        elif content == '-':
            content = sys.stdin.read()
        # 修复：原为位置参数传参，导致 --title / --summary 静默失效；改为关键字传递并补四要素
        ok = mgr.add(args.topic, content,
                     start_number=args.start_number, related=args.related,
                     tags=args.tags, dry_run=args.dry_run,
                     title=args.title, summary=args.summary,
                     positioning=args.positioning, role=args.role,
                     theme=args.theme, scope_in=args.scope_in,
                     scope_out=args.scope_out)
        sys.exit(0 if ok is not False else 1)
    elif args.command == 'remove':
        ok = mgr.remove(args.file, args.force, args.dry_run)
        sys.exit(0 if ok is not False else 1)
    elif args.command == 'rewrite':
        mgr.rewrite(args.file, args.dry_run)
    elif args.command == 'number':
        if not args.init:
            print("[ERROR] 请指定 --init（本命令用于一次性迁移，批量分配 file_number）")
            sys.exit(2)
        mgr.number_init(args.dry_run, args.force)
    elif args.command == 'get-offset':
        mgr.get_offset(args.file, args.section, args.json)
    elif args.command == 'route':
        mgr.route(args.query, args.intent, args.json, args.top)
    elif args.command == 'next-num':
        mgr.next_num(args.file, args.level, args.after, args.json)
    elif args.command == 'verify':
        ok = mgr.verify(args.skip_git)
        sys.exit(0 if ok else 1)
    elif args.command == 'validate':
        ok = mgr.validate(args.strict, args.auto_fix)
        sys.exit(0 if ok else 1)
    elif args.command == 'sync':
        mgr.sync(args.file, args.force)
    elif args.command == 'changelog':
        days = args.days if args.days > 0 else 0
        mgr.changelog(days, args.limit, args.json, args.file, args.show)
    elif args.command == 'diff':
        mgr.diff(args.before, args.after, args.file, args.verbose)
    elif args.command == 'restore':
        ok = mgr.restore(args.file, args.commit, args.force)
        sys.exit(0 if ok is not False else 1)
    elif args.command == 'selftest':
        sys.exit(0 if mgr.selftest() else 1)

    sys.exit(0)


if __name__ == '__main__':
    sys.exit(main())
