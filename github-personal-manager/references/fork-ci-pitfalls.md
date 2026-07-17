# Fork CI 实证要点与编译构建规则

> 标准阶段见「标准代码修改工作流程」。本约记 dynamic-mcp v1.5.1→v1.8.2 实操中独有的坑与 fork 专属约束；已抽离账户/仓库/邮箱，可移植（占位符 `<upstream>`/`<fork>`/`<feat>`/`<version>`）。

## 编译与构建规则
1. 必须使用 GitHub Actions CI 构建，禁止在本地安装编译工具链（MSVC Build Tools、MinGW 等），禁止本地实现编译。
2. Fork 仓库的 GitHub Actions 默认未启用，需用户在浏览器手动启用（点 “I understand my workflows, go ahead and enable them”）。
3. 启用 Actions 后，通过删除并重新推送标签触发工作流：`git push origin :refs/tags/v1.x.x` → `git push origin v1.x.x`（非强推；详见「顶级全局禁令」标签移动条款与「Release 发版工作流」标签 SHA 核对坑）。
4. 创建 PR/Issue 统一用 `gh` CLI（用户令牌免 403）；Web UI 仅兜底。

## 关键问题与解决（实证）
1. **Fork→上游 PR 卡 `action_required`（fork PR 审批闸门）**：仅上游有写权限者可 Approve and run，作者无法自批；审批前上游 CI 不跑。→ 等维护者；验证改 fork 内部路径。
2. **Fork 内部 PR（base=fork main）不触发 `pull_request` workflow**（GitHub 固有）。→ 改用 `ci.yml` 的 `push:[main]`：把 `feat` 以 merge commit 合到 fork main 再 `git push origin main`（临时验证合并，事后精确恢复，见第 3 点）。
3. **临时验证后精确恢复 fork main（禁止强推 main）**：在 功能分支(feat) 复现目标状态 → 开同源内部 PR(base=fork main) → 合并(merge) 即更新 main，无需强推。⚠️ 原步骤 `git checkout main` → `git reset --hard <原main-SHA>` → `git push --force-with-lease origin main` 已被「顶级全局禁令：禁止强推/删除自家 main」禁止，绝不可再用。
4. **Fork main 与 feat 重复实现致 merge 冲突**：`git checkout --ours <file>` 保留已验证版本（feat 自身改动仍完整，将来合上游不冲突）。
5. **构建二进制（不仅是验证）**：Release 工作流 `on: push: tags: ['v*']` → `git tag -a v[version]` + `git push origin v[version]` 触发；产物作 release assets（含 Windows 二进制）。
6. **⚠️ 禁用发布类 job（关键）**：fork 的 `release.yml` 常含 `publish-to-crates-io`/`pypi`/`build-python-wheels`——fork 绝不能发布。给这些 job 加 `if: false`，保留 `create-release` + `build-release`（PR 来自 feat 分支，release.yml 不在其 diff 内，不影响上游 PR）。
7. **CHANGELOG 需有对应版本段**：`create-release` 用 `awk "/^## [<ver>]/"` 抽 notes；无段回退 `--generate-notes`，文件不存在才 awk 失败。顶部加 `## [X.Y.Z] - [date]`。
8. **勿勾 “Require actions to be pinned to a full-length commit SHA”**：`ci.yml`/`release.yml` 用 tag 引用 action（`actions/checkout@v4`）时勾选必败（整 CI 红）。
9. **clippy 坑（`-D warnings` 必查）**：如 `clippy::useless_conversion`（`serde_json::Value::Object(map.into())` 中 `map` 已是 `JsonObject`，`.into()` 为 identity）。修复提交到 **feat 分支**并 `git push origin feat`，重做验证。
10. **rustfmt 关卡（`cargo fmt -- --check`）**：可装 minimal toolchain + 仅 rustfmt 组件（只解析语法、不编译、不需链接器）做精准格式化；或靠临时 push-to-main CI 间接确认。手写多行调用会被 rustfmt 折叠，是主要风险点。
11. **CLI flag 重命名 / clippy 踩坑（v1.8.1 实证）**：合并 `--http-host/--http-port/--http-path` 为 `--http-endpoint` 时连踩两处 CI 错误，根因都是「只改了一部分、没全仓扫」：
    - **改函数签名为 `&str` 后必须同步改全部下游 `&param`**：`check_singleton` 内 `format!(...)` 改直接用 `endpoint: &str` 参数，函数体内 4 处 `&endpoint`→`endpoint` 改了，却漏 `try_acquire_lock(&endpoint, …)`（singleton.rs:518），被 `clippy::needless-borrow` + `-D warnings` 升级为 CI 错误。
    - **重命名 CLI flag 必须全仓 grep 旧 flag 字符串**（含 `tests/`/`examples/`/`README*`）：只改 `tests/singleton_cli.rs` 的 L19-20，漏 L47-48 的另一个 `--http-port`，导致 Test 任务用已删除的旧参数启动二进制而失败。
    - **本地只跑 `cargo fmt --check` 预过 fmt 门；clippy 一律交 CI**（禁止本地编译）。
    - **覆盖含未提交改动的文件前先 `git diff origin/main -- <file> > /tmp/<file>.bak.patch` 存补丁**——本次 README 误覆盖靠这条恢复（恢复时基底提交必须与生成补丁时的 origin/main 一致，否则 apply 失败）。
12. **用 gh 开启分支保护（2026-07-15 实测）**：`gh api graphql -F query=@-`（heredoc 喂 mutation）调用 `createBranchProtectionRule`。关键字段：`repositoryId`（用 `gh api repos/<owner>/<repo> -q .node_id` 取）、`pattern:"main"`、`requiresStatusChecks:true` + `requiredStatusCheckContexts:[...]`（精确匹配 CI 检查名，matrix 会产生 `Build (ubuntu-latest)` 等多条）、`requiresStrictStatusChecks:true`、`allowsForcePushes:false`、`allowsDeletions:false`、`isAdminEnforced:false`（即不开启 Do not allow bypassing，管理员/AI 可紧急绕过）、`requiresApprovingReviews:false`。⚠️ **API 无法表达「要求 PR + 0 审批」**：REST 的 `required_approving_review_count` 最小为 1，GraphQL 无独立 `requiresPullRequest` 字段；故以「CI 绿 + 禁强推 + 禁删 + 管理员可绕过 + 无审批」为最大化可达保护。注意 `gh api graphql` 默认会跑 schema 自检，必须用 `-F query=@-` 从 stdin 喂查询才会真正执行。

## 特殊场景与易错坑（补充）
1. **本地仓库无 `.git`**（如同步工具丢失 `.git`，仅剩上游快照 + 本地独有文件）：用 `git init -b main` + `git remote add upstream [url]` + `git remote add origin [url]` + `git fetch upstream` → `git reset --mixed upstream/main` 保留工作树 → 列差异 → 覆盖前先备份本地当前版本到临时目录 → `git checkout -- .` 刷跟踪文件到 upstream/main（不动未跟踪本地文件）。`git reset --hard` / `git clean` 均禁用以防误删 `.workbuddy`。远端 fork 推送前先 `gh auth setup-git` 桥接令牌（本机 `git credential.helper` 默认空，否则 `git push` 无凭据失败）。
2. **本地独有文件（如 `.workbuddy`）隔离**：用 `.git/info/exclude`（本地专属、不提交不推送、位于 `.git` 内，`reset`/`checkout`/`pull upstream` 均不影响）写入忽略行，保持 fork 为上游干净镜像且无 `.gitignore` 分歧。若已被跟踪/推送过，先 `git rm --cached -r [路径]`（保留磁盘、下次 push 删远端）再忽略。`.workbuddy` 是项目记忆，绝不删除；忽略=不跟踪，不影响磁盘。
3. **标签 SHA 核对坑**：`git ls-remote --tags origin v[version]` 返回的是**注解标签对象本身**的编号，不是它指向的提交(commit)编号。核对「标签是否已推送/指向是否正确」时，必须先用 `git rev-parse [tag]^{commit}`（或 `git rev-list -n 1 [tag]`）解引用出提交(commit) SHA 再与本地对比；切勿直接拿 `ls-remote` 的 SHA 与 `git rev-list` 的提交(commit) SHA 比较，否则会误判为「标签错位/未推送」。
4. **分支保护实例**：`zhangweildlh/dynamic-mcp` 的 `origin/main` 已于 2026-07-15 用 `gh` GraphQL 开启保护（CI 严格全绿、禁强推、禁删分支、管理员可绕过、无审批、未强制 PR），作为「技术保护 + 约定」双保险，配置方法见上「关键问题与解决」第 12 点。

## 约束/注意事项（fork 专属硬规则）
- `git push` 只推 origin（fork），绝不推 upstream（亦见硬约束）。
- 上游合并由维护者完成，助手不自行合并（亦见硬约束）。
- 不本地装编译工具链（MSVC Build Tools / MinGW-w64）。
- `gh pr close <n>` 无 `-y`/`--yes` 标志（误用报 `unknown flag`）。
- 临时验证合并可能被 GitHub 自动标为某 PR merged（检测到 head 已合入 base），正常，无需处理。
- 工作流权限：fork Settings → Actions → Workflow permissions 需 Read and write（`gh release create` 要 `contents: write`）；CI 本身只需读权限。

## 用户 GitHub 账号与 Fork 仓库
- 用户名：`zhangweildlh` ｜ 邮箱：`157947621@qq.com`
- Fork 仓库：
  - dynamic-mcp：`https://github.com/zhangweildlh/dynamic-mcp`（upstream：`asyrjasalo/dynamic-mcp`）
  - mcp-bridge：`https://github.com/zhangweildlh/mcp-bridge`（upstream：`mimicode/mcp-bridge`）
  - chrome-md-editor：`https://github.com/zhangweildlh/chrome-md-editor`（upstream：`yishu-ziyu/chrome-md-editor`）
  - deepseek-pp：`https://github.com/zhangweildlh/deepseek-pp`（upstream：`zhu1090093659/deepseek-pp`）
