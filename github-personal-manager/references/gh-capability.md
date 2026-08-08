# gh 能力全览

> 本表为 `gh` CLI 能力清单（占位符 `<owner>/<repo>` 等，不写死具体账号/路径）。✅ 表示已在某环境实跑验证、可放心使用。版本与 scopes 取决于运行环境的 `gh`（`gh --version` / `gh auth status` 自查）。

## 认证与配置
| 命令 | 作用 |
|------|------|
| `gh auth login` / `logout` / `status` / `refresh` / `switch` | 登录/退出/查看/刷新/切换账号 |
| `gh config get` / `set` | 读写 `gh` 配置（默认编辑器、git protocol 等） |
| `gh auth setup-git` | 桥接令牌到 git credential（本机 `credential.helper` 为空时 `git push` 需此） |

## 仓库管理（gh repo）
| 命令 | 作用 |
|------|------|
| `gh repo view [owner/repo]` | 查看仓库元信息（描述、语言、星标、README 文本）✅ |
| `gh repo clone <repo>` | 克隆仓库（等价于 `git clone`，自动用 gh 协议）；克隆到本地后，后续 git 命令用 `git -C "D:/绝对/Windows/路径"` 或先 `cd /d/绝对/路径` 再执行，避免 `git -C /d/...` 在 Git Bash 下误报 `not a git repository`（详见「路径核验防误报」规范） |
| `gh repo fork <repo>` | Fork 到本人账号（标准流程阶段 1 前置） |
| `gh repo create` | 新建仓库（private/public/desc） |
| `gh repo list` | 列出当前账号/组织的仓库 |
| `gh repo sync` | 将 fork 与 upstream 同步 |
| `gh repo rename` / `delete` / `archive` / `unarchive` / `edit` | 仓库维护操作 |

## Pull Request（gh pr）
| 命令 | 作用 | 对应阶段 |
|------|------|----------|
| `gh pr create` | 开 PR（`--repo`/`--base`/`--head`/`--title`/`--body`/`--body-file`） | 阶段 2 |
| `gh pr list` / `view` | 列出/查看 PR | 全阶段 |
| `gh pr checks` | 查看 PR 的 CI 状态（轮询） | 阶段 2/3 |
| `gh pr diff` | 查看 PR 差异 | 阶段 2 自审 |
| `gh pr review` | 提交 review（approve/request-changes/comment） | — |
| `gh pr merge` | 合并 PR（自有仓库/自测 PR 用） | 阶段 4 |
| `gh pr checkout` | 拉取 PR 到本地分支 | 阶段 5 |
| `gh pr comment` / `close` / `reopen` / `edit` | PR 互动 | — |

## Issue 跟踪（gh issue）
| 命令 | 作用 |
|------|------|
| `gh issue create` / `list` / `view` | 建/列/查 Issue |
| `gh issue close` / `reopen` / `comment` / `edit` / `delete` | Issue 维护 |
| `gh issue status` | 查看与本人相关的 Issue/PR 总览 |

## 全站搜索（gh search）
| 命令 | 作用 | 验证 |
|------|------|------|
| `gh search repos "<q>" [--language --stars --owner]` | 搜仓库 | ✅ 返回全球公开仓库 |
| `gh search code "<q>" [--repo --language]` | 搜代码（仅默认分支） | ✅ 返回跨文件命中行 |
| `gh search issues "<q>"` | 搜 Issue | 可用 |
| `gh search prs "<q>"` | 搜 PR | 可用 |
| `gh search commits "<q>"` | 搜提交 | 可用 |

## 原生 API 访问（gh api）
- 调用任意 GitHub REST 端点：`gh api repos/<owner>/<repo>/contents/<path>` 读文件、`gh api user` 看本人信息。
- 支持 GraphQL：`gh api graphql -f query='...'`（分支保护即用此）。
- 常用选项：`-H` 自定义头、`-F` 参数、`-q` jq 过滤、`--silent`、`--hostname`（GitHub Enterprise）。
- REST 搜索等价：`gh api "/search/repositories?q=..."`。✅ 验证示例：`gh api repos/<owner>/<repo>/contents/<path> -q .content` 返 base64（解码后为 `# <repo>…`；已用真实仓库实测通过，此处以占位符 `<owner>/<repo>` 表达可移植）。

## CI/CD（gh run / gh workflow）
| 命令 | 作用 | 对应流程 |
|------|------|----------|
| `gh run list` | 列出 workflow runs | 阶段 2/3 轮询 |
| `gh run view` / `watch` | 查看/等待 run 完成 | 阶段 2/3 |
| `gh run rerun` / `cancel` | 重跑/取消 | — |
| `gh run download [--log/--log-failed]` | 下载日志（排错） | CI 失败时 |
| `gh workflow list` / `view` / `run` / `enable` / `disable` | 管理工作流（fork 启用 Actions 后） | 编译与构建规则 |

## 发布与制品（gh release）
| 命令 | 作用 |
|------|------|
| `gh release create <tag>` | 基于 tag 发布 Release |
| `gh release upload` / `download` | 上传/下载附件（构建产物） |
| `gh release list` / `view` / `delete` / `edit` | Release 维护 |

## 代码片段（gh gist）
`gh gist create` / `list` / `view` / `edit` / `delete` —— 管理 Gist 文本片段（贴配置、报错）。

## 密钥与变量（gh secret / gh variable）
| 命令 | 作用 |
|------|------|
| `gh secret set` / `list` / `get` / `remove` | 仓库/组织/环境级加密密钥（CI 用） |
| `gh variable set` / `list` / `get` / `delete` | 非机密变量（CI 用） |

> 写密钥通常需 `read:org`/`admin:org` scope（本机令牌含 `admin:org`，可用）。

## 标签/项目/规则集
| 命令 | 作用 |
|------|------|
| `gh label create` / `list` / `clone` / `edit` / `delete` | Issue/PR 标签管理 |
| `gh project list` / `view` / `item-add` / … | Projects V2（beta） |
| `gh ruleset list` / `view` / `check` / `create` / `update` / `delete` | 分支保护规则集（需相应权限） |

## 扩展与定制
| 命令 | 作用 |
|------|------|
| `gh extension install` / `list` / `create` / `remove` / `upgrade` | 安装社区扩展 |
| `gh alias set` / `list` / `delete` / `import` / `export` | 命令别名 |
| `gh completion` | 生成 shell 自动补全 |

## 其他
- `gh codespace ...`：Codespaces 生命周期管理（create/ssh/code/cp/delete）。
- `gh copilot ...`：交互式 Copilot（explain/suggest，gh 2.49+）。
- `gh attestation verify`：SLSA 制品来源校验。
- `gh billing ...`：查看 Actions/Packages/Storage 用量（需 admin 权限）。
- `gh status`：概览与本人相关的 PR/Issue。
- 统一输出格式：`--json <fields>` + `-q <jq>` 或 `-t <go-template>`，便于脚本化过滤。

## 能力边界（重要）
| `gh` 不能做 | 归属 |
|------------|------|
| 本地提交/暂存/分支切换/rebase/diff（工作区） | 归 `git`（阶段 0/1/3 本地动作） |
| 编译、运行、测试代码 | 归 CI（`gh run`）或本地工具链 |
| 渲染 Markdown 为网页（导航/图片/样式） | 仅取原始文本，渲染需 Web |
| 直接读取非默认分支被代码搜索索引的内容 | 代码搜索仅索引默认分支 |
| 修改他人仓库（无写权限时） | 只读；改动须走 Fork+PR |
| `gh api repos/<owner>/<repo>/tags` 默认分页（常仅返最新 ~30 个标签） | 核对标签**全集**差集须用 `git ls-remote --tags <remote>`（无分页），勿凭 `gh api tags` 单页推断"本地独有/缺失"——单页易漏判而误删 |
