# docx 文件格式标准（公文）

> 从原 `references/09-workflow-phase3.md` 的「docx文件格式标准」抽出为独立文件，供步骤9 / 步骤10 引用。
> 命令示例对齐官方 `officecli-docx` Skill（见 `assets/officecli-command-templates.md` 与 `references/04-officecli-guide.md`）。**版本差异声明见 `references/02` / `04`：任何命令失败须 `officecli --help` 核实。**

---

## 页面与版式设置

| 项目 | 规格 |
|------|------|
| 纸张大小 | A4（210mm × 297mm） |
| 页边距 | 上37mm、下35mm、左28mm、右26mm |
| 页脚 | 底端外侧距下页边7mm |
| 行距 | 固定值 28 磅 |
| 段落 | 两端对齐，首行缩进2字符（约720 twips） |

## 公文各要素格式

| 要素 | 字体/字号 | 其他 |
|------|----------|------|
| 大标题 | 二号（22pt），小标宋体 | 居中 |
| 一级标题 | 三号（16pt），黑体，不加粗 | 左对齐空二字 |
| 二级标题 | 三号（16pt），楷体_GB2312，加粗 | 左对齐空二字 |
| 三级标题 | 小三号（15pt），仿宋，加粗 | 左对齐空二字 |
| 四级标题 | 小三号（15pt），仿宋，不加粗 | 左对齐空二字 |
| 正文 | 小三号（15pt），仿宋，不加粗 | 首行缩进2字符 |
| 目录 | 三号（16pt），小标宋体 | 居中 |

**实施参考**（依官方对齐）：

```bash
# 页面设置
officecli set "$FILE" / --prop pageWidth=11906 --prop pageHeight=16838
officecli set "$FILE" / --prop marginTop=2098 --prop marginBottom=1985
officecli set "$FILE" / --prop marginLeft=1588 --prop marginRight=1474

# 大标题
officecli add "$FILE" /body --type paragraph --prop text="关于XXXX工作的报告" --prop font='方正小标宋' --prop size=22pt --prop align=center --prop firstLineIndent=0

# 一级标题
officecli add "$FILE" /body --type paragraph --prop text="一、章节标题" --prop style=Heading1 --prop font='黑体' --prop size=16pt --prop bold=false

# 正文
officecli add "$FILE" /body --type paragraph --prop text="正文段落内容。" --prop style=Normal --prop font='仿宋' --prop size=15pt --prop firstLineIndent=720 --prop lineSpacing=28pt --prop align=both
```

> 注：标题层级字体可依 `references/01` 与用户要求调整；当模板自带样式可信时优先 `style=Heading1` 等，再按需设显式字号。
