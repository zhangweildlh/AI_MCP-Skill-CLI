---
name: open-code-review-delegate
description: >
  基于 alibaba/open-code-review（OCR）「委托模式(delegate)」的代码审查技能。OCR 仅承担确定性工程（文件筛选、审查规则解析），实际审查由宿主智能体(WorkBuddy)以自身能力完成，OCR 侧无需 LLM Key。当用户提出以下意图时自动激活：代码审查、审查代码、code review、审查改动、审查提交、审查分支、审查 PR、审查工作区、评审代码、查 bug、找 bug、安全漏洞、代码质量、代码评审、委托审查、delegate、open-code-review、ocr、审查规则、review rules、AI 审查、帮我看看这段代码。全面覆盖 open-code-review 全部功能（delegate 委托 / review 评审 / scan 扫描 / rules 规则 / config 配置 / llm 连通性测试 / viewer 报告查看 / session 会话），最终以格式化 JSON 输出审查结果。
license: Apache-2.0
compatibility: >
  需在本地安装 ocr CLI（npm install -g @alibaba-group/open-code-review）。委托模式(delegate)完全无需 LLM；review / scan 需预先配置 LLM（环境变量或 ocr config set）。
metadata:
  author: alibaba（由 WorkBuddy 适配增强为中文标准版）
  homepage: https://github.com/alibaba/open-code-review
  version: "1.1.0"
---

# Open Code Review — 委托模式（Delegation Mode）

本技能以「委托模式」使用 alibaba/open-code-review（`ocr`）：OCR 做确定性工程，宿主智能体做审查判断。调用路径为纯命令行（Bash），即「路径 B」，不经过 MCP。

## 一、前置检查与自动安装

每次启动先确认环境：

```bash
# 1. 检查 CLI 是否已安装
which ocr || echo "NOT INSTALLED"
npx @alibaba-group/open-code-review --version
```

若未安装，自动安装（视为常规设置步骤，**无需询问用户**）：

```bash
npm install -g --allow-scripts=@alibaba-group/open-code-review @alibaba-group/open-code-review
```

或 Win11 CMD/Powershell 中自动安装（**无需询问用户**）：

```Powershell
npm install -g --allow-scripts=@alibaba-group/open-code-review @alibaba-group/open-code-review
```

> 自动安装后需要第二次确认环境，检查 CLI 是否已安装：`npx @alibaba-group/open-code-review --version`
> 安装后 `ocr` 位于 Node 全局 bin（使用命令 `npm root -g` 获取实际的 Node 全局 bin）。若当前 shell 的 PATH 未包含该目录，调用前执行：
> `export PATH="$PATH:/d/Tools/Assembly/nodejs/node_global:/d/Tools/Assembly/nodejs"`

**LLM 连通性（仅当使用 review / scan 时才需要）**：

```bash
ocr llm test
```

若 `ocr llm test` 失败，**不要编造或硬编码任何 API Key**，停下并向用户展示两种配置方式后等待：

- 方式 A（环境变量，优先级最高，适合 CI）：
  ```bash
  export OCR_LLM_URL=https://api.anthropic.com/v1/messages
  export OCR_LLM_TOKEN=<api-key>
  export OCR_LLM_MODEL=claude-opus-4-6
  export OCR_USE_ANTHROPIC=true
  ```
- 方式 B（持久配置）：
  ```bash
  ocr config set llm.url https://api.anthropic.com/v1/messages
  ocr config set llm.auth_token <api-key>
  ocr config set llm.model claude-opus-4-6
  ocr config set llm.use_anthropic true
  ```

## 二、委托模式主工作流（默认，无需 LLM Key）

### Step 1 — 预览：确定审查范围
```bash
ocr delegate preview --format json [--from <ref> --to <ref>] [--commit <hash>] [--exclude <patterns>] [--background "业务背景"]
```
- `--format json`：让 `ocr` 直接输出结构化 JSON（含 `reviewable_files` 列表与引用元数据），便于宿主 / 下游 Agent 解析并构建覆盖清单；省略则输出人类可读文本（combo 默认走文本，由宿主收敛为最终 JSON）。
输出：mode（workspace / range / commit）、from/to/commit/merge_base 引用元数据、可审查文件清单（路径/状态/增删行数）、被排除文件及原因。

| 场景 | 命令 |
|------|------|
| 工作区改动 | `ocr delegate preview` |
| 分支对比 | `ocr delegate preview --from main --to feature` |
| 单个提交 | `ocr delegate preview -c abc123` |

### Step 2 — 获取文件对应规则
```bash
ocr delegate rule --format json <path1> <path2> ...
```
- `--format json`：与上同，结构化返回规则分组，便于宿主程序化消费。
传入 Step 1 的可审查文件路径。输出按规则内容分组（相同规则的文件归在一组，避免重复）。

### Step 3 — 获取 diff（用 git，基于 Step 1 的 mode/ref）
- Range 模式（preview 给出 merge_base）：`git diff <merge_base>..<to> -- <path>`
- Commit 模式：`git show <commit> -- <path>`
- Workspace 模式（已跟踪）：`git diff HEAD -- <path>`
- Workspace 模式（未跟踪新文件）：直接 `cat <path>`（整文件即新增代码）

### Step 4 — 由宿主智能体审查每个文件（强制覆盖清单）
1. 建立覆盖清单：包含 Step 1 的每一个 `reviewable_files` 条目。
2. 以 `(path, status)` 作为清单条目的唯一标识——工作区模式下，若「暂存删除 + 未跟踪重建」发生在同一路径，preview 可能把同一路径报告两次，须按 `(path, status)` 去重。
3. 对每个文件：① 取 diff（Step 3）→ ② 查阅其规则组（Step 2）→ ③ 用 WorkBuddy 自身能力与工具做深入审查 → ④ 标记为 `reviewed`，或带**明确理由**标记为 `skipped`。
4. 大改动按「共享规则 + diff 规模」分批审查，避免一次过载；**不要在发现首个高严重度问题后就停止**，须覆盖清单全部条目。

### Step 5 — 格式化 JSON 输出（强制）
将审查结果整理为下方「七、输出 JSON Schema」结构并返回给用户。委托模式下 `ocr` 不产出 JSON，故由本技能（宿主）负责将文本/判断收敛为 JSON。

### Step 6 — 分级与报告
报告前先核对：覆盖清单中每个 preview 文件均已处理。summary 须包含 `total_files` / `reviewed_files` / `skipped_files` / `coverage_rate`；被 `skipped` 的文件必须附上理由。
按 severity 分组：critical/high（bug、安全、数据丢失风险，必报）；medium（性能、错误处理、可维护性，附上下文）；low（风格、次要建议，仅当明确有价值时报告）；疑似误报静默丢弃。

### Step 7 — 修复（可选）
若用户要求"审查并修复"：直接应用 high/critical 修复；medium 需人工干预的给出说明；low 除非平凡否则跳过。修改前先与用户确认。

## 三、全面功能覆盖（可选增强，需配置 LLM）

委托模式是默认主路径；以下为 open-code-review 全部子命令，按需在对应场景启用：

| 子命令 | 用途 | 是否需 LLM | 命令示例 |
|--------|------|-----------|----------|
| `ocr delegate preview` | 选文件 + 引用元数据 | 否 | 见 Step 1 |
| `ocr delegate rule <paths>` | 解析审查规则（分组） | 否 | 见 Step 2 |
| `ocr review --audience agent --format json [--target working\|--commit\|--from/--to] [--background "..."]` | OCR 原生 LLM 评审（结构化 JSON） | 是 | `ocr review --audience agent --format json -b "上下文"` |
| `ocr scan --format json --path <dir>` | OCR 原生整库扫描 | 是 | `ocr scan --format json --path ./src` |
| `ocr rules check <file>` | 预览某文件适用的规则 | 否 | `ocr rules check src/main/Foo.java` |
| `ocr config set <k> <v>` / `ocr config provider` / `ocr config model` | 配置 LLM 与偏好 | 否 | 见「一」 |
| `ocr llm test` | 验证 LLM 连通性 | 否（仅测试） | 见「一」 |
| `ocr viewer <session>` | 查看历史审查报告 | 否 | `ocr viewer <id>` |
| `ocr session list` | 列出审查会话 | 否 | `ocr session list` |

规则优先级（OCR 解析）：`--rule <path>` > `<repo>/.opencodereview/rule.json` > `~/.opencodereview/rule.json` > 内置默认。规则文件格式：
```json
{
  "rules": [
    { "path": "**/*.go", "rule": "新增函数必须校验参数非空", "merge_system_rule": true },
    { "path": "**/*mapper*.xml", "rule": "检查 SQL 注入风险与未闭合标签" }
  ]
}
```

## 四、自动激活关键词（全面覆盖）

以下任一表述出现即视为触发本技能：代码审查、审查代码、code review、审查改动、审查提交、审查分支、审查 PR、审查工作区、评审代码、查 bug、找 bug、安全漏洞、代码质量、代码评审、委托审查、delegate、open-code-review、ocr、审查规则、review rules、AI 审查、帮我看看这段代码。

## 五、适用场景

- 对 Git 工作区 / 指定提交 / 分支区间的改动做 AI 代码审查。
- 无 LLM Key 时仍可做"文件筛选 + 规则解析 + WorkBuddy 自带能力审查"（委托模式）。
- 已配置 LLM 时，可切换 OCR 原生 `review`/`scan` 直出 JSON。
- 需要项目级自定义审查规则（`rule.json`）或复用内置规则。
- 需要结构化（JSON）审查结果以接入下游流程。

## 六、不适用场景

- 非 Git 仓库（OCR 基于 Git diff，无 git 上下文无法工作）。
- 期望后台常驻、自动监控式扫描（OCR 是按需调用，非守护进程）。
- 期望纯 MCP 调用（本技能走路径 B 命令行；如需 MCP 见仓库 `skills/open-code-review` 主技能）。
- 未配置 LLM 且要求 OCR 原生 `review`/`scan` 出结果（此时仅委托模式可用）。
- 超大单文件 diff 可能触发截断（默认 MAX_TOKENS 约 58888/请求），需拆分审查。

## 七、输出 JSON Schema（强制；委托模式由本技能生成，review/scan 直接取 --format json）

```json
{
  "tool": "open-code-review",
  "mode": "delegate | review | scan",
  "repository": "<仓库路径>",
  "target": { "type": "workspace | range | commit", "from": "<ref>", "to": "<ref>", "commit": "<hash>" },
  "files": [
    { "path": "src/foo.go", "status": "modified", "insertions": 2, "deletions": 0 }
  ],
  "rules": [
    { "path_pattern": "**/*.go", "rule": "新增函数必须校验参数非空" }
  ],
  "findings": [
    {
      "path": "src/foo.go",
      "start_line": 10,
      "end_line": 12,
      "category": "bug | security | performance | maintainability | test | style | documentation | other",
      "severity": "critical | high | medium | low",
      "comment": "问题描述",
      "suggestion": "修复建议（可选）"
    }
  ],
  "summary": { "files_reviewed": 1, "critical": 0, "high": 0, "medium": 0, "low": 0, "total_files": 1, "reviewed_files": 1, "skipped_files": 0, "coverage_rate": "100%" }
}

> **覆盖字段（上游 2026-08-07 新增）**：`total_files` / `reviewed_files` / `skipped_files` / `coverage_rate` 为委托模式新增强制审计字段，用于证明「每个 preview 文件均已 reviewed 或显式 skipped」；combo 阶段三合并时若报告 A 缺这些字段，以 `files_reviewed` 近似，不阻断。

## 八、注意事项（Gotchas）

- **委托模式全程不调用 LLM**：所有智能来自宿主（WorkBuddy）。`ocr` 仅做工程确定性判断。
- **规则已分组**：共享规则的文件在 `rule` 输出中归组；大改动可分批取规则。
- **工作目录敏感**：`ocr delegate`/`ocr review` 作用于当前目录的 Git 仓库；可用 `--repo /path` 覆盖。
- **未跟踪文件**：workspace 模式下 `preview` 含未跟踪文件，需用 `cat` 读取而非 `git diff`。
- **review/scan 必须配 LLM**：未配置会直接失败；首次运行前先 `ocr llm test`。
- **始终用 `--audience agent`**：抑制进度 UI，只输出最终摘要（review/scan 时）。
- **评论语言**：OCR 默认中文评论（`ocr config` 可设 `language`）。
- **覆盖率为强制项**：每个 `reviewable_files` 条目必须最终标记为 `reviewed` 或被**显式 skipped（附理由）**；不得静默遗漏文件（对应上游 2026-08-07 的 coverage 纪律）。
