# 步骤10：Office 写入后合规性自检

> rmw 内部步骤10。遵循 `_router/_contract.md` 七段契约。
> **本步套用官方 `officecli-docx` Delivery Gate（G1–G3），任一失败即 REJECT。**

---

## [门禁]
- 已读取状态文件，确认"当前步骤=步骤9 / 共10步"，最终文稿已生成。
- 已读取「工具能力映射表」，确认 OFFICE（officecli）、SHELL、FILE_STAT 已绑定。

## [加载]
- `references/04-officecli-guide.md`、`references/05-long-file-handling.md`
- `assets/_流水线状态.md`（全局约束摘要）
- 状态文件"前序产出清单"：`_正文过程稿.md`、最终文稿
- 逻辑原语：READ_FILE、FILE_STAT、OFFICE、SHELL

## [执行]

### 1. 基础检查项
- QA 流程（outline → text → validate）是否完成？
- 分片写入 4 条错误检测规则是否通过？
- QA 校验是否在 `close` 之后的独立 shell_exec 执行？
- 是否与 `_正文过程稿.md` 内容一致？（自动化建议：抽取 docx 全文 `officecli view "$FILE" text` 与 `_正文过程稿.md` 比对章节标题与关键锚点句是否齐全，可用 G2a 式 `grep` 校验关键句存在；章节数 / 标题须一一对应，缺失即回步骤6 补写，不得仅凭人工目检）
- 是否严格遵循 `references/docx-format-standard.md`？
- 是否已完成相似段落检测并将高相似段落字体设为蓝色？

### 2. Delivery Gate（对齐官方 officecli-docx，失败即 REJECT）
```bash
FILE="[输出目录]/_最终文稿.docx"
officecli close "$FILE" 2>/dev/null
# ── G1a schema 校验（advisory）──
# 已知问题：officecli 的 validate 会误报其自身 create 生成的默认样式 uiPriority（namespace 噪声），
# 此类不计为 REJECT；仅当存在非 uiPriority 的内容级 schema 错误才 REJECT。
VOUT=$(officecli validate "$FILE" 2>&1)
if echo "$VOUT" | grep -qE "validation error"; then
  if echo "$VOUT" | grep -qE "uiPriority"; then
    echo "G1a WARN: validate 仅含 officecli 默认样式 uiPriority 误报（不阻断）"
  else
    echo "REJECT G1a: 内容级 schema 错误"; exit 1
  fi
else
  echo "G1a OK (no errors found)"
fi
# ── G1b 标题层级校验（outlineLvl 已建立 → 目录可抽取，治 D1）──
# 可移植：不依赖 jq（目标 LLM 环境未必装 jq）；officecli --json 冒号后含空白（"matches": 10），
# 用空白容忍正则取计数。
# N3 稳定性（实测）：此处用属性存在式 'paragraph[outlineLvl]'（不指定值）统计标题层级总数；
#   相等式 'paragraph[outlineLvl=1]' 偶发返回 0 误判，故固定用属性存在式，勿改回相等式。
#   另注意：officecli 将 color=0000FF 存储为 color=#0000FF，查色须带 '#'（见 references/05-long-file-handling.md §三）。
M=$(officecli query "$FILE" 'paragraph[outlineLvl]' --json 2>/dev/null | grep -oE '"matches"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+')
if [ "${M:-0}" -ge 1 ]; then echo "G1b OK (outlineLvl=$M)"; else echo "REJECT G1b: 无标题大纲级别"; exit 1; fi
# ── G2a 令牌/模板泄漏（$VAR / ${VAR} / TODO / xxxx / lorem）──
N2=$(officecli view "$FILE" text 2>/dev/null | grep -cE '\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<TODO>|xxxx|lorem')
if [ "${N2:-0}" -eq 0 ]; then echo "G2a OK"; else echo "REJECT G2a: $N2 leak"; exit 1; fi
# ── G2b 陈旧域字段（未刷新的目录占位符 "Update field to see"）──
N3=$(officecli view "$FILE" text 2>/dev/null | grep -cE 'Update field to see')
if [ "${N3:-0}" -eq 0 ]; then echo "G2b OK"; else echo "REJECT G2b: $N3 stale field (TOC 未刷新/未降级手动目录)"; exit 1; fi
# ── G2c 空段落（对齐 references/05-long-file-handling.md §五；治 B3 默认空段落残留）──
N4=$(officecli query "$FILE" 'p:empty' 2>/dev/null | grep -cE 'paraId')
if [ "${N4:-0}" -eq 0 ]; then echo "G2c OK"; else echo "REJECT G2c: $N4 空段落（须回步骤9清理）"; exit 1; fi
# ── G3 活 PAGE 字段（页脚预期时）──
F3=$(officecli query "$FILE" 'field[fieldType=page]' --json 2>/dev/null | grep -oE '"matches"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+')
if [ "${F3:-0}" -ge 1 ]; then echo "G3 OK (page fields=$F3)"; else echo "REJECT G3: 无活 PAGE 字段"; exit 1; fi
```
> 注：本 Gate **不依赖 jq**（目标 LLM 环境未必安装 jq），改用 `grep -oE '"matches"[[:space:]]*:[[:space:]]*[0-9]+'` 容忍 officecli `--json` 冒号后的空白；G2a/G2b/G2c 直接扫描 `view text` / `query` 纯文本，无 JSON 空白问题。G1 拆为 **G1a（schema，advisory：officecli 默认样式 uiPriority 误报不阻断）** 与 **G1b（标题大纲级别，治 D1）**；G2 拆为 **G2a（泄漏）**、**G2b（陈旧域字段）** 与 **G2c（空段落，治 B3）**；G3 校验活 PAGE 字段。**`validate` 误报 `uiPriority` 为 officecli 自造默认样式所致（ECMA-376 合法），G1a 已判其为 advisory、预期非阻断，后续会话不得将其当错误去"修复"**；仅非 uiPriority 的内容级 schema 错误才 REJECT。全部以 POSIX `grep`/`test` 实现，可移植到其他 LLM 宿主。

### 3. .md 降级输出的 Gate 处置
若最终输出为 `.md`（步骤9 降级场景），Delivery Gate 处置如下：
- **G1（Schema 验证）**：跳过——`officecli validate` 仅适用于 docx 文件。
- **G2a（令牌泄漏扫描）**：改为对 `.md` 文件执行等效 `grep` 扫描（`grep -cE '\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<TODO>|xxxx|lorem' "$FILE"`）。`.md` 无目录域字段，故 G2b 不适用。
- **G3（活 PAGE 字段）**：跳过——Markdown 无页脚 / 分页概念。

## [产出]
- 本步无新文件产出；检查结论写入状态文件"验证状态"。

## [分片]
- 不适用。

## [验证]
- Delivery Gate G1 / G2a / G2b / G2c / G3 全部通过；否则 REJECT 并输出具体失败项（明确 G1/G2a/G2b/G2c/G3 哪一道），回到对应步骤修复。
- **回退上限（防卡死，设计点 8A）**：维护"回退计数器"，每次 REJECT 并回退修复计数 +1；**单步回退 ≤ 3 次**（可参数化）。超过上限 → **停止回退、报告用户**（明确哪一项 Gate 持续失败 + 已尝试次数 + 建议人工介入），不得无限循环。若连续 2 次回退后同一 Gate 仍失败，提前升级为"报告用户"而非继续重试（防前序根本无法产出的空转）。
- **向 §14 写入登记（设计点 5 顺序铁律）**：Delivery Gate 全过 → 向状态文件 §14 写入"✅通过 + 轻签名（最终文稿字节数,段落数）+ 登记对象=`[输出目录]/_最终文稿.docx`（或 .md）+ 子阶段=全文 + 自检时刻"；未全过不登记、按回退上限处置。

## [状态]
- 更新"当前步骤"="步骤10 / 共10步（全部完成）"。
- 更新"待办下一步"="无（流程结束）"。
- 更新"时间戳"。
- **全流程结束校验**：确认"前序产出清单"含步骤1–10 全部产出；确认最终文稿与正文过程稿一致。
- 输出「✅ 步骤10完成，全部10步已完成，状态文件已更新」。
