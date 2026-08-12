# 超长文件处理方案

当读取文件为超长 Office 文件（*.docx、*.xlsx、*.pptx）时，**禁止一次性拉取全文**。必须严格按照以下方案进行分段读取和分片写入，防止 AI 上下文溢出。

**注意**：本方案仅适用于 docx、xlsx、pptx 三种 Office 格式。PDF 格式参考资料通过系统原生能力处理，不通过 OfficeCLI 分片。

**适用范围说明**：本方案中“分片写入方案”和“构建工序顺序”**仅针对 docx 文件的生成**，pptx 和 xlsx 的写入不适用。对于 xlsx 文件的处理，仅涉及**读取参考资料**场景，不涉及通过本方案的 `add` 命令进行写入。

---

## 一、驻留模式管理

**🚨 核心规则（强制执行）：每个自包含批次的所有 OfficeCLI 写入操作必须在同一个 `shell_exec` 调用中完成，使用 `;` 连接多个命令。严禁跨 `shell_exec` 分步执行单个批次的写入操作。**

**原因**：`shell_exec` 每次调用启动独立的 PowerShell 会话。跨会话的驻留进程无法可靠共享——`create` 启动的驻留进程可能在前一个会话退出后变成"孤儿"进程，导致后续操作超时或写入失败。

> **Shell 规范（与 `references/02-environment-setup.md` 一致）**：本文件所有 shell 命令示例均在独立 PowerShell 会话中执行，命令之间用 `;` 顺序串联；**严禁**使用 `&&` / `||` / `&`。代码块标注 `bash` 仅表示类 POSIX 命令形态，实际执行须遵循 02 的 PowerShell/`;` 规则（错误输出抑制 `2>/dev/null` 为本技能跨宿主兼容约定写法，PowerShell 等价 `2>$null`，不影响 `;` 串联语义）。

### 正确模式

新建文件（推荐模式）：`create --force` → 直接 `add` → `close`

> **🛡️ 批前防御性关闭（治 B2 孤儿 resident 锁，强制）**：每个写入批次的**首命令**前置 `officecli close "$FILE" 2>/dev/null ;`（幂等，无 resident 时无害），再 `create --force`/`add`。原因：`create --force` 只覆盖磁盘文件、**不接管/终止已有 resident 会话**；若上一批因异常未 `close` 留下孤儿 resident，本批会报 `Error: ... is currently opened by a resident process`。批前防御性关闭可消除该锁。批次脚本建议用 `trap 'officecli close "$FILE" 2>/dev/null' EXIT` 保证**任何退出路径**（含 `set -e` 中途异常）都关闭 resident，避免孤儿锁（与 O2 联动）。

```bash
officecli close "$FILE" 2>/dev/null ; officecli create "$FILE" --force ; officecli add "$FILE" /body --type paragraph --prop text="关于XXXX工作的报告" --prop font='方正小标宋' --prop size=22pt --prop align=center --prop firstLineIndent=0 ; officecli add "$FILE" /body --type paragraph --prop text="一、章节标题" --prop outlineLvl=0 --prop font='黑体' --prop size=16pt --prop bold=false ; ... ; officecli close "$FILE"
```

对已有文件追加内容：直接 `add` → `close`

```bash
officecli add "$FILE" /body --type paragraph --prop text="正文段落内容1。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both ; officecli add "$FILE" /body --type paragraph --prop text="正文段落内容2。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both --prop color=0000FF ; officecli close "$FILE"
```

### 关键约束

- `create` 必须带 `--force` 以避免文件已存在时报错。
- 每个写入类 `shell_exec` 命令字符串末尾**必须包含 `close`**。
- **绝对禁止在驻留打开期间运行 `validate`**——必须先 `close` 再 `validate`。QA 校验在 close 之后的独立 shell_exec 中执行。

### 批次执行纪律（防 N1 灾难性覆盖，强制执行）

> **惨痛教训**：`create --force` 的本质是"重建一个空白文件"，执行后会**清空**该文件此前所有已追加内容。若在所有 `add` 批次之后**再次执行** `create --force` 批次（哪怕只是想"统计一下段落数"），后续全部 `add` 批次的写入会被瞬间抹掉——段落数骤降、标题层级归零、相似着色消失，成果毁于一旦。

**铁律（每条都是强制）**：
1. **每个自包含批次只执行一次**：编号 `batch_01.sh`…`batch_N.sh` 的批次，逐个 `bash` 执行一遍即止；**绝不在全部跑完后回头再跑任一批次**。
2. **`create --force` 批次（通常是 batch_01）严禁二次执行**：它只用于"开局建空白文件 + 大标题 + 目录占位"。一旦后续 `add` 批次已追加内容，**任何情况下都不再运行它**（重跑它 = 清空全部成果）。
3. **统计/核查用只读命令，绝不重跑写入命令**：想看"写了多少段 / 标题层级是否建立"，用 `officecli view "$FILE" stats`（统计）、`officecli query "$FILE" 'paragraph[outlineLvl]'`、`officecli view "$FILE" outline` 等**只读命令**；**严禁为拿统计数字而重跑 `create`/`add` 批**。
4. **批次清单留痕**：执行前在状态文件（或 `.tmp/`）列出批次清单 `batch_01..batch_N`，执行后逐一批注"已执行×1"；完成态以"只读查询"复核，不以"重跑"复核。

---

## 二、分段读取策略

### 第一步：概览定向（所有格式通用）

```bash
officecli view "$FILE" outline   # 获取文件结构概览
officecli view "$FILE" stats     # 获取统计信息
```

**关键产出**：解析并持久化「标题层级-段落起止索引-稳定ID映射表」
- docx：章节 → 段落范围 + H1/H2 + @paraId
- xlsx：工作表 → 行范围（估算）
- pptx：幻灯片编号 → 标题

> **关联说明**：此映射表是「步骤2」“2.3 单份资料结构化分析”中「关键段落位置」字段的数据来源。读取参考资料时，应从映射表中提取关键段落的位置信息，填入分析卡片的对应字段，供「步骤6」正文撰写时精准回溯。

### 第二步：按文件类型分段读取正文

| 格式 | 分片参数 | 读取命令 |
|------|----------|----------|
| **docx** | 每次≤80段落或≤400行 | `officecli view "$FILE" text --start N --end M --max-lines 400` |
| **xlsx** | 不支持 `--start/--end` 分页，请使用替代方式（见下方说明） | 见下方详细说明 |
| **pptx** | 每次≤20张幻灯片 | `officecli view "$FILE" text --start N --end M` |

**禁止跨格式套用参数**。

#### xlsx 文件分段读取的三种可行方式

由于 `officecli view text` 在 xlsx 中**不支持 `--start` 和 `--end` 参数**，无法实现真正的分页读取，采用以下替代方式：

**方式一：获取前 N 行（头部样本）**
```bash
officecli view "$FILE" text --max-lines 200
```
- 只能获取**从第1行开始的前200行**，无法跳过开头。
- 适用于快速预览表头及少量数据。

**方式二：按单元格区域精准提取**
```bash
officecli get "$FILE" "/汇总/A1:Z50" --json
```
- 可指定具体行列范围（如 A1:Z50），实现“按区域提取”。
- 返回结构化 JSON 数据，可解析后使用。
- 注意：如果行数很大（如 2000 行），该命令仍会一次性返回大量数据，单次读取 ≤200 行。

**方式三（推荐用于超大文件）：导出为 CSV 后使用外部工具分片**
```bash
officecli view "$FILE" csv --sheet 汇总 > data.csv
```
然后使用 PowerShell 的 `Select-Object` 或 Python 等工具分片读取 CSV。例如：
```powershell
# 使用 PowerShell 获取第 1-200 行
Get-Content data.csv | Select-Object -First 200
# 使用 PowerShell 获取第 201-400 行
Get-Content data.csv | Select-Object -Skip 200 -First 200
```

### 第三步：按节点精准探查（依赖映射表）

使用 `get` 命令探查特定节点，支持 `--depth` 控制展开深度和 `--json` 结构化输出。

**寻址优先级（强制执行）**：
1. **稳定 ID 路径**（最高优先级）：`/body/p[@paraId=...]`、`/slide[N]/shape[@id=...]`、`/namedrange[...]`（xlsx）
2. **CSS 选择器**：`officecli query "$FILE" '<selector>'`
3. **位序路径**（仅读取阶段可用）：`/body/p[3]`、`/Sheet1/A1`（xlsx）

**写入阶段禁止使用位序路径作为主要寻址方式**——分片插入后索引必然偏移。


## 三、精准定位方案

### 语义路径（XPath 风格，1-based）

```bash
# Word 路径
/body/p[3]                    # 第 3 个段落
/body/tbl[1]/tr[2]/tc[3]      # 第 1 表第 2 行第 3 格

# Excel 路径
/Sheet1/A1                    # A1 单元格
/Sheet1/B2                    # B2 单元格
/Sheet1/col[A]                # A 列
/Sheet1/row[1]                # 第 1 行
```

**注意**：所有路径必须加引号——Shell 会将 `[N]` 通配展开。

### 稳定 ID 寻址（多步工作流强制优先使用）

```
/body/p[@paraId=1A2B3C4D]                         # Word 段落
/slide[1]/shape[@id=550950021]                    # PPT 形状
/slide[1]/table[@id=1388430425]/tr[1]/tc[2]       # PPT 表格
/comments/comment[@commentId=1]                    # Word 批注
/namedrange[GrowthRate]                           # xlsx 命名范围（优先使用）
/汇总/A1                                          # xlsx 单元格地址（工作表名 + 单元格地址，稳定可靠）
```

### CSS 选择器查询

```bash
# 按样式查询（docx/pptx）
officecli query "$FILE" 'paragraph[style=Heading1]'
# 注：上例演示按样式查询任意 docx；本 Skill 生成的标题使用 outlineLvl（见步骤9），查询本 Skill 产出物请改用 paragraph[outlineLvl]

# 按文本内容查询（docx/pptx）
officecli query "$FILE" 'p:contains("关键术语")'

# 空段落检查（QA 阶段使用，docx/pptx）
officecli query "$FILE" 'p:empty'

# 布尔组合
officecli query "$FILE" 'paragraph[size>=18pt and style=Heading1]'

# xlsx 公式错误检查
officecli query "$FILE" 'cell:contains("#REF!")'
officecli query "$FILE" 'cell:contains("###")'
officecli query "$FILE" 'cell[type=Formula]'
```

**支持的操作符**：`=`、`!=`、`~=`、`>=`、`<=`、`:contains()`、`:empty`、`:has(formula)`、`:no-alt`。支持 `and`/`or` 布尔组合。

### CSS 选择器异常处理规则

- **检索阶段**：若 `query` 返回空元素列表，终止当前检索分支，明确告知用户目标内容不存在。
- **QA 校验阶段**：空结果通常为预期结果，不报错。

> **⚠️ 选择器陷阱（N3，实测，强制规避）**：
> - **颜色查询必须带 `#`**：写入用 `--prop color=0000FF`（纯 hex 无 `#`），但 officecli 实际存储为 `color=#0000FF`。若用 `officecli query "$FILE" 'paragraph[color=0000FF]'` 查询会**返回 0 命中**（漏判）；必须用 `officecli query "$FILE" 'paragraph[color=#0000FF]'` 或 `--fields color` 核对（实测 `--compact --fields color` 可确认 `color=#0000FF` 已正确写入）。
> - **outlineLvl 查询用属性存在式**：相等选择器 `paragraph[outlineLvl=1]` 偶发**返回 0 命中**（误判），但 `--fields outlineLvl` 确认 12 个 H2 确实存在且 `outlineLvl=1`。**稳定写法**：用属性存在式 `officecli query "$FILE" 'paragraph[outlineLvl]'` 统计标题层级总数；按级别精查改用 `--fields outlineLvl` 后人工计数，或范围式 `paragraph[outlineLvl>=1]`（比相等式稳定）。Delivery Gate 的 G1b 已采用属性存在式，勿改回相等式。


## 四、分片写入方案

> **本方案仅适用于 docx 文件的生成。** 对于 xlsx 和 pptx 文件的写入，请分别遵循独立的 OfficeCLI XLSX Skill 和 PPTX Skill 规范，不适用本文的“构建工序顺序”和“文件级写入速查”。

### 前置规则：单段落字符阈值

**单条 `--prop text="..."` 指令中的文本字符数不得超过 3000 字符。** 超过阈值的段落必须拆分为多条连续段落。

### 批量写入规则

- 单次 shell_exec 命令字符串 ≤ 7000 字符
- 每批次 add 命令数量 ≤ 12 条
- 单段文本超过 3000 字符必须拆分
- 上述三个约束取较严者
- 长文件拆分为多个自包含的 shell_exec 批次
- 每个自包含批次在同一 shell_exec 中完成：`create --force ; add... ; close`（跳过 open）
- 写入完成后在独立 shell_exec 中执行 QA 校验

### 错误检测规则（4条，全部通过才判定成功）

1. **stderr 扫描**：stderr 中包含 `Error:` → 失败
2. **stdout 段落计数**：`Added paragraph at` 出现次数 < 预期 add 命令数 → 不完整
3. **close 确认**：stdout 中无 `Resident closed for` → close 未执行
4. **超时检测**：`timedOut=true` → 可能不完整

### 降级规则

1. **触发条件**：同一 docx 目标文件，分片写入累计失败 ≥ 2 次
2. **终止写入**：立即终止所有后续 OfficeCLI 写入批次
3. **补救关闭**：在独立 shell_exec 中执行 `officecli close "$FILE"`
- **resident 占用优先 close（治 B2）**：若 `create --force` 报 `is currently opened by a resident process`，**先无条件 `officecli close "$FILE"` 再重试**该批次；仍失败才计入上述"累计失败 ≥ 2 次"降级计数。不得将 resident 报错当作普通失败直接跳过（批前防御性关闭见 §一）。
4. **MD降级交付**：从正文过程稿读取完整正文，以 Markdown 格式保存
5. **用户告知**：降级原因、失败批次信息、MD终稿路径

### 大批量写入推荐范式（O1，防转义事故）

正文 50+ 段落手写 bash 批次极易在中文/特殊字符上翻车。推荐用「生成器拼装 + 单引号包裹」范式（本轮 72 条 add / 8 批实测零转义事故）：

1. **危险字符探测**：写入前扫描正文中的 bash 危险字符——`'`（单引号）、`"`（双引号）、`$`、反引号、反斜杠 `\`。
2. **优先单引号包裹**：**正文不含 ASCII 单引号时，一律用单引号包裹 `--prop text='...'`**（bash 单引号内不解释任何元字符，最安全）；含单引号则用 `'\''` 兜底转义（关闭单引号 + 转义单引号 + 重开单引号）。
3. **生成器拼装（推荐）**：用脚本（Python/Node 等）解析源文稿、产出 `officecli add ...` 命令并拆成**自包含批次**（批前防御性 `close`、每批 ≤12 条 add、批末 `close`），再逐批 `bash batch.sh` 执行。说明：用脚本**拼装命令**仍属"调用 officecli 生成 docx"，**不违反**"不得安装 Python 程序做 docx"（docx 仍由 officecli 产出，脚本只拼字符串，见 O2 同逻辑）。
4. **长度与批次**：单条 `--prop text` ≤3000 字符、每批 ≤12 条 add、单次 shell_exec ≤7000 字符（与上方批量写入规则一致）。
5. **验证**：每批执行后按 §四 4 条错误检测规则核对；全部分批完成后按 §五 QA 门禁 + 步骤10 Delivery Gate 终验。

> 实测：源文稿含 0 单引号、0 `$`、0 反斜杠、100 双引号、18 反引号，采用单引号包裹 → 零转义事故。

### 构建工序顺序

1. 结构定义（styles、numbering）
2. 页面设置（sections、页面尺寸、页边距）
3. 标题与正文（outlineLvl=0→outlineLvl=1→outlineLvl=2→Normal）
4. 表格与图表（先建空表，再逐行填充）
5. 页眉页脚（页脚含 PAGE 字段）
6. 目录（3+ 标题时添加 TOC）
7. 格式整理（字号、间距、对齐、缩进）

### 文件级写入速查

| 操作 | 命令示例 |
|------|----------|
| 创建空白文件 | `officecli create "$FILE" --force` |
| 设置页面 | `officecli set "$FILE" / --prop pageWidth=11906 --prop pageHeight=16838` |
| 添加大标题 | `officecli add "$FILE" /body --type paragraph --prop text="关于XXXX工作的报告" --prop font='方正小标宋' --prop size=22pt --prop align=center --prop firstLineIndent=0` |
| 添加一级标题 | `officecli add "$FILE" /body --type paragraph --prop text="一、章节标题" --prop outlineLvl=0 --prop font='黑体' --prop size=16pt --prop bold=false` |
| 添加二级标题 | `officecli add "$FILE" /body --type paragraph --prop text="（一）小节标题" --prop outlineLvl=1 --prop font='楷体_GB2312' --prop size=16pt --prop bold=true` |
| 添加三级标题 | `officecli add "$FILE" /body --type paragraph --prop text="1. 小标题" --prop outlineLvl=2 --prop font='仿宋' --prop size=15pt --prop bold=true` |
| 添加正文 | `officecli add "$FILE" /body --type paragraph --prop text="正文段落内容。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both` |
| 添加正文（蓝色标记） | `officecli add "$FILE" /body --type paragraph --prop text="正文段落内容。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both --prop color=0000FF` |
| 添加表格 | `officecli add "$FILE" /body --type paragraph --prop text="表 1 ×××× 统计表" --prop font='方正小标宋' --prop size=16pt --prop align=center --prop firstLineIndent=0 ; officecli add "$FILE" /body --type table --prop rows=4 --prop cols=3 --prop width=100% --prop align=center --prop font='仿宋' --prop size=15pt --prop bold=false` |
| 添加页脚 | `officecli add "$FILE" / --type footer --prop type=default --prop align=center --prop size=9pt --prop text="Page " --prop field=page` |
| 添加目录 | `officecli add "$FILE" /body --type toc --prop levels="1-3" --prop title="目录" --prop hyperlinks=true`（方案甲：单 TOC 带 title，不手动加"目 录"段，避免双标题陷阱；详见 officecli-command-templates.md） |

> **xlsx 写入速查（参考）**：本方案不提供 xlsx 的批量写入流程，但以下命令供参考，需在独立 shell_exec 中执行：
> ```bash
> # 设置单元格值
> officecli set "$FILE" "/Sheet1/A1" --prop value="标题" --prop bold=true
> officecli set "$FILE" "/Sheet1/B2" --prop value=100 --prop numFmt='$#,##0'
> # 设置公式
> officecli set "$FILE" "/Sheet1/C2" --prop formula="SUM(B2:B10)"
> # 设置列宽
> officecli set "$FILE" "/Sheet1/col[A]" --prop width=20
> # 添加工作表
> officecli add "$FILE" / --type sheet --prop name="新表"
> officecli close "$FILE"
> ```


## 五、写入后的合规性自检

**前置条件**：全部分片写入完成，已执行 `close`。
**QA 校验必须在 close 之后的独立 shell_exec 中执行。**

```bash
# === 通用检查（所有格式） ===
officecli view "$FILE" outline    # 结构校验
officecli view "$FILE" stats      # 统计信息
officecli validate "$FILE"        # Schema 校验

# === docx 专用检查 ===
officecli view "$FILE" text --max-lines 200           # 内容抽样
officecli query "$FILE" 'p:contains("lorem")'         # 占位符泄露
officecli query "$FILE" 'p:contains("TODO")'
officecli query "$FILE" 'p:contains("{{")'
officecli query "$FILE" 'p:empty'                     # 空段落
officecli query "$FILE" 'image:no-alt'                # 图片无替代文本

# === xlsx 专用检查 ===
officecli query "$FILE" 'cell:contains("#REF!")'      # 公式引用错误
officecli query "$FILE" 'cell:contains("#DIV/0!")'    # 除零错误
officecli query "$FILE" 'cell:contains("#VALUE!")'    # 值错误
officecli query "$FILE" 'cell:contains("#NAME?")'     # 名称错误
officecli query "$FILE" 'cell:contains("#N/A")'       # 不可用值
officecli query "$FILE" 'cell:contains("###")'        # 列宽不足
officecli query "$FILE" 'cell[type=Formula]'          # 检查公式存在
```

### QA 门禁规则

- `validate` 返回 "no errors found" 为通过
- **docx**：任何 `p:empty`、`p:contains("lorem")`、`p:contains("TODO")`、`p:contains("{{")` 命中均为不合格
- `validate` 误报 `uiPriority` 为 **预期非阻断** 项（U3）：officecli 自身 `create` 生成的默认样式含 `uiPriority`（ECMA-376 合法），其自带 `validate` 反而判其为 schema error。步骤10 的 G1a 已将其设为 advisory（仅 uiPriority 误报不阻断），**后续会话不得将其当作错误去"修复"**；仅非 uiPriority 的内容级 schema 错误才 REJECT。
- **xlsx**：任何 `cell:contains("#REF!")`、`cell:contains("###")` 命中均为不合格
- 页脚必须包含实时 PAGE 字段
- 3+ 标题的文件必须包含 TOC


## 六、Shell 防泄漏规范

- **所有路径必须加引号**：`"/body/p[1]"`，而非 `/body/p[1]`
- **包含 `$` 的文本使用单引号**：`--prop text='营收增长 18%，达到 $50M'`
- **反斜杠转义不生效**：`\$`、`\t`、`\n` 会被写入文件文本——禁止使用
- **heredoc 单引号分隔符**：`cat <<'EOF'` 防止 Shell 展开 `$`
- **单次 shell_exec 命令字符串总长度不超过 7000 字符**


## 七、OfficeCLI 调用失败处理

若 `officecli --version` 无响应或返回错误：
- 明确告知用户 OfficeCLI 工具不可用
- 以 Markdown 格式输出文稿内容
- 建议用户手动完成 Office 文件的创建和格式化