# wechat-article-search 说明文档（非技能主文件）

> 本文件存放技能的解耦选型说明、反爬原理与修改历史等**非执行必需**信息。
> 技能的执行契约以 `SKILL.md` 为准；本文件仅供阅读与维护参考。

## 一、技能简介

`wechat-article-search` 是一个零第三方依赖（仅 `node`，无需 `npm install`）的技能，底层通过搜狗微信搜索（`weixin.sogou.com`）按关键词检索公众号文章，返回标题、摘要、发布时间、来源公众号与链接。

技能目录结构：

```
wechat-article-search/
├── SKILL.md                 # 技能主文件（执行契约）
├── README.md                # 本说明文档
├── scripts/
│   ├── search_wechat.js      # 检索主脚本（解析 + 反爬护栏）
│   └── get_sogou_cookie.js   # 零依赖 CDP Cookie 提取脚本（方案 A2 一键脚本）
└── _skillhub_meta.json       # 市场安装元数据（勿手动改动）
```

## 二、反爬三维模型与方案定位

搜狗微信对自动化检索存在三层防护，本技能只解决其中一层：

| 维度 | 含义 | 本技能能否解决 | 解法 |
|------|------|----------------|------|
| IP 维 | 出站 IP 被锁封 / 限流 | 不能 | 更换网络出口 IP；Cookie 方案无效 |
| 会话维 | `antispider` 验证码拦截 | 能（部分） | 真实浏览器过码后提取 `SNUID` 等 Cookie，经 `-c` 回填 |
| 指纹维 | 机器人特征识别 | 缓解 | 真实浏览器的 TLS / JS 指纹，比纯脚本更可信 |

**结论：** 浏览器驱动仅缓解会话维，不解决 IP 维锁封。技能须如实向用户说明此边界，不得夸大。

## 三、解耦选型说明（为何只用 chrome-devtools，不用 browser-skill）

本技能与 `chrome-devtools` 相互独立、仅按需调用，保持解耦：

- `search_wechat.js` 解析逻辑零改动，仅通过 `-c` 接口接收 Cookie；
- `get_sogou_cookie.js` 直接走标准 CDP（Chrome DevTools 协议）读取 Cookie，不依赖 `chrome-devtools` MCP 工具链本身。

**放弃 `browser-skill` 的原因：** `browser-skill` 的红线明确禁止提取 Cookie、凭证、Token 等敏感信息，无法服务「提取 `SNUID` 回填 `-c`」这一核心闭环；而 `chrome-devtools`（及其底层 CDP）可读 `weixin.sogou.com` 的 Cookie（含 HttpOnly），是合规且可行的路径。

## 四、方案演进（修改历史）

| 版本 | 时间 | 变更要点 |
|------|------|----------|
| 0.1.1 | 市场初始版本 | 基础检索脚本 `search_wechat.js`，无反爬缓解；命中 `antispider` 时静默返回空结果。 |
| 0.1.2 | 反爬闭环迭代 | 新增 `-c/--cookie` 接口；`search_wechat.js` 命中 `antispider` 时明确抛出 `ANTI_SPIDER` 并给出提示，不再静默返回空；引入 `get_sogou_cookie.js` 经 CDP 提取 Cookie 的初步方案（时称「方案 B」）。 |
| 0.1.3 | 本次整理 | 1) 定位澄清：反爬仅缓解会话维，不解决 IP 维；2) 解耦并确立「仅调用 chrome-devtools、放弃 browser-skill」；3) 将「chrome-devtools 获取 Cookie」固化为一键脚本（文件内称「方案 A2」）；4) `SKILL.md` 纯化，移除选型说明 / 修改历史等解释性内容，迁至本 `README.md`；5) 新增 chrome-devtools 不可用时的回退方案（直接免 Cookie 调用 / 手动提供 Cookie / 暂缓重试 / 更换 IP）；6) 将 chrome-devtools→`-c` 提升为优先路径；7) 补全 `description` 五要素（含「不适用于」）与参数表、示例、边界。 |

## 五、使用提示

- 浏览器调试实例默认端口 `127.0.0.1:9223`；可用环境已有的启动脚本（如 `启动360chromex+MCP_Bridge桥接+chrome-devtools.bat`）或临时 profile 启动。
- 人机验证环节必须人工完成，自动化过码既不合规也不可靠。
- 合规边界：仅用于学习研究，禁止商业或大规模绕过。
