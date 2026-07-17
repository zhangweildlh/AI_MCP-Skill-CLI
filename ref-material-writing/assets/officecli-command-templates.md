# OfficeCLI 命令速查模板（对齐官方 `officecli-docx` Skill）

版本日期：2026-07-09（v5 对齐）
> **Help-First 与版本差异声明（强制）**：officecli 命令参数随版本变化。**任何命令执行失败后，必须运行 `officecli --help`（或 `officecli help docx <element>` / `officecli help docx <verb> <element>`）获取当前版本权威 schema 并重试，禁止凭记忆硬编码 flag。** 本模板示例以官方 `officecli-docx` 规范为准；若 installed 版本行为不同，以 `officecli --help` 为准。

---

## 创建与打开（resident 模型）

本技能采用**自包含批次**模式（见 `references/06` 禁止项第 37 条：create 后不显式 open）：每个写入批次在同一 `shell_exec` 中以 `;` 连接完成 `create --force ; add... ; close`。

```bash
# 创建空白文件（若文件已存在需覆盖：先 `officecli help docx create` 确认 --force 是否支持；
# 本技能历史用 create --force，请以当前版本 help 为准）
officecli create "$FILE" --force
# 写入完成后 flush（可选 save，再 close；one-shot 可只 close）
officecli save "$FILE"
officecli close "$FILE"
```

页面设置（A4，twips：11906×16838；边距依公文标准）：

```bash
officecli set "$FILE" / --prop pageWidth=11906 --prop pageHeight=16838
officecli set "$FILE" / --prop marginTop=2098 --prop marginBottom=1985
officecli set "$FILE" / --prop marginLeft=1588 --prop marginRight=1474
```

---

## 标题层级

```bash
# 大标题
officecli add "$FILE" /body --type paragraph --prop text="关于XXXX工作的报告" --prop font='方正小标宋' --prop size=22pt --prop align=center --prop firstLineIndent=0

# 一级标题（outlineLvl=0 → 大纲级别1；目录据此抽取。不再引用 Heading1 样式——空白 docx 缺该样式会导致标题失效）
officecli add "$FILE" /body --type paragraph --prop text="一、章节标题" --prop font='黑体' --prop size=16pt --prop bold=false --prop outlineLvl=0

# 二级标题（outlineLvl=1 → 大纲级别2）
officecli add "$FILE" /body --type paragraph --prop text="（一）小节标题" --prop font='楷体_GB2312' --prop size=16pt --prop bold=true --prop outlineLvl=1

# 三级标题（outlineLvl=2 → 大纲级别3）
officecli add "$FILE" /body --type paragraph --prop text="1. 小标题" --prop font='仿宋' --prop size=15pt --prop bold=true --prop outlineLvl=2

# 四级标题（正文级，不设置 outlineLvl；用普通段落 + 直接格式化）
officecli add "$FILE" /body --type paragraph --prop text="（1）小小标题" --prop font='仿宋' --prop size=15pt --prop bold=false
```

---

## 正文段落

```bash
officecli add "$FILE" /body --type paragraph --prop text="正文段落内容。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both
```

## 正文段落（相似段落蓝色标记）
> 要求为蓝色。官方用 hex / 方案色名，未列命名 `blue`。**优先用 hex `0000FF`（无 #）；若 installed 版本接受命名 `blue`，二者等价；执行失败后务必 `officecli --help` 核实。**

```bash
officecli add "$FILE" /body --type paragraph --prop text="正文段落内容。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both --prop color=0000FF
```

---

## 表格（行级 c1..cN 快捷 + header，禁用 --prop value=）

```bash
officecli add "$FILE" /body --type paragraph --prop text="表 1 ×××× 统计表" --prop font='方正小标宋' --prop size=16pt --prop align=center --prop firstLineIndent=0
officecli add "$FILE" /body --type table --prop rows=4 --prop cols=3 --prop width=100% --prop align=center --prop font='仿宋' --prop size=15pt --prop bold=false
# 行级填充：header=true + c1..cN 文本快捷（官方推荐，非 --prop value=）
officecli set "$FILE" "/body/tbl[1]/tr[1]" --prop header=true --prop c1="列1" --prop c2="列2" --prop c3="列3"
```

---

## 页脚与目录（活 PAGE 字段）

> 官方单命令注入 `fldChar`，页脚显示实时页码；CLI 自动注入字段，无需手工拼 `<w:fldChar>`。

```bash
# 单命令页脚（含活 PAGE 字段）
officecli add "$FILE" / --type footer --prop type=default --prop align=center --prop size=9pt --prop text="Page " --prop field=page

# 兼容写法（路径须引号 + /p[1]，注入 field 子元素）
# officecli add "$FILE" /footer[1] --type paragraph --prop text="Page " --prop align=center
# officecli add "$FILE" "/footer[1]/p[1]" --type field --prop fieldType=page
```

目录（3+ 标题时添加；`title` 为官方推荐字段）：

```bash
officecli add "$FILE" /body --type paragraph --prop text="目 录" --prop font='方正小标宋' --prop size=16pt --prop bold=false --prop align=center --prop firstLineIndent=0 --index 0
officecli add "$FILE" /body --type toc --prop levels="1-3" --prop title="目录" --prop hyperlinks=true --index 1

> ⚠️ **双「目录」标签规避（重要）**：上面先手动 `add` 了一个「目 录」标题段（`--index 0` 那行），而 TOC 字段又带 `title="目录"`。`refresh` 后正文会出现**两个「目录」**——一个手动段、一个 TOC 字段渲染出的标题。**二选一，不要都留**：
> - 方案甲（推荐）：**删掉**上面那行手动「目 录」段（`--index 0` 那行），让 TOC 字段的 `title="目录"` 自动生成目录标题；
> - 方案乙：保留手动「目 录」段，但把 TOC 字段的 `title` 去掉或置空（如 `--prop title=""`），避免 TOC 再渲染一个标题。
> 若内容自带「目录」章节（如用户提纲里就有「目录」一节），同样适用——手动段与 `title` 只留其一，否则重复。
```

> ⚠️ **目录刷新（强制）**：插入 `--type toc` 后必须 `officecli refresh "$FILE"` 计算目录条目与页码（**需本机装有 Word**）。
> **无 Word 降级（手动目录）**：若 `refresh` 报错（环境无 Word / 无无头浏览器），删除空 TOC 字段 `officecli remove "$FILE" /toc[1]`，改为按提纲逐条 `add` 章节标题行（页码标注 `【页码待Word/WPS更新】` 低撞词唯一串，避免与正文散文"见正文"撞词，见 O4），并在状态文件「验证状态」记「⚠️ TOC=手动目录（环境无 Word，refresh 不可用）」。禁止将未刷新的空 TOC 字段带入交付物。

---

## 完整写入命令模板（自包含批次）

```bash
officecli create "$FILE" --force ; officecli add "$FILE" /body --type paragraph --prop text="大标题" --prop font='方正小标宋' --prop size=22pt --prop align=center --prop firstLineIndent=0 ; officecli add "$FILE" /body --type paragraph --prop text="一、章节标题" --prop font='黑体' --prop size=16pt --prop bold=false --prop outlineLvl=0 ; ... ; officecli save "$FILE" ; officecli close "$FILE"
```

---

## QA 校验命令（参照 references/04、05 与步骤10 Delivery Gate）

```bash
officecli view "$FILE" outline ; officecli view "$FILE" text --max-lines 200 ; officecli validate "$FILE"
```
