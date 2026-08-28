---
title: "避坑铁律"
topic: "避坑铁律"
tags: [powershell, gitbash, encoding, pitfall, engineering]
related:
  - "Memory-全局禁令与环境约束.md"
scope: "永久记忆"
created: "2026-08-27T20:00:00+08:00"
updated: "2026-08-27T20:00:00+08:00"
parent: "MEMORY.md"
summary: "PowerShell中文编码坑、GitBash中文截断坑、工程实现跨项目避坑铁律"
keywords: ["PowerShell乱码", "GitBash截断", "CRLF", "删除护栏"]
priority: "high"
status: "active"
---
> **本文件速查索引**（按章节顺序排列）
> 精确定位到 ### 级别，避免全文加载。

| 适用场景 | 章节位置 | 备注 |
|---------|---------|------|
| 23 PowerShell脚本中文编码坑 | `## 23 PowerShell脚本中文编码坑` |  |
| 23.1 表现 | `### 23.1 表现` |  |
| 23.2 根因 | `### 23.2 根因` |  |
| 23.3 修复（两步） | `### 23.3 修复（两步）` |  |
| 23.4 预防 | `### 23.4 预防` |  |
| 23.5 注意 | `### 23.5 注意` |  |
| 24 Git Bash下中文截断坑 | `## 24 Git Bash下中文截断坑` |  |
| 24.1 现象与根因 | `### 24.1 现象与根因` |  |
| 24.2 铁律（任何项目、任何目录都适用） | `### 24.2 铁律（任何项目、任何目录都适用）` |  |
| 24.3 误删后的恢复思路 | `### 24.3 误删后的恢复思路` |  |
| 24.4 同族坑：文本切割工具把中文截成乱码（《cut -c... | `### 24.4 同族坑：文本切割工具把中文截成乱码（《cut -c》 等）` |  |
| 25 工程实现跨项目避坑铁律 | `## 25 工程实现跨项目避坑铁律` |  |
| 25.1 Node/JS 解析本地文件必须兼容 CRLF 行... | `### 25.1 Node/JS 解析本地文件必须兼容 CRLF 行尾` |  |
| 25.2 向用户 JSON 配置合并条目必须字段级合并 | `### 25.2 向用户 JSON 配置合并条目必须字段级合并` |  |
| 25.3 多 Agent 并行长任务协作闭环（审查-修复-复... | `### 25.3 多 Agent 并行长任务协作闭环（审查-修复-复审计 + 503 续派）` |  |
| 25.4 删除护栏补充雷区（Python 脚本） | `### 25.4 删除护栏补充雷区（Python 脚本）` |  |
<!-- INDEX_END -->
## 23 PowerShell脚本中文编码坑

> 关键事实：本机 Windows 11 + **PowerShell 5.1** 默认按**系统 GBK（代码页 936）**读取无 BOM 的 `.ps1` 脚本；而 `Write` 工具生成的 `.ps1` 是 **UTF-8 无 BOM**。两者冲突 → 文件内中文字符串被解析为乱码（如 `涓存椂鏂囦欢`），进而触发 `表达式或语句中包含意外的标记` 类语法解析失败。

### 23.1 表现

脚本跑到一半报 ParserError，错误行显示乱码中文；用 `Write-Output` 打印时控制台也可能乱码（但落盘文件用 `StreamWriter(UTF8)` / `Set-Content -Encoding UTF8` 写则正常）。

### 23.2 根因

PowerShell **5.1** 读 `.ps1` 的默认编码是"系统 ANSI（=GBK）"，仅当文件带 **UTF-8 BOM（EF BB BF）** 时才按 UTF-8 解码。

### 23.3 修复（两步）

用 PowerShell 重新保存加 BOM 即可：

```powershell
$p="<路径>.ps1"; $c=Get-Content -Path $p -Raw -Encoding UTF8; Set-Content -Path $p -Value $c -Encoding UTF8
```

`Set-Content -Encoding UTF8` 在 PowerShell **5.1** 会写入 **带 BOM** 的 UTF-8；重新运行即恢复正常。

### 23.4 预防

1. 凡包含中文的 `.ps1` 一律先加 BOM 再 `-File` 运行；
2. 或脚本内字符串尽量用英文/ASCII，仅在"写文件"环节用 UTF-8 输出；
3. 控制台实时输出中文时先设 `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8`。

### 23.5 注意

此坑与"控制台显示乱码"是两回事——控制台乱码只影响屏幕显示，不影响落盘；而 **无 BOM 导致脚本解析失败** 是真错误，必须先加 BOM。

---

## 24 Git Bash下中文截断坑

> 跨项目环境禁忌。**同一根因**：Git Bash（MinGW/MSYS2）对多字节字符按**字节**而非**字符**处理，把中文从中间腰斩。两种表现——[`23.1`](#231-表现)~[`23.3`](#233-修复两步) 讲**路径被截断导致误删**（后果不可逆），[`23.4`](#234-预防) 讲**文本被截断导致误读**（后果是误判）。务必永久遵守。

### 24.1 现象与根因

在 Git Bash（MinGW）中执行 `rm -rf "<父目录>/<中文子目录>"` 时，多字节中文路径可能被按字节边界截断，使 `rm` 实际收到的参数变成 `<父目录>/`（带尾斜杠的父目录），于是 `rm -rf` 把**整个父目录**递归删除——而不仅仅是那个中文子目录。

表现：`ls` 报 `No such file or directory`，父目录连同其下所有文件（包括本不应删的）全部消失；`rm` 不报错、不进回收站（Git Bash 的 `rm` 是永久删除）。

### 24.2 铁律（任何项目、任何目录都适用）

1. **含中文/非 ASCII 的"父目录级 `-rf`"一律禁止**。绝不对中文子路径用 `rm -rf` 父/祖目录。
2. 删除含中文路径的对象，**优先用 PowerShell `Remove-Item -LiteralPath '<完整路径>'`**（`-LiteralPath` 按字面量解析，不碰通配与编码，最安全）；或用 `Get-ChildItem -LiteralPath | Remove-Item`。
3. 若必须用 Git Bash：先 `cd` 进父目录，对**子项**用 ASCII 短名/相对路径精确删除；删除前务必先 `ls` 确认目标精确存在且参数不含会被截断的中文后缀。
4. 任何破坏性删除前，先列清单 + 关键目录先 `ls` 验证，遵循"列清单 + 暂停确认"门禁；对"保留目录"内的子项删除尤须谨慎（本次事故正是删保留目录内的中文子项导致父目录被误删）。
5. `rm` 在 Git Bash/Unix 下**不进回收站**，删除即永久——无 undo。

### 24.3 误删后的恢复思路

- 先看被删对象的**源副本**是否还在其他位置（如本次靠 `.workbuddy/pr457-gate4-expanded.png` 源文件 `cp` 恢复 png，靠 PR 内公网图片链接 `curl` 下载恢复 jpg）。
- 公网已发布/已上传的副本（图床、GitHub Release/附件、PR body 内 URL）是最可靠的恢复源。
- 若源与公网皆无：检查是否有其他本地备份、或同会话前的产物；否则只能从上游/远端重新拉取或重建。

### 24.4 同族坑：文本切割工具把中文截成乱码（《cut -c》 等）

同一根因（Git Bash 对多字节字符按**字节**而非**字符**处理）的第二种表现，危害是"读错内容"而非"删错文件"，但会直接导致误判。

**现象**：`grep` 单独输出中文正常，一旦管道接 `cut -c1-N` 之类按字符截取，中文立刻变乱码（形如 `鍔熻兘锛�`）。此乱码**极易被误判为"文件编码损坏"**，进而触发不必要的"修复"动作。

**根因**：Git Bash（MSYS2）在 `LANG=C.UTF-8` 下，`cut -c` 实际按字节切割，把 UTF-8 三字节汉字从中间腰斩，产生半个字符。文件本身完好。

**铁律**：

1. 判定"文件是否真的乱码"，**以 `Read` 工具读取结果为准**，不以 Git Bash 管道输出为准；按需用 `file -bi <文件>` 复核实际编码。
2. 读取含中文的文本，**不要用 `cut -c` / `awk substr` 之类按字符截断**；需要限长时用 `head -c`（按字节且不接管道二次切割）或直接 `Read` 读全文。
3. 批量扫描多文件的中文字段（如各技能 `SKILL.md` 的 `description`），用纯 `grep` 直接输出、不加截断；确需摘要再由模型截断，而非由 shell 截断。

---

## 25 工程实现跨项目避坑铁律

> 来源：`D:\Documents\AI_MCP-Skill-CLI\Memory-Data\task-methodology\` 固定目录 p2- 通用经验，经筛选蒸馏。适用于跨项目的脚本/代码编写与多 Agent 协作场景，与本文既有脚本编码坑章节同属"工程实现避坑"系列。

### 25.1 Node/JS 解析本地文件必须兼容 CRLF 行尾

- **现象**：正则 `/^---\n([\s\S]*?)\n---/` 或 `split('\n')` 在 Windows(CRLF) 文件上静默失败，误报"无 frontmatter"，功能看似失效却无任何报错，极难排查。
- **裁决（单一做法）**：解析前先归一为 LF 最稳妥：`const norm = raw.replace(/\r\n/g, '\n')`，之后一律按 LF 处理；或正则改用 `[\r\n]`、分割改用 `/\r?\n/` 兼容两种行尾。
- **铁律**：凡 Node 解析本地文本/Markdown/YAML frontmatter，默认按 CRLF 兼容写；若写回时需保留原行尾，则只用兼容正则、不写回归一内容。

### 25.2 向用户 JSON 配置合并条目必须字段级合并

- **现象**：脚本用 `doc[key] = newEntry` 整条覆盖，会静默抹掉用户原有字段（尤其 `disabled`），甚至把用户设的 `disabled: true` 反转成启用，无任何报错。
- **裁决（单一做法）**：`doc[key] = Object.assign({}, doc[key] || {}, newEntry)`（脚本字段覆盖、保留其余用户字段）；若需用户字段优先不被覆盖，则 `Object.assign({}, newEntry, doc[key] || {})`。
- **铁律**：深层嵌套子对象（如 `env`）也须逐层合并，不能只合并顶层；全新文件无既有字段时可直接赋值。

### 25.3 多 Agent 并行长任务协作闭环（审查-修复-复审计 + 503 续派）

- **闭环**：定义层审查 + 代码层审查并行 → lead 交叉比对裁决去重 → 分层并行修复（不同文件集、不 git 提交）→ 全场景边界回归测试 + grep 验证 → 重新派 fresh Agent 复审计 → 仅 ℹ️ 级残留即收敛。
- **铁律 1（信任但验证）**：修复 Agent 返回后，lead 必须 Read/Grep/git diff 核查关键改动，不采信其自述；修复 Agent 不得 git 提交，由 lead 统一收尾，避免并行提交冲突。
- **铁律 2（503 瞬态故障续派）**：子 Agent 返回 `503 Service Temporarily Unavailable` 是瞬态网络故障、非逻辑错误，不整批重派。重派前先 `git -C <repo> diff --stat -- <目录>` 核查是否已落盘改动：零改动则重派同名/换名 Agent；有改动则派"续派 Agent"携带现状上下文（已完成项/未完成项/保留良性偏离）基于现状续改，避免重复与冲突。若 503 连续多次且团队整体不可用，lead 本地（grep/Read/py_compile）兜底，不硬等 Agent。

### 25.4 删除护栏补充雷区（Python 脚本）

> 适用于任何「在受限根目录内做选择性删除」的 Python 脚本（清理器、迁移器、缓存回收）。

**雷区一：白名单/受保护集的路径分隔符必须归一化**

- **现象**：护栏用 `NEVER_TOUCH_DIRS` / `SAFE_FILE_EXCEPTIONS` 做字符串匹配，`os.path.relpath` 在 Windows 返回反斜杠 `app\sessions.json`，而白名单写成正斜杠 `"app/sessions.json"` → 匹配失败，受保护文件被误拦或白名单失效。
- **裁决（单一权威做法）**：在护栏入口先把 `rel` 用 `rel.replace(os.sep, "/")` 归一化为正斜杠；所有白名单/黑名单键一律用正斜杠书写；`split` 也用 `"/"` 而非 `os.sep`，保证 Windows 与类 Unix 行为一致。

**雷区二：软保护目录需要「显式 opt-in」开关，不能与硬保护混为一谈**

- **现象**：`logs/traces/shell-snapshots` 既想默认保护（防误删功能/状态数据），又想用 `--deep` 让用户主动清理。若都丢进同一个 `NEVER_TOUCH_DIRS`，`--deep` 分支调用同一护栏就会被无差别拦截 → 崩溃。
- **裁决（单一权威做法）**：把目录集拆成「硬保护（skills/plugins/vendor/blobs/memory… 永不删）」与「软保护（DEEP_DIRS，仅 --deep 时放行）」；`guard_target(root, path, allow_deep=False)`：`prohibited = NEVER_TOUCH_DIRS if not allow_deep else (NEVER_TOUCH_DIRS - DEEP_DIRS)`；删除调用处：普通删除 `allow_deep=False`，`--deep` 目录删除 `allow_deep=True`；硬保护目录即使在 `--deep` 下也始终禁止。

**配套铁律（缺一不可）**：

- 越界（根目录之外）一律拒绝（用 `os.path.abspath` + `startswith(root+os.sep)` 校验）。
- 数据库读取失败（表/列缺失）时，**禁止**在空保留集下执行删除，应抛致命异常中止。
- 非交互环境 `input()` 必须 `try/except EOFError` 优雅取消，不崩溃。
- 默认 `--dry-run` 零改动；真实删除需显式开关 + 二次确认。
- 删除数据库行后 `VACUUM`；`VACUUM` 单独 `try/except`（部分环境/锁下可能失败，不影响已删数据）。

---

[→主文件](file:///C:/Users/15794/.workbuddy/MEMORY.md)
