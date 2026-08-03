# 工作流方法论与标准操作规程（SOP）：多工作树并行开发 + `--no-ff` 普通合并 + 工作树/分支清理

> **文档性质**：本文件是「同一仓库、多任务并行编码 → 普通合并（`--no-ff`）回主线 → 补变更文档 → 清理工作树与分支」全流程的**方法论依据**与**唯一操作规范**。
> **唯一性声明**：所有命令给出**唯一写法**，所有判定给出**唯一判定条件**与**预期输出**，无歧义、无「视情况而定」。任何偏离「唯一写法 / 唯一判定」的变体，须先回到第 1 节心智模型复核，确认不违反四大约束（见第 2 节）后再执行。
> **通用性声明**：本文不含任何具体仓库名、版本号、合并哈希、工具链或环境专属细节。所有具体值均以参数占位（`<xxx>`）表示，执行时由操作方按当前项目填入。测试 / 构建 / 依赖安装命令亦为占位，需依项目实际包管理器与脚本替换。
> **示例值性质**：文中所有 `<...>` 均为参数占位；任何看似真实的值（如 `886edae`、`1.5.0`）仅作示例说明，实际以当期为准。

---

## 0. 适用范围

- ✅ 同一 Git 仓库，需要**多任务并行**开发，彼此代码隔离、互不干扰。
- ✅ 每个任务在**独立工作树（worktree）**中编码，最终**普通合并（`--no-ff`）**回主线分支（默认 `main`）。
- ✅ 合并后补充 `CHANGELOG.md` 等变更文档，并按条件**删除无用工作树 + 清理分支（本地 + 远端）**。
- ❌ 不适用于：单任务线性开发、需要改写历史的变基合并（`rebase` / `squash`）、跨仓库协作（本 SOP 仅覆盖自有仓库，不含上游同步协同）。

---

## 1. 方法论（心智模型 · 为什么这样做）

理解「为什么」才能在任何异常下不偏离原则。

### 1.1 工作树 = 物理隔离的沙箱
- 每个 worktree 是仓库在**不同目录**的完整检出，拥有独立工作区与依赖产物（如 `node_modules` / `venv` / `target`）。
- 多任务并行时，任务 A 的未提交改动 / 依赖版本不会污染任务 B。
- 代价：每个 worktree 需独立安装依赖；磁盘占用叠加。

### 1.2 分支 = 廉价指针
- 分支只是指向某个提交的**指针**，删除分支**不删除提交**（只要提交仍被其他引用可达，如合并碑的第二父）。
- 推论：清理分支零风险——只要该分支已通过 `--no-ff` 合并，其提交仍挂在主线的合并碑下，删除指针不会丢代码。

### 1.3 合并碑 = 回滚书签
- `--no-ff` 强制生成一个**双父合并提交（merge commit）**：父 1 = 主线侧、父 2 = 功能分支尖端。
- 这条合并碑就是「整段回滚」的**唯一锚点**：`git revert -m 1 <合并碑>` 一次性撤销该功能引入的全部改动。
- 若用快进合并（fast-forward）或压平（squash），则无独立合并碑，失去整段回滚能力——故**一律 `--no-ff`**。

### 1.4 历史不可变 = 审计链
- 已推送的提交属于团队 / 公开历史，**禁止改写**（`rebase -i` / `amend` / `--force` 推送）。
- `--no-ff` 是「追加」而非「改写」：它只新增一个合并碑，原有提交哈希全部不变。
- 推论：合并碑存在本身即证明「未改写历史」。

### 1.5 四大约束的来源

| 用户约束 | 对应机制 | 违反后果 |
| --- | --- | --- |
| 能够整段回滚 | 双父合并碑 + `git revert -m 1` | 无合并碑则只能逐提交回退，易漏 |
| 中间提交全保留 | `--no-ff` 保留功能分支谱系 | squash / rebase 会丢失提交粒度 |
| 有合并碑 | `--no-ff` 强制生成 | fast-forward 不产生碑 |
| 不改历史 | 仅追加、不改写已推送提交 | `rebase` / `amend` / `--force` 破坏审计链 |

---

## 2. 四大约束 ↔ 唯一验证矩阵

合并后**必须**逐项验证，全部满足才算合格。任一项不满足即视为合并失败，需排查。

| 约束 | 验证命令 | 预期输出 / 判定 | 失败含义 |
| --- | --- | --- | --- |
| ① 整段可回滚 | `git cat-file -p <MERGE_HASH> \| grep -c parent` | 输出 `2`（双父） | 非 `--no-ff`，无回滚锚点 |
| ② 中间提交全保留 | `git log --oneline <MERGE_HASH>^2` | 列出功能分支全部中间提交 | 提交被压平 / 丢失 |
| ② 中间提交可达 | `git merge-base --is-ancestor <TIP> HEAD; echo $?` | 输出 `0` | 功能尖端不在主线历史中 |
| ③ 有合并碑 | `git log --oneline --merges -1` | 显示该合并碑 | 未生成合并碑 |
| ④ 不改历史 | `git log --format=%H <BASE_BRANCH>~N..<BASE_BRANCH>`（合并前后对比） | 合并碑**之前**的主线提交哈希与合并前一致 | 历史被改写 |

> 注：`<MERGE_HASH>^2` 表示合并碑的第二父（功能分支侧）；`<TIP>` 为功能分支尖端提交哈希；`<BASE_BRANCH>` 为受保护主线（默认 `main`）。

---

## 3. 核心原则（不可动摇）

1. **普通合并**：功能分支合入主线一律 `git merge --no-ff`，生成双父合并碑，保留中间提交谱系，不改写历史。
2. **整段可回滚**：合并碑必须是双父结构，回滚命令唯一为 `git revert -m 1 <合并碑>`。
3. **版本号单一事实源（若随合并发版）**：版本标识（如应用清单 / 包描述中的 `version`）须保持一致；未发版时推荐分支保持与主线同版本号，合并后统一升。
4. **硬禁令**：禁止对 `<REMOTE>/<BASE_BRANCH>` 执行强推（`--force` / `-f` / `--force-with-lease`）或删除（详见第 11 节）。
5. **最高优先级约定（项目自定）**：项目可声明「最高优先级约定」（如：某核心模块 / 功能在合并冲突时**不得被覆盖或丢弃**）。合并冲突涉及该区域时，**立即暂停并告知用户**，不擅自解冲突。
6. **公开动作须授权**：删除远端分支、打 tag、创建 Release 属公开动作，**须用户明确授权**后执行。

---

## 4. 参数占位与前置条件

### 4.1 参数占位表（执行前填写）

| 占位 | 含义 | 示例填写方式 |
| --- | --- | --- |
| `<MAIN_REPO_PATH>` | 主仓库（含 `.git` 的工作树）绝对路径 | 主仓库根目录 |
| `<WORKTREE_ROOT>` | 工作树父目录（与 `<MAIN_REPO_PATH>` 分离的独立目录） | 独立父目录，避免被主仓库清理连坐 |
| `<REMOTE>` | 远端名 | 通常 `origin` |
| `<BASE_BRANCH>` | 受保护主线分支 | 通常 `main` |
| `<BRANCH>` | 功能 / 修复分支名 | `feat/<topic>` / `fix/<topic>` / `feature/<topic>` |
| `<TIP>` | 功能分支尖端提交哈希 | 合并前由 `git rev-parse <BRANCH>` 取得 |
| `<MERGE_HASH>` | 合并碑哈希 | 合并后由 `git rev-parse HEAD` 取得 |
| `<OWNER>` / `<REPO>` | 仓库归属与名（仅 `gh` 命令需要） | 远端仓库标识 |
| `<INSTALL_DEPS>` / `<RUN_TESTS>` / `<BUILD>` | 依项目包管理器与脚本替换 | 如 `npm ci` / `npm test` / `npm run build` |

### 4.2 前置要求（执行前必须确认）
- 本地仓库路径真实存在且为 Git 仓库。
- Git 身份与远端已配置（`git remote -v` 可见 `<REMOTE>`）。
- `<BASE_BRANCH>` 受保护（合并走 PR，不直推）；或确认为无保护、允许直推（由分支保护核验决定，见 7.2）。
- 已约定分支命名规范与变更文档（CHANGELOG）格式（推荐 Keep a Changelog）。
- 项目已具备可运行的测试与构建流程（CI 或本地等效）。
- `gh` 已登录（仅当涉及 PR / 分支保护核验 / 远端分支删除授权时）。

---

## 5. 阶段一：从主线开出独立工作树（多任务并行）

### 5.1 前置要求（唯一判定）
- `git fetch <REMOTE>` 已完成，远端最新。
- 当前在主线：`git checkout <BASE_BRANCH>`。
- 主仓库工作树干净：`git status --porcelain` 输出**必须为空**（否则先处理未提交改动）。

### 5.2 操作命令（唯一写法）
```
git worktree add <ABS_PATH> -b <BRANCH> <BASE_BRANCH>
```
- `<ABS_PATH>`：绝对路径，建议 `<WORKTREE_ROOT>/<topic>`（独立父目录，与主仓库分离）。
- `<BRANCH>`：命名遵循约定（如 `feat/<topic>` / `fix/<topic>`）。
- **多任务并行**：对每个任务重复 5.2，各自独立 `<ABS_PATH>` + `<BRANCH>`，互不干扰。
- 约束：一分支一工作树；不同工作树必须 checkout 不同分支；各工作树基于最新主线 HEAD。

### 5.3 验证（无歧义）
- `git worktree list` 列出新条目，路径与分支正确。
- 新目录存在且含完整仓库文件。

### 5.4 注意
- 每个 worktree 需独立安装依赖：在 `<ABS_PATH>` 内执行 `<INSTALL_DEPS>`（依赖产物不跨工作树共享）。
- **合并只依赖提交引用**：只要 `<REMOTE>/<BRANCH>` 引用完好，即便本地 worktree 因外部清理而失效，合并不受影响。重要本地产物应纳入版本控制或另行备份。

---

## 6. 阶段二：工作树内开发 + 测试

### 6.1 开发
- 在各自 worktree 目录内实现功能，**按需多次提交**，保留中间提交（这是 `--no-ff` 保留谱系价值的来源；不要等全部完成才一次性提交）。

### 6.2 测试链（唯一顺序，全绿才允许合并）
```
cd <WORKTREE_PATH>
<INSTALL_DEPS>
<RUN_TESTS>
<BUILD>
```
- **全绿判定（唯一）**：测试套件零失败；构建退出码 0 且产物目录生成。
- 测试与构建命令依项目替换，等价目标为「验证功能正确且可发布构建」。

### 6.3 守约定
- 项目最高优先级约定区域功能完全保留（见 3.5）。

### 6.4 版本号（关键防坑）
- **若本任务将随合并一起发版**：分支内同步升版本标识（教训：曾发生漏升某处版本字段，合并时需补）。
- **暂不发版**：保持与 `<BASE_BRANCH>` 同版本号，留待合并后统一升（推荐，避免多分支版本号分叉）。

### 6.5 推送功能分支（建议，非强制但推荐）
```
cd <WORKTREE_PATH>
git push -u <REMOTE> <BRANCH>
```
- 目的：使 `<REMOTE>/<BRANCH>` 引用持久化，规避本地 worktree 失效导致引用丢失。
- 非强推，合规。

### 6.6 定期同步主线（减少后期冲突）
```
git fetch <REMOTE>
git rebase <REMOTE>/<BASE_BRANCH>     # 在当前工作树分支上执行
```
- 仅在功能分支未推送或推送后允许 rebase 自身分支时使用；已推送且他人依赖的分支勿改写。

---

## 7. 阶段三：`--no-ff` 合并到主线

### 7.1 选择执行地（唯一）
- 合并**必须在主仓库目录**执行，**绝不在 worktree 内**（worktree 可能失效且其 HEAD 非主线）。
- `cd <MAIN_REPO_PATH>`。

### 7.2 预检（唯一顺序，缺一不可）
1. `git fetch <REMOTE>` —— 确保远端最新。
2. `git checkout <BASE_BRANCH>` + `git status --porcelain` 为空 —— 主仓库干净。
3. `git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>` —— 预测冲突；输出为**干净树哈希**（无 `CONFLICT` 行）= 零冲突预测。
4. 分支保护核验（若使用 `gh`）：
   `gh api repos/<OWNER>/<REPO>/branches/<BASE_BRANCH>/protection`
   - 返回 `404`（无分支保护）→ 走**本地 merge + 正常 push**（本 SOP 路径，合规）。
   - 返回保护规则 → 须走 PR 流程合并，**不在此 SOP 直接 push**。
   - ⚠️ 多 remote 下 `gh` 可能默认解析错误远端，必须显式 `--repo <OWNER>/<REPO>`。

### 7.3 执行合并（唯一命令）
```
git merge --no-ff <REMOTE>/<BRANCH> \
  -m "merge: <主题>（<BRANCH>）" \
  -m "来自分支 <REMOTE>/<BRANCH>，尖端 <TIP>" \
  -m "--no-ff 普通合并，保留中间提交；整段回滚：git revert -m 1 <合并碑>"
```
- 使用多条 `-m` 拼接碑正文，避免依赖外部消息文件（某些环境下消息文件路径不可写会导致 `could not read file` 失败）。
- 合并完成后用 `git rev-parse HEAD` 取得 `<MERGE_HASH>`，回填第三行 `-m` 中的占位（或合并后在变更文档中固化回滚命令）。

### 7.4 冲突处理（唯一策略 + 决策树）
若 `merge-tree` 预测有冲突，或合并时停在冲突态：

1. `git status` 查看冲突文件清单。
2. **手动 Edit 解决**，**禁止** `git checkout --ours/--theirs` 全量覆盖（会丢失对方依赖 / 功能）。
3. **按冲突类型决策**：
   - **版本号 / 元数据冲突**（版本字段、锁文件、变更文档、说明文档）：统一为目标基线版本（取 `<BASE_BRANCH>` 主线版本，因未发版且功能作同周期并入），**保留**功能分支新增依赖 / 条目。
   - **锁文件双冲突块**（如依赖清单的根 `version` 与包列表两处）：两处均解决为目标版本，保留完整依赖树，JSON 必须有效（用对应解析器校验）。
   - **最高优先级约定区域冲突**（项目声明的核心模块）：**立即暂停，告知用户**，不擅自解（见 3.5）。
4. `git add <file>` 逐个标记已解决。
5. `git commit`（合并继续；可 `--no-edit` 或补正文）。

### 7.5 合并碑结构验证（必须全满足，对照第 2 节矩阵）
- `git cat-file -p HEAD | grep -c parent` 输出 `2`（双父）。
- `git merge-base --is-ancestor <TIP> HEAD; echo $?` 输出 `0`（功能尖端可达）。
- `git log --oneline HEAD^2` 列出功能分支全部中间提交（谱系保留）。

### 7.6 合并后补充提交（唯一要求）
必须补充变更文档（CHANGELOG）与统一版本号，**此提交不改功能代码，仅文档 / 版本**。

1. **变更文档（CHANGELOG.md）**（Keep-a-Changelog 结构，`## [版本] - 日期` / `### Added` / `### Changed` / `### Fixed` / `### Notes`）：
   - 版本条目补「来源分支、基于 `<BASE_BRANCH>` @ `<hash>`」。
   - 补合并说明：`--no-ff` 合入 `<BASE_BRANCH>`，合并碑 `<hash>`，整段回滚 `git revert -m 1 <hash>`。
   - 若合并后有补充提交也改了变更文档，在 Notes 固化「干净回滚须两步：先 `git revert <补充提交>` 再 `git revert -m 1 <合并碑>`」。
   - 补最高优先级约定遵守声明。

2. **版本号一致性（若发版）**：各版本字段（包描述、应用清单、源码兜底字符串、说明文档引用等）须一致，均由单一事实源注入，兜底值同步。

3. 提交：`git commit -m "docs: 补充 CHANGELOG 与版本一致性（<version>）"`。

### 7.7 推送（唯一合规写法）
```
git push <REMOTE> <BASE_BRANCH>
```
- 无 `-f` / `--force` / `--force-with-lease`，合规，不触发硬禁令。
- 触发仓库 CI（若有），须全绿。

### 7.8 合并后验证（无歧义）
- CI 均 `success`（查法：`gh run list --repo <OWNER>/<REPO> --branch <BASE_BRANCH> -L 5`，最新若干条均绿）。
- 若功能分支曾开 PR：GitHub 自动识别合并碑为 merge commit，PR 标 `MERGED`。
- `git log --oneline --merges -1` 确认合并碑存在、功能提交保留。

---

## 8. 阶段四：整段回滚能力验证（建议，非强制但推荐）

目的：在合并后立即证明「整段可回滚」，且为非破坏性（不提交、可完全撤销）。

### 8.1 验证命令（非破坏性）
```
git revert --no-commit -m 1 <MERGE_HASH>
```
- 零冲突 → 回滚结构成立。
- 变更文档等冲突（因 7.6 补充提交也改了该文件）→ **预期内**，说明干净回滚需两步（见 8.3）。

### 8.2 立即恢复（必须）
```
git revert --abort
```
- 验证后**必须** `abort`，恢复干净工作树；不可遗留半回滚状态。

### 8.3 两步回滚路径（固化进变更文档 Notes）
- 若补充提交 `<FIX_HASH>` 改了被合并文件：`git revert --no-commit <FIX_HASH>` 然后 `git revert --no-commit -m 1 <MERGE_HASH>`（**零冲突**，全部功能文件被移除）；两次 `git revert --abort` 均可完全恢复。
- 或单步 `git revert -m 1 <MERGE_HASH>` 手动解冲突后提交。

---

## 9. 阶段五：清理工作树（按要求 / 条件）

### 9.1 判定条件（唯一，全部满足才清理）
- 代码已合并：`git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（合并碑第二父仍是主线 HEAD 祖先）。
- 工作树无独特未跟踪产物（代码已在主线保留）；若有用户想保留的未跟踪文件，**先备份**再清。
- 功能分支清理已完成或并行进行（见第 10 节）。

### 9.2 活跃工作树删除（gitdir 完好）
```
git worktree remove <WORKTREE_PATH>
```
- 要求：工作树干净（无未提交改动）；否则先 `commit` / `stash` 或加 `--force`。

### 9.3 失效游离工作树删除（gitdir 丢失）
- 判定：`git worktree list` **不登记**该路径 → 已游离（如外部同步 / 清理工具清空所致）。
- 删除：`rm -rf <WORKTREE_PATH>`（**不能**用 `git worktree remove`，因未登记）。
- ⚠️ 若操作系统对递归删除有拦截（如送回收站），确保确认已彻底移除；删除前确认已备份需保留的产物。

### 9.4 验证（无歧义）
- 目录已消失。
- `git worktree list` 仅余主仓库。
- `git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（代码未丢）。

---

## 10. 阶段六：清理分支（本地 + 远端，按要求 / 条件）

### 10.1 判定条件（唯一，全部满足才清理）
- 分支已合并（PR `MERGED` 或已 `--no-ff` 合入 `<BASE_BRANCH>`）。
- 删除不影响已 `MERGED` 的 PR（PR 关联基于**提交哈希**而非分支名；已 MERGED 的 PR 不因删分支悬空 / 关闭）。
- 与上游无 open PR（自有仓库流程上游通常无此分支，返回 404）。
- **已获得用户明确授权**（删远端分支属公开动作，硬禁令外仍须授权）。

### 10.2 三步走（唯一顺序）
1. 本地分支引用：`git branch -d <BRANCH>`（不存在则报 `not found`，跳过）。
2. 本地远程跟踪：`git branch -d -r <REMOTE>/<BRANCH>`。
3. 远端分支：`git push <REMOTE> --delete <BRANCH>`（**需用户明确授权**；非强推，合规）。

### 10.3 验证（无歧义）
- `git branch -a` 无 `<BRANCH>` 残留。
- `git ls-remote --heads <REMOTE> <BRANCH>` 输出为空。
- `git merge-base --is-ancestor <TIP> HEAD` 返回 `0`（提交未丢，仍在主线历史，因合并碑第二父引用）。
- `git fetch --prune` 清理陈旧远程跟踪引用（可选）。

---

## 11. 硬禁令与红线（唯一，不可逾越）

- 禁止 `git push --force` / `-f` / `--force-with-lease <REMOTE> <BASE_BRANCH>`。
- 禁止删除 `<REMOTE>/<BASE_BRANCH>` 分支。
- 合并与清理均**不改写历史**（无 `rebase -i` / `amend` 已推送提交）。
- 最高优先级约定区域冲突必须**暂停告知用户**，不得擅自丢弃。
- 删远端分支、打 tag、创建 Release 属公开动作，**须用户明确授权**后执行。

---

## 12. 验收闸门清单（四张，逐项打勾）

### 12.1 合并前（阶段三 7.2 预检）
- [ ] `git fetch <REMOTE>` 完成
- [ ] `git checkout <BASE_BRANCH>` 且 `git status --porcelain` 为空
- [ ] `git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>` 零冲突预测
- [ ] 分支保护核验返回 `404`（无保护）或已改走 PR 流程
- [ ] 功能分支 `<RUN_TESTS>` 零失败 + `<BUILD>` 成功

### 12.2 合并后（阶段三 7.5 + 7.8）
- [ ] 合并碑双父（`grep -c parent` = 2）
- [ ] `<TIP>` 是 HEAD 祖先（返回 0）
- [ ] 功能中间提交可见（`git log HEAD^2`）
- [ ] 四大约束验证矩阵（第 2 节）全满足
- [ ] 变更文档已补合并说明 + 回滚路径
- [ ] 版本号一致（若发版）
- [ ] `git push <REMOTE> <BASE_BRANCH>` 成功，CI 全绿

### 12.3 清理工作树前（阶段五 9.1）
- [ ] 代码已合并（`merge-base --is-ancestor <TIP> HEAD` = 0）
- [ ] 工作树无独特未跟踪产物（或已备份）
- [ ] `git worktree list` 确认活跃 / 游离状态，选对删除命令

### 12.4 清理分支前（阶段六 10.1）
- [ ] 分支已合并（PR MERGED 或 `--no-ff` 合入）
- [ ] 上游无 open PR（404）
- [ ] 已获用户删除远端分支授权
- [ ] 清理后 `merge-base --is-ancestor <TIP> HEAD` 仍返回 0（提交未丢）

---

## 13. 完整命令清单（可复制模板）

```bash
# ===== 参数（执行前填写）=====
# MAIN_REPO_PATH=<主仓库绝对路径>
# WORKTREE_ROOT=<工作树父目录>
# REMOTE=origin  BASE_BRANCH=main
# OWNER=<仓库归属>  REPO=<仓库名>
# BRANCH=feat/<topic>  TIP=<功能分支尖端哈希>  MERGE_HASH=<合并碑哈希>
# INSTALL_DEPS=<安装依赖命令>  RUN_TESTS=<测试命令>  BUILD=<构建命令>

# ===== 阶段一：开工作树 =====
git fetch <REMOTE>
git checkout <BASE_BRANCH>
git status --porcelain                  # 必须为空
git worktree add <WORKTREE_ROOT>/<topic> -b <BRANCH> <BASE_BRANCH>
cd <WORKTREE_ROOT>/<topic> && <INSTALL_DEPS>

# ===== 阶段二：工作树内开发测试 =====
cd <WORKTREE_ROOT>/<topic>
# ... 编码、多次提交 ...
<INSTALL_DEPS> && <RUN_TESTS> && <BUILD>     # 全绿才合并
git push -u <REMOTE> <BRANCH>               # 持久化引用（推荐）

# ===== 阶段三：合并（在主仓库）=====
cd <MAIN_REPO_PATH>
git fetch <REMOTE>
git checkout <BASE_BRANCH>
git status --porcelain                  # 必须为空
git merge-tree --write-tree <BASE_BRANCH> <REMOTE>/<BRANCH>   # 零冲突预测
gh api repos/<OWNER>/<REPO>/branches/<BASE_BRANCH>/protection  # 404=可直推
git merge --no-ff <REMOTE>/<BRANCH> \
  -m "merge: <主题>（<BRANCH>）" \
  -m "来自 <REMOTE>/<BRANCH>，尖端 <TIP>" \
  -m "整段回滚：git revert -m 1 <MERGE_HASH>"
# 冲突→手动 Edit（禁 --ours/--theirs）→git add→git commit
git cat-file -p HEAD | grep -c parent     # 必须=2
git merge-base --is-ancestor <TIP> HEAD && echo OK
# 补 CHANGELOG.md + 版本一致 → git commit -m "docs: 补充 CHANGELOG 与版本一致性"
git push <REMOTE> <BASE_BRANCH>            # 触发 CI

# ===== 阶段四：回滚验证（可选，非破坏性）=====
git revert --no-commit -m 1 <MERGE_HASH>
git revert --abort                        # 必须撤销

# ===== 阶段五：清理工作树 =====
git merge-base --is-ancestor <TIP> HEAD && echo OK
git worktree list                         # 活跃→git worktree remove；游离→rm -rf
rm -rf <WORKTREE_ROOT>/<topic>            # 或 git worktree remove
git worktree list                         # 仅余主仓库

# ===== 阶段六：清理分支（需授权）=====
git branch -d <BRANCH>                    # 不存在跳过
git branch -d -r <REMOTE>/<BRANCH>
git push <REMOTE> --delete <BRANCH>       # 需用户授权
git branch -a                             # 无残留
git ls-remote --heads <REMOTE> <BRANCH>   # 空
git merge-base --is-ancestor <TIP> HEAD && echo OK
```

---

## 14. 常见问题与唯一处置（通用化）

| 现象 | 根因 | 唯一处置 |
| --- | --- | --- |
| `git merge --no-ff -F <消息文件>` 失败 `could not read file` | 外部消息文件路径不可写 | 改用多条 `-m` 传碑正文 |
| 合并时版本号 / 元数据冲突 | 功能分支漏升 / 与主线分叉 | 统一目标版本，保留对方新增依赖 / 条目，手动 Edit |
| 锁文件两处冲突 | 根 version + 包列表双块 | 两处均解决为目标版本，保留依赖树，校验 JSON 有效 |
| 回滚变更文档冲突 | 合并后补充提交也改该文件 | 两步回滚（先 revert 补充提交再 revert 碑）或手动解冲突 |
| `git worktree remove` 报未登记 | 工作树失效游离（gitdir 丢失） | 改用 `rm -rf` 递归删除（确认已备份需保留产物） |
| `gh` 命令指向错误远端 | 多 remote 默认解析 | 所有 `gh` 显式 `--repo <OWNER>/<REPO>` |
| 删分支后 PR 消失 | 误以为 PR 关联分支名 | PR 关联提交哈希，已 MERGED 的 PR 不受影响 |
| 合并后无合并碑 | 误用 fast-forward / squash | 重做：确保 `--no-ff`；已推送则不要改写，另开说明 |

---

## 15. 风险与反模式

| 反模式 | 后果 | 正确做法 |
| --- | --- | --- |
| 用 squash 合并 | 丢中间提交、无合并碑、无法整段回滚 | 坚持 `--no-ff` |
| 用 rebase 合并 | 提交哈希改写、无合并碑 | 坚持 `--no-ff` |
| `reset --hard` + 强推回滚 | 违反禁强推规则、破坏协作 | 只用 `git revert` |
| 合并前不更新变更文档 | 发布无据、回溯困难 | 代码与文档成对提交 |
| 多个工作树 checkout 同一分支 | git 报错 overlaps | 一分支一工作树 |
| 任务改主线后未同步基线 | 功能合并冲突堆积 | 合并前先同步最新主线 |

---

## 16. 一句话方法论

**工作树并行写、普通合并留碑、测试合格才合、变更文档同步记、回滚只用 revert。**

---

*本 SOP 为方法论 + 操作规范双重文档。任何偏离「唯一写法 / 唯一判定」的变体均需先回到第 1 节心智模型复核，确认不违反四大约束后再执行。所有具体值以参数占位表示，执行时由操作方按当前项目填入，不得硬编码项目专名、版本号或环境专属细节。*
