# 步骤9：结构化输出最终文稿

> rmw 内部步骤9。遵循 `_router/_contract.md` 七段契约。
> **本步骤受 OfficeCLI 分片写入限制约束**（单段≤3000 字符、每批≤12 条 add、单次 shell_exec≤7000 字符）。

---

## [门禁]
- 已读取状态文件，确认"当前步骤=步骤8 / 共10步"，所有前序产出就绪。
- 已读取「工具能力映射表」，确认 OFFICE（officecli）、SHELL、FILE_STAT、WRITE_FILE 已绑定。
- 输出为 docx 时：已加载 `references/04-officecli-guide.md`、`references/05-long-file-handling.md`、`references/docx-format-standard.md`、`assets/officecli-command-templates.md`。

## [加载]
- `assets/output-template.md`（结构化输出模板）
- `references/docx-format-standard.md`（公文页面 / 要素格式标准）
- `assets/officecli-command-templates.md`（对齐官方的命令模板）
- 状态文件"前序产出清单"：`_正文过程稿.md`、`_相似段落标记.md`
- 逻辑原语：READ_FILE、WRITE_FILE、FILE_STAT、OFFICE、SHELL

## [执行]

### 内容来源
- `_正文过程稿.md`：最终文稿内容直接来源。
- `_相似段落标记.md`：相似段落颜色标记来源。

### 分片写入进度记录（强制）
- 分片写入时，每完成一片向状态文件输出：`📝 步骤9写入进度：N/M 片已完成`。
- 全部 M 片完成后才更新"验证状态"。
- 上下文膨胀导致遗忘剩余片数 → 读取状态文件"分片进度"恢复记忆。
- **该 `N/M 片` 进度即状态文件「阶段检查点·步骤9」的权威标记**：续跑会话据此定位到断点片，仅续写剩余片（从 N+1 片起），不重做已完成片。

### 相似段落颜色标记（仅 docx）
- 写入同步完成；对匹配段落加 `--prop color=0000FF`（hex 无 `#`，对齐官方 `officecli-docx`；命名 `blue` 是否被接受以 `officecli --help` 为准，见 `references/04`）。**整段着蓝为默认粒度（用户决策：不要求精准到句级）**——相似标记直接对整段落着色即可；句级精确着色（拆段或 run 级格式化）列为可选增强、**默认不启用**，避免把同段其它原创句误染蓝且增加复杂度。

### 标题层级与目录（强制工序，治 D1/D2 缺陷）
- **标题用 `outlineLvl` + 直接格式化，不引用 `HeadingN` 样式**：`officecli create` 产出的空白 docx 仅含 `Normal` 样式；若引用 `Heading1/2/3`，因样式定义缺失会失效——标题在 Word 中退化为正文、目录无大纲级别可抽取。改用 `add ... --prop outlineLvl=0/1/2 --prop font=... --prop size=... --prop bold=...`（模板见 `assets/officecli-command-templates.md` 标题层级）。`outlineLvl` 0/1/2 对应大纲级别 1/2/3，Word 目录（TOC）与导航窗格据此抽取。
- **目录刷新（优先，refresh 后端 = Word 或 WPS 任一即可）**：所有内容写入完成后，插入目录字段 `officecli add "$FILE" /body --type toc --prop levels="1-3" --prop title="目录" --prop hyperlinks=true`，随即 `officecli refresh "$FILE"` 计算条目与页码。`refresh` 需要本机装有 **Word 或 WPS**（实测 WPS 12.1.0.26373 的 `wpsoffice.exe` 可作为 refresh 后端，officecli 标注为 `backend: word` 并正确填充 TOC 条目与页码）。`officecli --help` 原文："refresh ... Word + Windows required for .docx"——此处 "Word" 实际兼容 WPS 作为等价后端引擎。
- **空段落清理（治 B3 默认空段落残留，强制工序）**：内容写入完成、`refresh`（或手动目录降级）结束后，执行 `officecli query "$FILE" 'p:empty'`；若命中默认空段落（`create` 产出的空白 docx 自带 1 个空段落，常见 `paraId=00100018`），逐个 `officecli remove "$FILE" "/body/p[@paraId=...]"` 清除；**保留文末 Word 结构必需的最后一段**——若误删导致结构异常，回补一个空段落。清理后复查 `p:empty` 应为 0。此工序与 `references/05` §五"任何 `p:empty` 均为不合格"对齐；步骤10 的 G2c 会再次拦截残留空段落。
  - **⚠️ refresh 会新增/暴露退化空段落（N2，强制重查）**：实测 `officecli refresh` 执行后，TOC 占位段落（`paraId=00100018`）会**退化为空段落**（原本是带 `/toc` 域字段的占位，刷新后降格为纯空 `<w:p>`）。因此本清理工序**必须在 `refresh` 之后执行**，且须把 `paraId=00100018` 这类"refresh 退化空段落"一并 `remove`；若先清理再 refresh，则 refresh 后又会残留空段落，步骤10 的 G2c 会 REJECT。顺序铁律：**写入全部完成 → refresh → 本清理（含退化空段落）→ 复查 p:empty=0**。
- **降级（手动目录，仅当 refresh 失败时才触发）**：若 `refresh` 报错（环境**既无 Word 也无 WPS**，或报错含 "Word backend unavailable" / "no headless browser"），**不得保留空 TOC 字段**，执行：① `officecli remove "$FILE" /toc[1]` 删除空目录字段；② 按提纲逐条 `add` 章节标题行（页码标注 `【页码待Word/WPS更新】` 低撞词唯一串）作为手动目录；③ 在状态文件「验证状态」记「⚠️ TOC=手动目录（环境无 Word 且无 WPS，refresh 不可用）」。步骤10 的 G2b 会拦截任何残留的"Update field to see"占位符；若步骤10 增手动目录未刷新扫描，以 `【页码待Word/WPS更新】` 唯一串为特征（非"见正文"，避免与正文散文撞词，见 O4）。
- **判定要点**：先尝试 `refresh`；只有 `refresh` 真正失败（无 Word 且无 WPS 后端）才走手动目录。不要在装有 WPS/Word 的环境里跳过 `refresh` 直接降级——那样会丢失自动页码。

### 结构化输出最终文稿（六部分，依 `assets/output-template.md`）
1. 资料解析说明 2. 提纲调整说明 3. 补充信息说明（含 `[数据待核实]`）4. 正文输出（来源 `_正文过程稿.md`）5. 信息溯源说明 6. 相似段落标记说明（仅 docx）。
- docx 写入：遵循 `references/05` 自包含批次（`create --force ; add... ; close`）、构建工序顺序、4 条错误检测规则。
- **批前防御性关闭（治 B2 孤儿 resident 锁，强制）**：每个写入批次的首命令前置 `officecli close "$FILE" 2>/dev/null ;`（幂等，无 resident 时无害），再 `create --force`/`add`；批次脚本建议用 `trap 'officecli close "$FILE" 2>/dev/null' EXIT` 保证任何退出路径（含中途异常）都关闭 resident，避免 `set -e` 跳过 `close` 留孤儿进程锁（详见 `references/05` §一 / §四）。
- 降级：同一 docx 失败累计 ≥ 2 次 → 终止 OfficeCLI 写入，以 `.md` 输出并显式告知用户。

## [产出]
- `[输出目录]/_最终文稿.docx`（默认）或 `[输出目录]/_最终文稿.md`（降级）

## [分片]
- 严格遵循 `references/05`：单段≤3000 字符、每批≤12 条 add、单次 shell_exec≤7000 字符；长文件拆多自包含批次。
- 正文过程稿超长时按自然段 / 句边界切分；禁切代码块 / 表格。

## [验证]
- 使用 `FILE_STAT` 确认 `_最终文稿.docx` 或 `_最终文稿.md` 已存在。
- docx：确认分片进度 N/M 全部完成。
- docx：确认标题层级已建立（`officecli query "$FILE" 'paragraph[outlineLvl]' --json` 命中数 ≥ 提纲章节数）；确认目录已处理——要么 `refresh` 后 TOC 字段 text 非占位符，要么已降级为手动目录（无 `/toc` 字段）并在状态文件「验证状态」记"⚠️ TOC=手动目录（环境无 Word）"。
- **引用 `references/16-self-check-C.md` 标准档**校验：存在性 + 非空阈值 + 轻签名（字节/段落数 vs [产出] 预期）+ 结构完整性（docx：`officecli validate` 通过 G1a/G1b + 段落数 ≥ 提纲章节数；md：标题层级 ≥ 提纲层级）。
- **向 §14 写入登记（设计点 5）**：通过则写入"✅通过 + 轻签名 + 登记对象=`[输出目录]/_最终文稿.docx`（或 .md）+ 子阶段=全文/分片 + 自检时刻"；失败回退重做本步 [执行]→[产出]（回到步骤9 对应分片）。

## [状态]
- 更新"当前步骤"="步骤9 / 共10步"。
- 更新"前序产出清单"：增加最终文稿路径。
- 更新"待办下一步"="加载 _router/step-10.md，执行步骤10"。
- 更新"时间戳"。
- 输出「✅ 步骤9完成，状态文件已更新」。
