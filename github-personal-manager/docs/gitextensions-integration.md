# GitExtensions 集成说明

> 目标：让 GitExtensions 的自定义脚本（Settings → 自定义脚本 / `ownScripts`）调用本仓库脚本，实现「菜单/右键一键触发」。
> 本仓库脚本**纯手动触发**，不含定时逻辑；GitExtensions 的 `OnEvent` 仅作菜单/右键挂载点，不自动运行。

## 1. 前置条件

- 本仓库已克隆/复制到本机，例如 `D:\Documents\AI_MCP-Skill-CLI\github-personal-manager`。
- 已复制 `config/github-sop.config.template.sh` → `config/github-sop.config.sh` 并填入本机 `GIT_BIN`/`GH_BIN` 等。
- GitExtensions 的 `gitcommand` 指向 `D:\Tools\Assembly\git\cmd\git.exe`（与本仓库 `GIT_BIN` 同树）。

## 2. 在 GitExtensions 中添加脚本

打开 GitExtensions → `工具(Tools)` / `设置(Settings)` → **自定义脚本(Scripts)**（对应设置键 `ownScripts`）。

对每个要集成的脚本，添加一个条目，字段如下（以 `sop_sync_pull_ff` 为例）：

| 字段 | 值 |
|---|---|
| 名称(Name) | 快进拉取 main（巡检-第一步） |
| 命令(Command) | `D:\Tools\Assembly\git\bin\bash.exe`（或 `git\usr\bin\bash.exe`） |
| 参数(Arguments) | `-c "bash 'D:/Documents/AI_MCP-Skill-CLI/github-personal-manager/scripts/sop_sync_pull_ff.sh' . --confirm"` |
| 添加到修订网格右键菜单 | 是（按需） |
| 添加到用户菜单栏 | 是（按需） |
| 执行前询问确认 | 否（脚本内部已有 `--confirm` 门禁 + dry-run） |
| 后台运行 | 否 |

> 说明：`Arguments` 中 `.` 表示「以当前仓库为工作目录」，让脚本作用于你正在操作的仓库；`--confirm` 表示真正执行（去掉即 dry-run 预览）。

## 3. 推荐挂载清单

| 脚本 | 建议 OnEvent / 菜单 | 是否加 `--confirm` |
|---|---|---|
| `sop_sync_precheck.sh` | 用户菜单栏 | 否（只读） |
| `sop_sync_pull_ff.sh` | 用户菜单栏 | 是 |
| `sop_sync_upstream.sh` | 用户菜单栏 | 是 |
| `sop_pr_create.sh` | 用户菜单栏 | 是 |
| `sop_pr_checks.sh` | 右键 / 菜单 | 否（只读） |
| `sop_ci_failed_log.sh` | 右键 | 否（只读） |
| `sop_ci_rerun.sh` | 用户菜单栏 | 是 |
| `sop_branch_merged_status.sh` | 用户菜单栏 | 否（只读） |
| `sop_fetch_prune.sh` | AfterPull / 用户菜单栏 | 否（幂等） |

## 4. 移植到第三方电脑

1. 复制本仓库目录（含 `config/github-sop.config.sh`，**不含任何令牌**）。
2. 第三方电脑执行 `gh auth login`（或连同 `D:\Tools\Assembly` 树一并复制并 `gh auth setup-git`）。
3. GitExtensions 中命令/参数路径按新机器调整即可。

> 脚本只依赖 `gh` 读取其本地凭据，与「桥接可移植」结论一致；不写死任何账号/令牌。
