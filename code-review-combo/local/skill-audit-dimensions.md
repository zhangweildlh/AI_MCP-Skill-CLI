# 本地增强：Skill 结构质量镜

> 本文件属于 code-review-combo 本地化增强，判据为 combo 自有定义。
> 与 super-philosophy.md 同形态：跨切面质量镜，不是独立审查路，不新增子技能，
> 不改 merge_reports / JSON Schema / 三路流水线 / 单一写者契约。发现以 category: other
> 进入既有 findings[]，严重度按本文件「严重度口径」判定。

## 适用范围与形态判定

- `skill-dir`：目录型 Skill（有独立目录与 SKILL.md）。
- `skill-file`：单文件型 Skill（仅一个定义文件）。
- 每条维度先标「适用 / ⊘ 不适用」；**⊘ 不计入问题、不计入严重度分布**。
- 与文本规则镜（text-rules-audit.md）叠加使用：Skill 审计同时套用结构镜 + 文本规则镜。

## 严重度口径（combo 语义为唯一权威）

- `high`：致不可用 / 误触发的结构缺陷，但非运行时数据丢失（不占 critical）。
- `medium`：自洽 / 歧义 / 边界缺失，影响可靠性。
- `low`：组织 / 体量 / 可维护性建议。
- `⊘`：形态不适用标记，**不是严重度**（如单文件型无目录结构时 SA-2 标 ⊘）。
- `critical`：专留给运行时后果（安全绕过 / 数据丢失 / 线上故障）；文档 / 结构缺陷默认不占，
  除非明文凭证等直接致运行时危害者，升 `security` / `critical`。

## 维度清单（SA-1 ~ SA-9）

- **SA-1 元数据头完整性**（适用 skill-dir / skill-file）：是否具备可解析的 name / description，字段格式是否合规 → `high`。
- **SA-2 命名与载体一致性**（适用 skill-dir；**单文件型 ⊘ 不适用**）：目录型的名称与目录名是否对应；单文件型此维标 ⊘ → `high`。
- **SA-3 渐进式加载适配**（适用 skill-dir / skill-file）：入口精简、详细内容外置、引用相对路径 → `low`。
- **SA-4 字段自洽**（适用 skill-dir / skill-file）：描述与正文、声明工具与实际调用、示例与规则是否一致，有无规则冲突 → `medium`。
- **SA-5 参数体系**（适用 skill-dir / skill-file）：参数名 / 类型 / 必填 / 说明齐全，占位变量全声明 → `medium`。
- **SA-6 可执行无歧义**（适用 skill-dir / skill-file）：判定条件可客观验证、无模糊词，异常 / 空结果 / 超范围有处理 → `medium`。
- **SA-7 通用无硬编码**（适用 skill-dir / skill-file）：无特定数值 / 人名 / 地名 / 机器路径，可变内容参数化 → `medium`。
- **SA-8 示例有效性**（适用 skill-dir / skill-file）：含典型与边界示例，示例与参数 / 输出规范一致 → `medium`。
- **SA-9 触发匹配**（适用 skill-dir / skill-file）：description 是否覆盖核心功能 / 关键词 / 触发条件 / 适用场景 / 不适用场景 → `high`。

## 与严重度来源信号的对应（思想参考，非内联）

输入信号仅作分类参考（致命 / 严重 / 一般 / 不适用），落地一律用 combo 自有映射：
致命 → `high`、严重 → `medium`、一般 → `low`、不适用 → `⊘` 标记。

## 输出纪律

每条发现须锚定到被审文件的具体行或章节；**无法定位者写入 Residual Risks，不进 findings[]**。
每一维度（含 ⊘ 判定）在覆盖笔记留痕，确保全场景 × 全边界可核对。
