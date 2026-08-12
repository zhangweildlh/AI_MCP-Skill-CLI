# 提交前文档同步·分层检查清单（权威数据）

> 本文件是 `github-personal-manager` 技能「提交前文档同步门禁」的**权威单一事源**。
> 它把两件事合并为一：① 按「本次改动类型」推导「应同步的文件集合」；② 把文件按重要性分入 Tier 1 / Tier 2 / Tier 3。
> 脚本 `scripts/sop_docs_sync_check.sh` 直接读取本文件第五节「权威检查清单数据块」的起止标记之间，据此**先查仓库是否存在这些文件 → 分析是否需改 → 输出同步状态**；智能体依据输出**先改文档、再提交(commit)、最后推送(push)**。
>
> 原则：**基于真实变化、就仓库实际存在的文件做同步，不臆测、不强制新建不存在的文件。**

---

## 一、核心流程（每次仓库代码/文件修改后）

```
改动发生
  │
  ▼
① 取真实变化：git status / git diff（含 --cached 与未暂存）/ git ls-files --others
  │
  ▼
② 推导改动类型：命令/配置/功能/接口/依赖/重命名/行为/文案/示例/文档
  │
  ▼
③ 按本清单「改动类型 → Tier 文件」映射，查仓库是否存在对应文件
  │
  ▼
④ 对存在的文件，分析是否需改内容以实现一致性
  │     - Tier 1 未同步 → 阻断（必须先改再提交）
  │     - Tier 2 未同步 → 强建议（提交前须处理，或显式说明为何不改）
  │     - Tier 3 未同步 → 提示（建议补测试/锁文件，不阻断）
  │
  ▼
⑤ 需改则先改（一并 git add），再提交(commit)，最后推送(push)
```

---

## 二、改动类型（Change Type）与判定特征

脚本依据「真实变化文件清单」自动判定改动类型（可多标签叠加）：

| 改动类型 | 触发特征（文件/内容层面） |
|---|---|
| `command` | 新增/删除/改名/改义的 命令、子命令、CLI flag、环境变量、启动参数 |
| `config` | 配置项、配置样例（`.env.example`/`config.example.*`）、默认配置、settings 变化 |
| `feature` | 新增/修改/删除的 公共函数、类、模块导出、HTTP 接口、对外能力（结构级） |
| `behavior` | 行为/语义/算法/默认值/输出格式/错误处理 变化（不改接口） |
| `dependency` | 依赖或包清单（`package.json`/`Cargo.toml`/`pyproject.toml`/`go.mod`/`requirements*.txt` 等）与锁文件变化 |
| `rename` | 变量名、文件名、目录结构、路径 重命名或调整 |
| `copy` | 用户可见文案、提示信息、错误码、国际化(i18n) 文案变化 |
| `example` | 示例、demo、quickstart 内容变化 |
| `docs` | 纯文档或代码注释变化（本身即文档改动，不触发"需再写文档"） |

> 若脚本无法判定出任何具体类型（如仅改了图片/数据等非代码资源），则视为 `UNKNOWN`，按**保守策略**：触发全部 Tier 2 检查项，避免漏检。

---

## 三、分层模型（Tier 1 / 2 / 3）

| 层级 | 含义 | 处理语义 | 退出码影响 |
|---|---|---|---|
| **Tier 1** | 仓库门面与版本记录（根 README / README_EN / CHANGELOG） | **阻断门禁**：存在但未纳入变更 → 必须先补文档再提交(commit) | 未同步 → `exit 2` |
| **Tier 2** | 仓库内次级文档与契约（docs/、CONTRIBUTING、配置样例、接口契约、i18n、examples） | **强建议**：存在但未纳入变更 → 提交前须处理，或显式说明为何不改；`--strict` 模式下同样阻断 | 仅报告（默认 `exit 0`；`--strict` 时 `exit 2`） |
| **Tier 3** | 测试与构建清单（测试文件、包清单、锁文件） | **提示**：行为/依赖变化建议补测试或同步锁文件；不阻断 | 仅报告（`exit 0`） |

> 说明：Tier 1/2 的"文档类"文件（README、CHANGELOG、docs/*.md、CONTRIBUTING）**自身被改动时**，不视为"触发门禁的真实变化"——即只改文档不算"代码未同步文档"。Tier 2 的"制品类"文件（配置样例、接口契约、i18n、examples）被改动时，仍视为真实变化（它们常与代码/接口耦合）。

---

## 四、改动类型 → 应同步文件 映射表

| 改动类型 | 主要应查 Tier 1 | 主要应查 Tier 2 | 主要应查 Tier 3 |
|---|---|---|---|
| `command` | README（用法段）、CHANGELOG | 配置样例、接口契约、docs（用法）、examples | 测试（新 flag 需测） |
| `config` | README（若影响使用）、CHANGELOG | 配置样例、docs | 包清单/锁文件（若新增依赖） |
| `feature` | README（功能列表）、CHANGELOG | 接口契约、docs（接口/架构）、CONTRIBUTING、examples、i18n | 测试（接口变更需测） |
| `behavior` | README（若影响使用）、CHANGELOG | docs | 测试 |
| `dependency` | README（若影响安装/使用） | docs | 包清单、锁文件 |
| `rename` | README（路径/引用） | docs（路径）、examples | — |
| `copy` | README（若提及） | i18n（对应文案） | — |
| `example` | — | examples、README（示例段） | — |
| `docs` | README/CHANGELOG（若相关） | docs | — |
| `UNKNOWN` | 全部 Tier 1 | 全部 Tier 2（保守） | 全部 Tier 3（提示） |

---

## 五、权威检查清单数据块（脚本可解析，勿手改格式）

> 脚本只读此块。每行格式：`层级|探测glob(可多个，用 ; 分隔)|触发改动类型(逗号分隔或 *)|文件性质(doc=文档类/artifact=制品类)|说明`
> - `层级`：1 / 2 / 3（见第三节）。
> - `探测glob`：`**/` 表示递归 `find`；含 `/` 表示「目录/文件名」一层；无 `/` 表示仓库根一层。
> - `触发改动类型`：`*` 表示任何改动都查；否则仅当检测到列出的改动类型时才查。
> - `文件性质`：`doc` = 该文件自身被改时不触发门禁；`artifact` = 该文件被改时仍视为真实变化。

<!--SYNC-CHECKLIST-START-->
1|README.md|*|doc|根级说明文档（项目门面：命令/配置/依赖/接口/功能/目录结构）
1|README_EN.md|*|doc|英文说明文档
1|CHANGELOG*.md|*|doc|版本变更日志（功能性/可见行为变化）
2|docs/**/*.md|command,feature,dependency,rename,behavior|doc|架构与使用文档目录
2|CONTRIBUTING*.md|feature,dependency,rename|doc|贡献指南
2|*.example.*;.env.example|command,config|artifact|配置样例
2|openapi*.yaml;openapi*.json;schema*.proto;*.graphql;api*.md|feature|artifact|接口契约
2|locales/**/*.json;locales/**/*.po;i18n/**/*.json|copy,feature|artifact|国际化文案
2|examples/**/*|example,feature,command|artifact|示例代码
3|test/**/*;tests/**/*;spec/**/*;**/*_test.py;**/*.test.ts;**/*.spec.ts|test,feature,behavior,dependency|artifact|测试（提示：行为/功能/接口变动建议补测）
3|package.json;Cargo.toml;pyproject.toml;go.mod;requirements*.txt;*.csproj;pom.xml|dependency|artifact|包清单
3|package-lock.json;Cargo.lock;uv.lock;yarn.lock;go.sum;pnpm-lock.yaml;poetry.lock|dependency|artifact|锁文件
<!--SYNC-CHECKLIST-END-->

---

## 六、与现有规则关系

- 本清单**不绕过**任何顶级全局禁令（禁止强推/删除 main、二次显式授权铁律）与路径核验硬规则。
- 它是「标准代码修改工作流程」阶段 2「提交(commit)前硬门禁」的可执行实现；与阶段 0 闸门（完整性/正确性/静态校验）并列、互补。
- 免触发边界：① 本次仅改动文档本身（无代码/文件真实变化）；② 仓库管理类动作（同步巡检的 merge、Release 打标签、分支清理）不产生新代码变化，不强制再写文档。
- 修改本清单：若需增删同步文件或调整分层，只改第五节数据块与第四节映射表，并**同步更新** `scripts/sop_docs_sync_check.sh` 内的回退清单（若 references 文件缺失时）与 `SKILL.md` 中的引用。
