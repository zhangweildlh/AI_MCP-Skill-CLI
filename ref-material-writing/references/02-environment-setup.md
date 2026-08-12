# 全局环境约束与工具前置流程

## 全局环境约束（强制遵循）

**本 Skill 默认遵循以下"全局环境约束"规则。但是，如果本 Skill 内部某个功能模块、函数或语句段显式指定了该模块的"环境约束"规则（比如 输出文件的文件名生成规则、保存路径或文件格式 ），则优先遵循该模块内部的指定，该指定仅作用于该模块，不能污染或覆盖本 Skill 其他模块的默认行为。**

1. **[占位符]**：使用 `[]` 和 `<>` 作为占位符标识，比如 `[输出目录]`、`[文件名.docx]` 、`[需要输入的内容]`；在构造实际命令时替换为"实际输出路径"、"实际文件名"和"实际待写入的内容"。
2. **[当前工作目录]**：存放**待处理的输入文件**（如用户提供的 参考资料、文件等）的父目录。默认路径为：`[默认下载目录]`（由用户指定或运行环境解析，运行时解析为实际下载目录，禁止写死字面绝对路径）。
   - 如果用户明确指定了绝对路径的 "当前工作目录"，则**直接使用**该路径；如果用户明确指定了相对路径的 "当前工作目录"，则将其解析为：[当前工作目录]/[相对路径]；否则使用**默认路径**。
   - 这是本 Skill 执行任务时，读取用户提供的**输入文件**（如 参考资料、文件等）的根目录。此目录仅用于定位数据源和文件源，不用于查找 Skill 定义或可执行代码。
   - Shell 与 Powershell 工作目录**必须**切换到此路径。
3. **[输出目录]**：所有输出文件和最终交付成果的根目录；默认路径为：`[默认下载目录]`（由用户指定或运行环境解析，运行时解析为实际输出根目录，禁止写死字面绝对路径）。
   - 如果用户明确指定了绝对路径的 "输出目录"，则**直接使用**该路径；如果用户明确指定了相对路径的 "输出目录" ，则将其解析为：[输出目录]/[相对路径]；否则使用**默认路径**。
4. **[Skill技能根目录]**： Skill 相关资产存放的根目录（SKILL.md 定义文件、子 Skill 定义文件、脚本、资源、模板等）；默认路径由用户提供或运行环境解析（运行时按 `[Skill技能根目录]/[name]` 拼接为绝对路径，禁止写死字面绝对路径）。
   - 如果用户明确指定了绝对路径的 "[Skill技能根目录]" ，则**直接使用**该路径；如果用户明确指定了相对路径的 "[Skill技能根目录]" ，则将其解析为：[Skill技能根目录]/[相对路径]；否则按下面第 5 条执行。
5. **[name]目录**：本 Skill 所有资产存放目录，即 YAML frontmatter 中的 `name` 。该目录位于[Skill技能根目录]中：[Skill技能根目录]/[name]。
   - 本 Skill 定义文件存放于此目录中。
   - 本 Skill 使用**相对路径**（如 `./references/01-writing-standards.md` 或 `references/01-writing-standards.md`）加载、调用子 Skill或加载、阅读资源文件或者使用模板文件时，**必须**以此目录作为相对路径的解析根目录（如 `[Skill技能根目录]/[name]/references/01-writing-standards.md` ），而不依赖于当前工作目录（CWD）。
6. **[临时目录]**：所有下载缓存、数据缓存等临时文件存放的父目录；默认路径为：当前系统环境变量 `TMP` (在本地 Powershell 中使用命令 `$env:TMP` 查询；在本地 CMD 中使用命令 `echo %TMP%` 查询)。
7. **所有 `shell_exec` 执行命令的 `cwd` 始终为 `[当前工作目录]`。但若命令中使用了相对路径，则一律先拼接为绝对路径后传入命令，不依赖 `cd` 操作。**
   - 若相对路径指向 Skill 内部资产（如 `references/`、`assets/` 等），则拼接根为 [Skill技能根目录]/[name]。
   - 若指向用户输入数据或输出文件，则拼接根为 [当前工作目录] 或 [输出目录]（视具体命令语义而定）。
8. **连接符限制（必须执行）**：本地 Powershell 环境限制，多命令组合运算时**仅允许**使用以下两个连接符：
   - **顺序执行**：使用英文分号 `;`（用于连接无数据传递的多个命令）。
   - **管道传递**：使用英文竖线 `|`（用于将前一个命令的 `Stdout` 传递为后一个命令的 `Stdin`）。
   - **严格禁止**使用的符号：`&&`、`||`、`&`。
9. **强制转换规则（必须执行）**：当用户输入或运行脚本中检测到 `&&`、`||`、`&` 符号时，必须依据命令意图：若原意是顺序执行多个无依赖的命令，替换为英文分号 `;`；若原意是将前一个命令的输出传递给后一个命令作为输入，替换为英文竖线 `|`。
   - **注意**：`&&` 和 `||` 原本具有条件逻辑，替换为 `;` 后将变为无条件顺序执行，请确保此逻辑变更符合用户意图，若冲突需提前告知用户。
10. **单次 shell_exec 命令字符串总长度不得超过 7000 字符（含空格和标点符号）。** 超过则必须拆分为多个自包含的 shell_exec 调用。
11. **`shell_exec` 每次调用启动独立的 PowerShell 会话**，因此无法跨 `shell_exec` 传递变量、数据。
12. **文件名生成规则**：当模块未指定文件名时，应根据 "[本次撰写的主题]" 和 "[当前时间戳]"生成有意义的文件名。生成前须检查输出目录是否已存在同名文件，若存在则自动添加序号（如 `-1`、`-2`），确保不会覆盖已有文件。
    - **[本次撰写的主题]**：如果用户明确指定，则**直接使用**，否则由 AI 根据步骤1中的写作需求提炼关键词生成，中文字符，不含标点符号。
    - **[当前时间戳]**：格式："yyyy-MM-dd-HH-mm-ss"，取系统当前日期，**通过 PowerShell 命令 `Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'` 获取**。
13. **输出格式默认值**：如果用户在调用本 Skill 时明确指定了**最终文稿**的文件格式（如 `.md`），则使用用户指定的格式输出**最终文稿**。否则默认采用 `.docx` 文件格式输出**最终文稿**。
14. **降级规则**：如果因技术原因导致无法生成 `.docx` 文件或者写入失败（含「步骤9：结构化输出」降级规则触发），则自动改用 Markdown 格式（`.md`）重新输出、保存，并以自然语言告知用户已降级。
15. **AnySearch 内嵌命令（双引擎搜索专用，自包含）**：步骤5 / 步骤2 调用 AnySearch 时，**必须**使用固定命令 `<ANYSEARCH_CMD> <子命令> [选项]`，且**严禁省略** UV 前缀而直接使用 `python`：
    - **命令本体唯一定义于 `references/13-anysearch-integration.md` §1（单一事实源）**，本文件只引用不重复写死；调用前先读该节取得完整前缀（`<ANYSEARCH_CMD>`）再展开。
    - 该命令指向本技能**内嵌自包含**的 AnySearch CLI 副本（`scripts/anysearch_cli.py`），API key 由技能根 `.env`（`ANYSEARCH_API_KEY`）自动加载，命令中无需传 key；本技能不依赖任何外部 Skill。
    - 内嵌副本路径统一用基于技能目录的相对路径 `scripts/anysearch_cli.py`（运行时按技能目录 `[Skill技能根目录]/[name]` 拼接为绝对路径，不依赖 CWD），**禁止硬编码 ref-material-writing 的绝对目录**；references/13 §1 定义的 UV 环境前缀须保留。
    - **⚠️ 路径分隔符（U1 修复，强制）**：本命令及本 Skill 所有命令中的路径**统一用正斜杠 `/`**（如 `D:/Tools/...`、`D:/Documents/...`）。若 `shell_exec` 宿主为 Bash（Git Bash 等 POSIX shell），反斜杠 `\` 会被 Bash 当作转义字符导致路径被吃字符、命令失败；正斜杠在 Bash 与 PowerShell 宿主下均可用，故统一正斜杠（PowerShell 宿主下反斜杠虽可用，但为跨宿主一致，不用反斜杠）。
   - **⚠️ 前置预检（与 §"使用外部命令前置工作流程"一致）**：AnySearch CLI 依赖 references/13 §1 指定的本地 UV 环境与技能根 `.env` 的 `ANYSEARCH_API_KEY`，首次使用前须确认 `uv` 可用且技能根 `.env` 已就位（key 缺失则自动匿名降级，见 `references/13-anysearch-integration.md` §4，不阻断流程）。

---

## Firecrawl 访问路径（直连或中继，由 Gate-0 探测）

**Firecrawl 全部能力（search / scrape / extract / agent / map / crawl / batch / interact）经下列两种形态之一调用，形态由 Gate-0（`_router/bootstrap.md`）探测并写入「工具能力映射表」：① 直连形态——工具集直接出现 `firecrawl_*`（或平台前缀 `mcp__firecrawl__*`），直接调用；② 中继形态——经 Dynamic-mcp 连接器调用。两种形态皆可，禁止臆造工具名/组名（须以 `list_groups`/`get_dynamic_tools`/平台工具列表实际返回为准）。环境实测（仅中继形态）：连接器重连后会丢失 `call_dynamic_tool` 索引，须以 `ToolSearch` 重索引兜底（见第 5 条）。

1. **发现（确认可用）**：
   - 直连形态：工具集直接出现 `firecrawl_*`（或平台前缀 `mcp__firecrawl__*`），无需额外发现步骤。
   - 中继形态：`mcp__Dynamic-mcp__get_dynamic_tools(group="firecrawl-mcp")` 返回该连接器下全部 `firecrawl_*` 工具名与 schema（组名以 `list_groups` 实际返回为准）。`_router/bootstrap.md` 的「工具能力映射表」与状态文件「双引擎搜索能力状态」据此登记 Firecrawl 能力状态与形态。
2. **调用（实际执行）**：
   - 直连形态：`firecrawl_<工具名>(args={<参数>})`（或 `mcp__firecrawl__firecrawl_<工具名>(args={<参数>})`）。
   - 中继形态：所有 Firecrawl 调用形如 `mcp__Dynamic-mcp__call_dynamic_tool(group="<实际组名>", name="<工具名>", args={<参数>})`。
   例如：`name="firecrawl_search"` / `"firecrawl_scrape"` / `"firecrawl_extract"` / `"firecrawl_agent"` / `"firecrawl_agent_status"` / `"firecrawl_map"` / `"firecrawl_crawl"` / `"firecrawl_batch_scrape"` / `"firecrawl_interact"`。
3. **重索引兜底（关键，仅中继形态）**：
   若 `call_dynamic_tool`（或 `get_dynamic_tools`）不在当前可用工具索引——典型表现：Agent/LLM 看不到该工具，或调用报"未知工具 / 未注册"——**先 `ToolSearch` 重索引** `mcp__Dynamic-mcp__call_dynamic_tool` 与 `mcp__Dynamic-mcp__get_dynamic_tools`，重索引成功后再发起调用。此兜底应在每个新会话首次调用 Firecrawl 前稳定生效。
4. **异步轮询**：`firecrawl_agent`（AGENT_SEARCH）为异步任务，提交后必须轮询 `firecrawl_agent_status(args={id})` 至 `completed`（最多 30 次），失败/过期回退同步降级路径（见 `_router/step-05.md` 轨道B 的 fb 分支）。
5. **关键约束（代码实证）**：请求体 `z.strictObject` 禁多余字段；`waitFor ≤ timeout/2`；`includeDomains` 与 `excludeDomains` 互斥；`json` 与 `deterministicJson` 互斥；`extract.urls` 单次 ≤10；`map.limit` ≤100000；`search` 中 `lang/tbs/filter` 仅 web/news 继承；`country` 未设且无 location 默认 `"us"`，中文研究须显式 `country:"cn"`。
6. **权威参考**：能力目录与「写稿缺口→Firecrawl 能力」AI 决策矩阵见 `references/14-firecrawl-guide.md`；步骤5 联网补全用法见 `_router/step-05.md` §5.5 / §5.10。

---

## 使用外部命令、工具 Tool 或者 CLI 前置工作流程

1. 调用工具 `shell_status` 查询本地系统环境和 Shell 环境。当本地环境为 Windows + PowerShell 时，**严格执行本工作流程的后续操作**，否则告知用户，并继续操作。

2. **当前对话会话中，每个未曾真实验证过可用性和用法的外部命令、工具或 CLI，在执行任何包含该命令的操作之前，必须先执行本工作流程进行验证。** 已验证的命令信息可在当前对话会话中复用（通过上下文记忆，无需额外存储）。

3. 参照「前置工作流程命令示例一」**依次**构造实际命令，并调用工具 `shell_exec` 执行。根据返回信息（路径、版本、帮助内容），判断外部命令、工具 Tool 或者 CLI 是否可用，并明确其使用方法、参数设置等。
   - 先执行 `where.exe [待查询的外部命令、工具 Tool 或者 CLI]`，检查外部命令是否存在，并获取完整路径。
   - 再执行 `[待查询的外部命令、工具 Tool 或者 CLI] --version`，获取版本信息。
   - 最后执行 `[待查询的外部命令、工具 Tool 或者 CLI] --help`，获取使用方法、参数设置等信息。
   - **`where.exe`、`--version`、`--help` 中，任一条执行成功（退出码为0），且返回的信息非空，则视外部命令、工具 Tool 或者 CLI 为可用。**
   - **注意**：如果命令路径包含空格，请在构造命令时使用双引号包裹。

**前置工作流程命令示例一**

```powershell
# 查询外部命令是否存在。若存在，则返回完整路径。
where.exe [待查询的外部命令]
# 示例： `where.exe officecli`

# 查询外部命令的版本号。
[待查询的外部命令] --version
# 示例： `officecli --version`

# 查询外部命令的使用方法、参数设置。
[待查询的外部命令] --help
# 示例： `officecli --help`
```

4. 外部命令、工具 Tool 或者 CLI 不可用，则以自然语言告知用户不可用的具体原因，并在后续对话会话中禁止调用该命令。

---

## 版本差异与 Help-First 标准（强制）

**不同版本的外部命令 / CLI 参数可能不同，尤其 `officecli`。** 本 Skill 遵循以下标准：

1. **失败即查 help**：任何外部命令（尤其 `officecli`）执行失败后，必须运行该命令的 `--help`（或 `officecli help docx <element>`）获取**当前版本权威帮助**，以此作为使用标准并重试；**禁止凭记忆硬编码 flag**。
2. **officecli 专项**：验证 / 用法统一以 `officecli --help` 为权威（详见 `references/04-officecli-guide.md` 的 Help-First Rule）。
3. **工具名动态解析**：本 Skill 的步骤模块不硬编码平台特定工具名。会话开始由 `_router/bootstrap.md`（Gate-0）探测全部逻辑原语（READ_FILE / WRITE_FILE / FILE_STAT / WEB_SEARCH / WEB_FETCH / AGENT_SEARCH / EXTRACT / SHELL / OFFICE / ANYSEARCH / NATIVE_WEB）的可用工具，生成「工具能力映射表」写入状态文件；后续步骤一律引用映射表。例外：ANYSEARCH 为固定外部命令（命令本体唯一定义于 references/13 §1 单一事实源，见约束 15），不纳入动态探测，直接登记调用命令。Firecrawl 与 AnySearch 在步骤5 为双引擎平权并行；LLM 原生 `web_search`/`web_fetch`（NATIVE_WEB）为补偿/降级通道；原生文件工具优先于 MCP。

---

## 状态文件模板

本 Skill 采用「_流水线状态.md」轻量级状态文件对抗上下文语义稀释。状态文件模板位于 `assets/_流水线状态.md`，由 AI 在 Gate-0（`_router/bootstrap.md`）阶段创建，步骤1 填充全局参数。

状态文件包含 14 个字段：
1. **当前步骤**："步骤N / 共10步"
2. **全局参数**：12维度核心参数、全局路径配置
3. **全局约束摘要**：8条核心约束
4. **前序产出清单**：所有已完成步骤的产出文件路径（须为绝对路径）
5. **待办下一步**："加载X文件，执行步骤N+1"
6. **分片进度**：仅步骤9使用，记录当前分片进度
7. **验证状态**：前序产出清单验证结果
8. **时间戳**：最后更新时间
9. **双引擎搜索能力状态（§9）**：AnySearch/Firecrawl 可用状态、组合判定、Firecrawl 访问形态
10. **已确认节点（§10）**：步骤1/4 确认节点，续跑免重复打扰
11. **决策日志（§11）**：用户关键决策跨会话继承
12. **阶段检查点（§12）**：步骤内子阶段断点定位（关键词级/分片级）
13. **工具能力映射表（§13）**：Gate-0 探测的原语→工具绑定与 Firecrawl 访问形态，续跑权威真相源
14. **逐步自检登记（§14）**：每步 [验证] 末尾写入的✅通过 + 轻签名，下游信任依据（防跨会话/跨步骤重复全量复检）
- **强制要求**：每个步骤执行前必须读取、执行完成后必须更新
