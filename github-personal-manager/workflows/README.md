# workflows · GitHub 个人管理「小白按钮」脚本目录

本目录存放 **工作流父脚本（`wf_*.sh`）**，专为 **SourceGit** 与 **Git Extensions** 这类图形化 Git 客户端设计。
> 编排约定：本文档各清单/表格的排列顺序 = **仓库全生命周期顺序**（同步巡检 → 多工作树并行 → 开 PR → CI 排错 → 发版 → 分支清理 → 清理工区）；本目录与技能本体 `SKILL.md` 是并行的两条使用路线，互不依赖、各自自洽。
它们把底层「给 AI 助手（Agent）用的 SOP 脚本」（`scripts/` 下的 `sop_*.sh`）串成一条条「点一下就办」的流程按钮，
让**记不住 Git 命令、对 Git 理解很少**的人也能安全管理本地仓库。

> 设计原则：脚本**全程不读键盘、绝不阻塞**，所有需要人拍板的地方都用中文把「选项 + 后果 + 安全底线」打印出来，
> 由你在图形界面里照着选或点下一个按钮。原始 SOP 由 Agent 决策的部分，在这里改由你本人决策。

---

## 一、目录布局与相对引用（非硬编码）

```
github-personal-manager/          ← 技能根目录（可整体移动到任意盘符/路径）
├── SKILL.md
├── config/
│   └── github-sop.config.sh       ← 可选配置（账号/仓库根目录等），缺失则用默认值
├── scripts/                       ← 底层 SOP 业务脚本（给 Agent 与各 wf 脚本复用）
│   ├── lib/sop-common.sh          ← 公共函数库（工具探测、仓库守卫、配置加载…）
│   ├── sop_sync_precheck.sh / sop_sync_pull_ff.sh / sop_sync_upstream.sh / sop_sync_report.sh
│   ├── sop_fetch_prune.sh / sop_branch_merged_status.sh
│   ├── sop_docs_sync_check.sh / sop_privacy_gate.sh / sop_pr_create.sh / sop_pr_checks.sh
│   ├── sop_ci_failed_log.sh / sop_ci_rerun.sh
│   ├── sop_worktree_add.sh / sop_worktree_merge.sh / sop_worktree_cleanup.sh
│   └── …（其余 sop_*.sh）
├── workflows/                     ← 本目录（本次从 scripts/workflows 移出，与 scripts 平级）
│   ├── wf_common.sh               ← 公共库：被其余 7 个脚本 source，提供 wf_source_common / wf_run_step / wf_decide
│   ├── wf_sync.sh                 ← 同步巡检（全套）
│   ├── wf_worktree.sh             ← 多工作树（add / merge / cleanup）
│   ├── wf_pr.sh                   ← 开 PR（含两道安全闸门）
│   ├── wf_ci.sh                   ← CI 失败排错
│   ├── wf_release.sh              ← 发版前体检 + 生成发版命令
│   ├── wf_branch_clean.sh         ← 回收已合并本地分支（一键）
│   ├── wf_workspace_clean.sh      ← 清理工区（一键，可恢复）
│   └── README.md                  ← 本文件
└── references/ templates/ smoke/  ← 技能其他资料（wf 脚本不依赖）
```

### 相对路径如何工作（为什么不硬编码技能根目录）

- 每个 `wf_*.sh` 用 `BASH_SOURCE` 拿到**自身所在目录** `WF_SELF_DIR`，再推导 `SOP_SELF_DIR="$WF_SELF_DIR/../scripts"`。
- 由此引用：`"$SOP_SELF_DIR/sop_xxx.sh"`（各业务脚本）、`"$SOP_SELF_DIR/lib/sop-common.sh"`（公共库）。
- `sop-common.sh` 的 `_sop_load_config` 再以 `SOP_SELF_DIR/..` 找到技能根，按需加载 `config/github-sop.config.sh`。
- **结论**：整套脚本不写死任何 `D:\Documents\AI_MCP-Skill-CLI\…` 之类的安装位置。技能目录可整体剪切到别的盘/路径，脚本仍能自定位、不报错。

### 在 SourceGit / Git Extensions 里调用会断链吗？

**不会。** 图形客户端启动脚本时，会把脚本路径（你在配置里填的）交给 `bash`；脚本内部靠 `BASH_SOURCE[0]` 解析自身位置，
**与客户端当前工作目录（CWD）无关**。即使客户端的 CWD 是被操作的仓库目录，脚本也能正确找到 `../scripts` 下的兄弟文件。
（已实测：从与脚本、仓库均不同的目录用绝对路径启动 `wf_branch_clean.sh` / `wf_sync.sh`，均能正确解析并执行。）

> 唯一需要在 GUI 配置里写**绝对路径**的地方是「脚本文件本身的位置」——这是告诉客户端「运行哪个文件」，属于正常配置，
> 不属于脚本内部硬编码。若你整体移动了 `github-personal-manager` 目录，只需同步更新 GUI 配置里的脚本路径即可。

---

## 二、各脚本用途 / 场景 / 引用关系一览

| 脚本 | 用途 | 典型场景 | 直接调用的脚本/文件 | 写动作？ |
|---|---|---|---|---|
| `wf_common.sh` | 公共函数库（被其余 7 个 source） | 所有流程的底座 | `../scripts/lib/sop-common.sh`、加载 `../config/github-sop.config.sh` | 否（仅定义函数） |
| `wf_sync.sh` | 日常同步巡检全套：看清现状 → 对齐 main → 合并上游 → 出报告 | 每天点一次，保持本地/你的远端/上游三方一致 | `sop_sync_precheck.sh`、`sop_sync_pull_ff.sh`、`sop_sync_upstream.sh`、`sop_sync_report.sh`（合并前用 `git rev-parse HEAD` 捕获 TIP 传给报告） | 是（需 `--confirm`） |
| `wf_worktree.sh` | 多工作树并行开发：`add` 开线 / `merge` 合回主线 / `cleanup` 收拾 | 同时写两条功能线，互不干扰 | `sop_worktree_add.sh` / `sop_worktree_merge.sh` / `sop_worktree_cleanup.sh` | 是（需 `--confirm`） |
| `wf_pr.sh` | 开合并请求（PR）全套，先过文档闸门 + 隐私闸门 | 功能分支写好，向原作者申请合并 | `sop_docs_sync_check.sh`、`sop_privacy_gate.sh`、`sop_pr_create.sh` | 是（需 `--confirm`） |
| `wf_ci.sh` | CI 失败排错：看日志 → 看检查 → 重跑 | PR 的 CI 红了，定位并重测 | `sop_ci_failed_log.sh`、`sop_pr_checks.sh`、`sop_ci_rerun.sh` | ①②只读；③重跑是写动作（需 `--confirm`） |
| `wf_release.sh` | 发版前体检（主线干净/与上游对齐/PR 检查绿）+ 生成发版命令 | 准备发正式版本前自检 | `sop_sync_precheck.sh`、`sop_pr_checks.sh` | 只读体检；`--confirm` 才真正 `git tag`+`gh release`（公开动作，慎点） |
| `wf_branch_clean.sh` | 批量回收「已合入主线」的本地分支（瘦身） | 分支越攒越多时清理 | `sop_fetch_prune.sh`（刷新远程跟踪）；自身判定 `--merged`、排除 main/当前/有未关 PR 的分支 | 是（需 `--confirm`） |
| `wf_workspace_clean.sh` | 把未提交改动/未跟踪/忽略文件收进 stash 临时抽屉（可恢复） | 想切分支被拦、或想让文件夹变干净 | `sop_privacy_gate.sh`（先过隐私闸门）；自身用 `git stash push -a` | 是（需 `--confirm`） |

**通用安全边界（所有脚本一致）**
- 永远只推到你的远端（`origin`），绝不碰上游（`upstream`）；永远不做强制推送、绝不删 `main`。
- 遇到双向分叉 / 合并冲突，会**停下并把选项列给你**，绝不替你擅自选。
- 默认只「预览（dry-run）」：不带 `--confirm` 时只打印将做什么；带 `--confirm` 才真正执行。
- 按钮策略：**强推 / 删 main 不做一键按钮**（无对应脚本）；**删除已合并分支 / 清理工区做一键按钮**（有安全守卫，且清理工区可 `git stash pop` 恢复）。

> ### ⚠️ 工作树（wf_worktree）的 Windows 环境约束
> `wf_worktree.sh` 底层调用 `sop_worktree_add.sh` 创建独立的平行工作目录。在 **Windows + Git Bash** 环境下，
> 工作树路径会被统一归一化为 Windows 形态（`D:/...`），以规避 Git for Windows 把 POSIX 形态（`/d/...`）误当相对路径、
> 错建到 `D:/d/...` 的已知缺陷（P-GPM-4 已修复）。**请始终在 Git Bash（如 SourceGit 配置里填的 `bash.exe`）中运行 wf_worktree**，
> 不要在非 Git Bash 的终端里跑，否则工作树可能落错位置、后续无法进入。

---

## 三、挂接到 SourceGit（`preference.json` 的 `CustomActions`）

> SourceGit 字段实测**只有** `Name / Scope / Executable / Arguments / Controls / WaitForExit`，**没有独立注释字段**。
> 中文说明落点：① `Name` 写成自解释长中文；② 脚本运行到决策点时由 `wf_decide` 打印四段式大白话指引。

1. 打开便携目录 `D:\Tools\SourceGit\data\preference.json`（SourceGit 便携模式配置落在此 `data` 子目录）。
2. 在 `CustomActions` 数组里加入下面条目（**路径用你本机实际位置**；`Executable` 指向 `bash.exe`，`Arguments` 第一个参数是 `wf_*.sh` 的绝对路径，第二个用 SourceGit 占位符 `${REPO}`）。
3. `WaitForExit: true` 让 SourceGit 等脚本跑完并显示输出窗口。

```jsonc
{
  "CustomActions": [
    {
      "Name": "①同步巡检-全套(看清→对齐→合并上游→报告)",
      "Scope": "Repository",
      "Executable": "D:/Tools/Assembly/git/usr/bin/bash.exe",
      "Arguments": "D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_sync.sh \"${REPO}\" --confirm",
      "WaitForExit": true
    },
    {
      "Name": "开PR-创建合并请求(目标main,先过两道闸门)",
      "Scope": "Repository",
      "Executable": "D:/Tools/Assembly/git/usr/bin/bash.exe",
      "Arguments": "D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_pr.sh \"${REPO}\" --base main --confirm",
      "WaitForExit": true
    },
    {
      "Name": "开PR-指定目标分支",
      "Scope": "Repository",
      "Executable": "D:/Tools/Assembly/git/usr/bin/bash.exe",
      "Arguments": "D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_pr.sh \"${REPO}\" --base ${BRANCH} --confirm",
      "Controls": [ { "Type": "TextBox", "ArgumentName": "BRANCH", "Description": "要合进的目标分支名，如 main 或 develop" } ],
      "WaitForExit": true
    },
    {
      "Name": "回收已合并本地分支(一键,绝不会删main/当前分支)",
      "Scope": "Repository",
      "Executable": "D:/Tools/Assembly/git/usr/bin/bash.exe",
      "Arguments": "D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_branch_clean.sh \"${REPO}\" --confirm",
      "WaitForExit": true
    },
    {
      "Name": "清理工区(收进临时抽屉,随时可恢复)",
      "Scope": "Repository",
      "Executable": "D:/Tools/Assembly/git/usr/bin/bash.exe",
      "Arguments": "D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_workspace_clean.sh \"${REPO}\" --confirm",
      "WaitForExit": true
    }
  ]
}
```

> 注：`${REPO}` 是 SourceGit 内置的「当前仓库绝对路径」占位符；`${BRANCH}` 绑定 `Controls` 里的输入框。
> 想加更多流程（CI 排错、工作树、发版体检），照表复制对应 `wf_*.sh` 行即可。

---

## 四、挂接到 Git Extensions（`GitExtensions.settings` 的 `ownScripts`）

> Git Extensions `ownScripts` **无运行时输入框**，参数只能写死（如 `--base main`）；但有 `AskConfirmation` 字段可做「点按钮 + 弹确认框」两段授权，适合破坏性操作兜底。

1. 关闭 Git Extensions，编辑其 `GitExtensions.settings`（通常在 `%APPDATA%\GitExtensions\` 或便携目录）。
2. 在 `<ownScripts>` 节点内加入下面 `<ownScript>` 条目。`<Command>` 用 `bash.exe`（确保它在 PATH，或填绝对路径）；`<Arguments>` 第一个参数是 `wf_*.sh` 绝对路径，第二个用 Git Extensions 占位符 `{cDefaultRepoPath}`。
3. 想先「只预览」，把末尾的 `--confirm` 去掉即可（脚本会打印将做什么但不执行）。

```xml
<ownScript>
  <Name>①同步巡检-全套</Name>
  <Command>bash.exe</Command>
  <Arguments>"D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_sync.sh" "{cDefaultRepoPath}" --confirm</Arguments>
  <AddedToMenu>true</AddedToMenu>
  <Enabled>true</Enabled>
  <AskConfirmation>false</AskConfirmation>
</ownScript>
<ownScript>
  <Name>开PR-创建合并请求(目标main)</Name>
  <Command>bash.exe</Command>
  <Arguments>"D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_pr.sh" "{cDefaultRepoPath}" --base main --confirm</Arguments>
  <AddedToMenu>true</AddedToMenu>
  <Enabled>true</Enabled>
  <AskConfirmation>false</AskConfirmation>
</ownScript>
<ownScript>
  <Name>回收已合并本地分支(一键)</Name>
  <Command>bash.exe</Command>
  <Arguments>"D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_branch_clean.sh" "{cDefaultRepoPath}" --confirm</Arguments>
  <AddedToMenu>true</AddedToMenu>
  <Enabled>true</Enabled>
  <AskConfirmation>false</AskConfirmation>
</ownScript>
<ownScript>
  <Name>清理工区(收进临时抽屉)</Name>
  <Command>bash.exe</Command>
  <Arguments>"D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/workflows/wf_workspace_clean.sh" "{cDefaultRepoPath}" --confirm</Arguments>
  <AddedToMenu>true</AddedToMenu>
  <Enabled>true</Enabled>
  <AskConfirmation>false</AskConfirmation>
</ownScript>
```

> 注：`{cDefaultRepoPath}` 是 Git Extensions 的仓库路径占位符。Git Extensions 无输入框，故 `wf_worktree.sh` 的 `--branch feat/x`、
> `wf_release.sh` 的 `--tag v1.2.3` 等需要现填参数的场景，需把参数写死成固定值，或为不同分支/版本各挂一个预置按钮。

---

## 五、两软件差异要点

- **SourceGit 优势**：`Controls` 运行时输入框（如开 PR 的目标分支可现填 `${BRANCH}`），`${REPO}` 原生仓库路径占位符。
- **Git Extensions 优势**：`AskConfirmation` 可做「点按钮 + 弹确认框」两段授权（破坏性操作更稳妥）；但无输入框，参数写死。
- **共同点**：调用的都是同一套 `wf_*.sh`；中文说明靠 `Name`（自解释长中文）+ 脚本运行到决策点时打印的大白话四段指引。

---

## 六、使用建议（小白视角）

1. **先看预览**：把按钮参数里的 `--confirm` 去掉，先点一次看脚本打印「将做什么」，确认无误再加回 `--confirm` 真正执行。
2. **遇决策点别慌**：脚本停下来并打印 A–E 选项 + 对应 git 命令时，那是需要你拍板。可复制命令到终端自己执行，或点下一个对应按钮。
3. **清理工区可恢复**：它把杂物「收进抽屉（stash）」不是删除，想恢复就在终端执行 `git stash pop`。
4. **工具前置**：本机需装好 Git 且 `git`/`gh` 在 PATH（或在 `config/github-sop.config.sh` 指定绝对路径）；缺工具时脚本会用中文优雅报错退出，不会甩一堆看不懂的 bash 错误。
