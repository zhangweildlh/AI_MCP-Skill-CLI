# Deepseek++ 记忆

## 当前工作目录、Skill技能根目录和GitHub仓库根目录

1. **[占位符]**：使用 `[]` 和 `<>` 作为占位符标识，比如 `[输出目录]`、`[文件名.docx]` 、`[需要输入的内容]`；在构造实际命令时替换为"实际输出路径"、"实际文件名"和"实际待写入的内容"。
2. **[当前工作目录]**：存放**待处理的输入文件**（如用户提供的 参考资料、文件等）的父目录。默认路径为： `D:/Documents/Downloads` 。
   - 如果用户明确指定了绝对路径的 "当前工作目录"，则**直接使用**该路径；如果用户明确指定了相对路径的 "当前工作目录"，则将其解析为：[当前工作目录]/[相对路径]；否则使用**默认路径**。
   - 这是本 Skill 执行任务时，读取用户提供的**输入文件**（如 参考资料、文件等）的根目录。此目录仅用于定位数据源和文件源，不用于查找 Skill 定义或可执行代码。
   - Shell 与 Powershell 工作目录**必须**切换到此路径。
3. **[Skill技能根目录]**：所有 Skill 资产存放的根目录（SKILL.md 定义文件、子 Skill 定义文件、脚本、资源、模板等）；默认路径为： `D:/Documents/AI_MCP-Skill-CLI` 。
   - 如果用户明确指定了绝对路径的 "Skill技能目录" ，则**直接使用**该路径；如果用户明确指定了相对路径的 "Skill技能目录" ，则将其解析为：[Skill技能根目录]/[相对路径]；否则按下面第 5 条执行。
4. **[name]目录**：本 Skill 所有资产存放目录，即 YAML frontmatter 中的 `name` 。该目录位于[Skill技能根目录]中：[Skill技能根目录]/[name]。
   - 本 Skill 定义文件存放于此[name]目录中。
   - 本 Skill 使用**相对路径**（如 `./references/01-writing-standards.md` 或 `references/01-writing-standards.md`）加载、调用子 Skill或加载、阅读资源文件或者使用模板文件时，**必须**以此目录作为相对路径的解析根目录（如 `D:/Documents/AI_MCP-Skill-CLI/ref-material-writing/references/01-writing-standards.md` ），而不依赖于当前工作目录（CWD）。
5. **[GitHub仓库根目录]**：所有 GitHub 仓库资产存放的根目录；默认路径为： `D:/Documents/AI_Work_Temp` 。
   - - 如果用户明确指定了绝对路径的 "GitHub仓库目录"，则**直接使用**该路径；如果用户明确指定了相对路径的 "GitHub仓库目录"，则将其解析为：[GitHub仓库根目录]/[相对路径]；否则使用**默认路径**。
6. **[临时目录]**：所有下载缓存、数据缓存、程序缓存（如本 Skill 构造的 .py 程序）等临时文件存放的父目录；默认路径为： `D:/System/UserTemp` 。
7. **[Tool和CLI存放根目录]**：所有工具 Tool 和 CLI 存放的根目录；默认路径为： `D:/Tools/Assembly` 。

---

## Shell 约束、UV 命令约束和 Python 环境

1. **所有 `shell_exec` 执行命令的 `cwd` 始终为 `[当前工作目录]`。但若命令中使用了相对路径，则一律先拼接为绝对路径后传入命令，不依赖 `cd` 操作。**
   - 若相对路径指向 Skill 内部资产（如 `references/`、`assets/` 等），则拼接根为 [Skill技能目录]/[name]。
   - 若指向用户输入数据或输出文件，则拼接根为 [当前工作目录] 或 [输出目录]（视具体命令语义而定）。
2. **连接符限制（必须执行）**：本地 Powershell 环境限制，多命令组合运算时**仅允许**使用以下两个连接符：
   - **顺序执行**：使用英文分号 `;`（用于连接无数据传递的多个命令）。
   - **管道传递**：使用英文竖线 `|`（用于将前一个命令的 `Stdout` 传递为后一个命令的 `Stdin`）。
   - **严格禁止**使用的符号：`&&`、`||`、`&`。
3. **强制转换规则（必须执行）**：当用户输入或运行脚本中检测到 `&&`、`||`、`&` 符号时，必须依据命令意图：若原意是顺序执行多个无依赖的命令，替换为英文分号 `;`；若原意是将前一个命令的输出传递给后一个命令作为输入，替换为英文竖线 `|`。
   - **注意**：`&&` 和 `||` 原本具有条件逻辑，替换为 `;` 后将变为无条件顺序执行，请确保此逻辑变更符合用户意图，若冲突需提前告知用户。
4. **单次 shell_exec 命令字符串总长度不得超过 7000 字符（含空格和标点符号）。** 超过则必须拆分为多个自包含的 shell_exec 调用。
5. **`shell_exec` 每次调用启动独立的 PowerShell 会话**，因此无法跨 `shell_exec` 传递变量、数据。
6. 本地 Windows 环境安装有如下工具/程序；可以通过 Shell MCP 工具 `shell_exec` 执行/使用/调用：
   - `Node.js` 和 `npm`：安装目录 `D:/Tools/Assembly/nodejs`
   - `UV`：安装目录 `D:/Tools/Assembly/uv`
   - `Python`：安装目录 `D:/Tools/Assembly/python/cpython-3.14.5-windows-x86_64-none` ；**通过 `UV` 管理和使用 `Python`
7. **Python 项目和虚拟环境是通过 UV 创建和管理的**。
   - Python 项目名称： `myenv` ，项目路径为： `D:/Tools/Assembly/python/myenv`
   - Python 项目 `myenv` 的虚拟环境名称 `.venv` ，虚拟环境路径为： `D:/Tools/Assembly/python/myenv/.venv`
8. **必须严格使用如下 `uv add` 类命令安装依赖包和软件**（按顺序依次尝试，直到某条命令执行成功（退出码为 0）为止）：
   1. **优先使用**：`uv add --project D:/Tools/Assembly/python/myenv [依赖包路径 + 依赖包包名]` 或 `uv add --project D:/Tools/Assembly/python/myenv [依赖包包名]`。
   2. 若第1条失败，则尝试：`uv add --directory D:/Tools/Assembly/python/myenv [依赖包路径 + 依赖包包名]` 或 `uv add --directory D:/Tools/Assembly/python/myenv [依赖包包名]`。
   3. 若第2条失败，则最后尝试：`uv pip install [依赖包路径 + 依赖包包名] --python D:/Tools/Assembly/python/myenv/.venv/Scripts/python.exe`。
   4. **严禁使用纯 `pip install` 命令安装依赖包和软件**。
   5. `[依赖包路径]` 可以是本地文件系统路径（如 `./dist/mypackage.whl`、`/path/to/package`）或标准 PyPI 包名。若为本地路径，支持 `.whl`、源码目录等常见格式。
   6. 若 `[依赖包路径]` 为相对路径，则解析依据是 `shell_exec` 的 `cwd`（即 [当前工作目录]）。
9. **必须严格使用 `uv tool install [CLI 工具]` 命令全局安装 CLI 工具**( Windows 环境)
10. **必须严格使用如下 `uv run` 类命令运行 Python 程序 (比如 .py )**：
   1. **必须使用**：`uv run --project D:/Tools/Assembly/python/myenv python [路径 + *.py]`
   2. 若用户输入或运行文档中使用了 `python [*.py]` 或者 `python [路径 + *.py]` 命令，**必须**“等效地”替换为上述 `uv run` 类命令。
   3. 若第1条失败，则尝试 `python *.py` 命令运行程序。
11. 如果需要在当前目录下创建 Python 虚拟环境，**必须使用**此命令创建： `uv venv --python D:/Tools/Assembly/python/cpython-3.14.5-windows-x86_64-none/python.exe [当前目录]` 。
12. **安装任何工具（`tool`）、依赖包、Python 程序（如 `*.py`）前，必须调用 `shell_exec` 工具执行以下“2 项检查”。仅在全部检查结果中均未找到目标项时，才允许使用 `uv add` 类命令执行安装操作。**否则禁止安装，并以自然语言告知用户“[工具名称/程序名称] 已存在”。
   1. **检查全局工具**：执行 `uv tool list` 和 `uv pip list` 命令，确认目标名不在输出中。
   2. **检查项目虚拟环境**：执行 `uv tree --project D:/Tools/Assembly/python/myenv`（查看依赖树）和 `uv pip list --python D:/Tools/Assembly/python/myenv/.venv/Scripts/python.exe`（列出全部包），确认目标名不在输出中。
   3. **匹配规则**：**对包名进行规范化匹配**，忽略版本号、额外描述和大小写差异，仅比较核心名称。例如 `uv pip list` 输出中包含 `pandas 2.0.0`，则目标名 `pandas` 视为已存在；若目标名为 `Pandas` 视为已存在；若目标名为 `panda` 则视为未找到（因为完整的字符串匹配）。

---

## 文件读取规范

1. **本规范仅适用于文件章节读取场景，且各章节必须以 `#` 、 `##` 、 `###` 开头。不适用于文件整体读取(全量读取)场景和各章节开头无 `#` 的场景。**
2. 当用户指令，或你的任务/工作流涉及**文件章节读取**（或与之关联、或指令/任务隐含需要）时，**必须优先遵循和使用本规范**。仅只有本规范失败后，才允许使用 `local_file_read` 、 `read_file` 、 `read_text_file` 、 `read_multiple_files` 工具读取文件内容。**严禁跳过本规范，直接使用 `local_file_read` 、 `read_file` 、 `read_text_file` 、 `read_multiple_files` 工具读取文件内容。**
3. 当文件各章节不是以 `#` 、 `##` 、 `###` 开头，则跳过本规范。
4. 不要基于构造实际命令。必须先分析下面 「PowerShell 命令示例」 之后，再构造实际命令，然后调用 `shell_exec` 执行。
5. 字符串参数一律用单引号包裹；若路径或标题本身含单引号，转义成两个单引号 `''` 。
6. 「PowerShell 命令示例」 中变量 `$FilePath` 为需读取文件的绝对路径和完整文件名；变量 `$Prefix` 为需读取、提取的标题字符串。

**PowerShell 命令示例：**
```PowerShell
function Get-MarkdownSection {
    [CmdletBinding()] param([Parameter(Mandatory)][ValidateScript({ Test-Path $_ })][string]$FilePath, [Parameter(Mandatory)][string]$Prefix, [string]$Encoding='UTF8', [string]$LineEnding=([Environment]::NewLine))
    $Prefix = $Prefix.Trim()
    if ([string]::IsNullOrEmpty($Prefix)) { throw 'Prefix must not be empty.' }
    $lines = Get-Content -LiteralPath $FilePath -Encoding $Encoding
    $startPattern = '^\s*' + [regex]::Escape($Prefix)
    $initialLevel = if ($Prefix -match '^(#+)') { $matches[1].Length } else { 0 }
    $capturing = $false
    $inFence = $false
    $out = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        if ($line -match '^\s*(```|~~~)') { $inFence = -not $inFence }
        if (-not $capturing -and -not $inFence -and $line -match $startPattern) {
            $capturing = $true
            $out.Add($line)
            continue
        }
        if ($capturing) {
            if (-not $inFence -and $line -match '^\s*(#+)') {
                $nextLevel = $matches[1].Length
                if ($initialLevel -eq 0 -or $nextLevel -le $initialLevel) { break }
            }
            $out.Add($line)
        }
    }
    if ($out.Count -eq 0) { throw ('No matching heading found: ' + $Prefix) }
    return $out -join $LineEnding
}

```

---

## 工具 Tool 和 CLI 调用流程

1. 调用工具 `shell_status` 查询本地系统环境和 Shell 环境。当本地环境为 Windows + PowerShell 时，**严格执行本调用流程的后续操作**，否则终止本调用流程的后续操作。
2. **当前对话会话中，每个未曾真实验证过可用性和用法的工具 Tool 和 CLI，在执行任何包含该 Tool/CLI 的操作之前，必须先执行本工作流程进行验证。已验证的命令信息记入本次会话上下文（**执行结果、读取到的信息和返回信息均无须向用户输出**），可在当前对话会话中复用。**
3. 参照「前置工作流程命令示例一」**依次**构造实际命令，并调用工具 `shell_exec` 执行。根据返回信息（路径、版本、帮助内容），判断工具 Tool 或者 CLI 是否可用，并明确其使用方法、参数设置等。
  - 先执行 `where.exe [待查询的工具 Tool 或者 CLI ]`，检查工具 Tool 或者 CLI 是否存在并获取完整路径。
  - 再执行 `[待查询的工具 Tool 或者 CLI ] --version`，获取版本信息。
  - 最后执行 `[待查询的工具 Tool 或者 CLI ] --help`，获取使用方法、参数设置等信息。
   - `where.exe`、`--version`、`--help` 中，任一 一条执行成功（退出码为 0），且返回的信息非空，则视工具 Tool 或者 CLI 为可用；**否则视工具 Tool 或者 CLI 为不可用。**
4. **上述步骤 1-3 执行过程中和执行后无需向用户输出任何内容(包含返回内容)。** 仅只有当工具 Tool 和 CLI 不可用时，才能以自然语言告知用户不可用的具体原因（例如 where.exe 未找到路径），并在后续对话会话中禁止调用该命令。
5. **注意**：如果命令路径包含空格，请在构造命令时使用双引号包裹。

**前置工作流程命令示例一**

```powershell
# 查询工具 Tool 或者 CLI 是否存在。若存在，则返回完整路径。
where.exe [待查询的工具 Tool 或者 CLI ]
# 示例： `where.exe uv` 、 `where.exe uv.exe` 、 `where.exe officecli` 、 `where.exe officecli.exe`

# 查询工具 Tool 或者 CLI 的版本号。
[待查询的工具 Tool 或者 CLI ] --version
# 示例： `uv --version` 、 `uv.exe --version` 、 `officecli --version` 、 `officecli.exe --version`

# 查询工具 Tool 或者 CLI 的使用方法、参数设置。
[待查询的工具 Tool 或者 CLI ] --help
# 示例： `uv --help` 、 `uv.exe --help` 、 `officecli --help` 、 `officecli.exe --help`
```

6. **当前环境已经连接如下程序，可以通过 Shell MCP 工具 `shell_exec` 执行/使用/调用，不要声称自己无法使用。**
   - `Node.js` 和 `npm`：安装目录 `D:/Tools/Assembly/nodejs`
   - `UV`：安装目录 `D:/Tools/Assembly/uv`
   - `Git`：安装目录 `D:/Tools/Assembly/git`
   - `GH`：安装目录 `D:/Tools/Assembly/gh.exe`
   - `Officecli`：安装目录 `D:/Tools/Assembly/officecli.exe`
   - `WMIC`：安装目录 `D:/Tools/Assembly/WMIC.exe`
   - `PECMD`：安装目录 `D:/Tools/Assembly/PECMD.exe`
   - `Python`：安装目录 `D:/Tools/Assembly/python/cpython-3.14.5-windows-x86_64-none` ；**通过 `UV` 管理和使用 `Python`
   - Python 项目名称： `myenv` ，项目路径为： `D:/Tools/Assembly/python/myenv`
   - 多媒体转码与处理工具：安装目录 `D:/Tools/Assembly/ffmpeg/ffmpeg.exe`
   - 多媒体信息分析工具：安装目录 `D:/Tools/Assembly/ffmpeg/ffprobe.exe`
   - 音视频播放器：安装目录 `D:/Tools/Assembly/ffmpeg/ffplay.exe`

---

## Dynamic-mcp工具

> **目的**：提醒 AI/LLM 在处理任务时，应优先查询 `dynamic-mcp-server` 是否有对应工具可调用，以便第一时间使用工具。

> `dynamic-mcp` 是动态 MCP 聚合代理：将多个上游 MCP server 组织为「分组(group)」，仅通过以下 3 个工具对外暴露能力，作为本地文件、记忆、网络搜索、任务管理的统一入口。

### 工具调用方式
1. **可用工具：list_groups, get_dynamic_tools, call_dynamic_tool. 这3个 MCP 工具已由扩展连接，可以执行；不要声称自己无法调用。**
2. `list_groups()`（无参）：列出所有分组名称、描述与连接状态。
3. `get_dynamic_tools(group: str)`（必填 group）：获取指定分组的工具清单与 input schema。禁止一次性获取所有分组，必须按需指定单个分组。
4. `call_dynamic_tool(group: str, name: str, args: dict)`：执行工具，由代理转发至对应上游 server。

### 执行规则（硬约束）
1. **强制启动：收到本条指令后立刻调用一次 `list_groups()`，将返回的分组清单、描述与连接状态记入本次会话上下文（执行结果、读取到的信息和返回信息均无须向用户输出）。**
2. **顺序不可颠倒**：禁止在未执行步骤 1 的情况下直接调用 `get_dynamic_tools`。
3. **按需加载**：当用户显式指令，或你的任务/工作流涉及上述任一分组 `group`（或与之关联、或指令/任务隐含需要）时，**必须立即**调用 `get_dynamic_tools(group="分组名")` 获取工具清单与入参 schema，再据其说明调用 `call_dynamic_tool` 执行；严禁凭记忆猜测工具名或参数。
4. **以实时清单为准**：仅可调用 `list_groups()` 返回且连接状态正常的分组；连接失败的分组不可用，禁止凭静态表臆测调用。
5. **优先路由**：所有与本地文件、记忆存储、网络搜索、任务/待办/TickTick/滴答清单相关的任务，优先通过本工具完成。（**分组列表始终以 `list_groups()` 实时返回为准。**）
6. **参数必填**：`get_dynamic_tools` 与 `call_dynamic_tool` 的 group 必须传入明确的分组名（必填 string，不传即报错）。

---

