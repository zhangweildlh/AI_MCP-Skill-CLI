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
│   ├── search_wechat.js      # 检索主脚本（解析 + 反爬护栏 + CLI 严格校验）
│   ├── get_sogou_cookie.js   # 零依赖 CDP Cookie 提取脚本（方案 A2 一键脚本）
│   └── deploy.js             # 开发态 → 部署态 一键同步（从 git blob 取字节）
└── tests/
    ├── run_tests.js          # 单测 / 集成台（vm + 桩 https，零真实网络）
    ├── cross_engine/         # 跨引擎交叉验证（Node ↔ Python 参考实现）
    └── fixtures/             # 搜狗响应样本（normal / empty / antispider）
```

> 部署态目录另含 `_skillhub_meta.json` 与 `tests/audit/`（市场安装元数据与审计产物），属**部署态专有**，既不入库也不由 `deploy.js` 删除或覆盖。

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
| 0.1.3 | 首次入库整理 | 1) 定位澄清：反爬仅缓解会话维，不解决 IP 维；2) 解耦并确立「仅调用 chrome-devtools、放弃 browser-skill」；3) 将「chrome-devtools 获取 Cookie」固化为一键脚本（文件内称「方案 A2」）；4) `SKILL.md` 纯化，移除选型说明 / 修改历史等解释性内容，迁至本 `README.md`；5) 新增 chrome-devtools 不可用时的回退方案（直接免 Cookie 调用 / 手动提供 Cookie / 暂缓重试 / 更换 IP）；6) 将 chrome-devtools→`-c` 提升为优先路径；7) 补全 `description` 五要素（含「不适用于」）与参数表、示例、边界。 |
| 0.1.4 | 首轮静态审计与修复 | 三路交叉审计（OCR 原生 + delegate 宿主主审 + review-spd 五焦点）合并去重得 40 条，经确定性复现坐实 8 条缺陷、判废 2 条误报。修复项：<br>1) `isAntiSpider` 增加搜狗「合法空结果页」标记豁免，避免短小空页被误判为反爬（实测样本 620 字符）；<br>2) `datetime` 统一为北京时间（UTC+8）墙钟口径：相对时间分支不再用 `toISOString()`（UTC），新增 `parseChinaDateTime` 使时间窗过滤与运行机时区解耦；<br>3) `parseRelativeTime` 支持「刚刚」（此前落空 → 该文章被 `-d` 计为 undated 丢弃）；<br>4) `parseCliArgs` 改为严格校验：`-n 0`／非数字／未知选项／多余位置参数一律报错退出（码 2），不再静默回落默认值；<br>5) `url+=` 片段改为单次遍历保持文档顺序（混合单双引号时不再拼出错误 URL）；<br>6) `connectWs` 增加非 101 响应与握手超时处理（此前非 101 会使 Promise 永不落定、进程静默 exit 0 输出空 Cookie）；<br>7) WebSocket 127 分支帧长编码纠正为 RFC 6455 8 字节大端布局；<br>8) `get_sogou_cookie.js` 改为单一出口，`finally` 的 `ws.close()` 必执行；错误提示不再硬编码 `360chromex.exe`；<br>9) 删除死代码 `getSogouCookie()` / `extractCookies()`；<br>10) Python 参考解析器补 HTML 实体解码与 `is_anti_spider`，跨引擎纳入 antispider 样本并新增判定层交叉；<br>11) 新增 `scripts/deploy.js`：从 git blob 同步到部署态，规避 `core.autocrlf` 对工作树的污染；<br>12) 补 10 条回归锁定用例（Round1）。 |

## 五、开发态 → 部署态 部署流程

**铁律：部署态只读不改。** 任何修复一律回开发态源文件，合并回 main 后再重新部署。

```
# 在仓库内（或技能目录内）执行；从 git blob 取字节，保证部署态 == main 的 blob
node scripts/deploy.js --dry-run     # 先预演
node scripts/deploy.js               # 实际同步（写后逐文件校验）
```

**为什么必须走 blob 而不能直接拷工作树**：本仓库 `core.autocrlf=true` 且无 `.gitattributes`，`git checkout` 后工作树文件被转成 CRLF，而入库 blob 与部署态均为 LF。直接 `cp` 工作树会让部署态带上 CRLF，与 main blob 产生字节分歧（内容相同、行尾不同）。`deploy.js` 统一走 `git cat-file blob`，并在写后逐文件比对字节。

部署态专有文件（`_skillhub_meta.json`、`tests/audit/`）不被 `deploy.js` 删除或覆盖。

## 六、本轮修复后仍待处理项（P3，不阻塞质量门禁，留待后续轮次）

| 项 | 内容 | 延后理由 |
|----|------|----------|
| P3-1 | Python 参考解析器用非贪婪正则取 `news-list`，而 Node 端 `extractBlocks` 是嵌套感知的，真实页面含嵌套 `ul` 时两引擎会不一致 | 需重写参考实现的标签配对逻辑，改造面与引入新风险高于收益；当前 fixture 无嵌套 `ul`，不影响现有校验有效性 |
| P3-2 | `parseArticle` 用 `/(\d{10})/` 取 script 文本中「第一个」10 位数字作时间戳 | 搜狗该位置 script 常含其它 10 位数字，属潜在错值；修正需依赖页面结构语义，暂以 fixture 锁定现状 |
| P3-3 | `extractByClass` 未对 `className` 做正则转义 | 当前全部调用点无元字符，无实害；属公共工具函数的通用性加固 |
| P3-4 | `USER_AGENTS` 池 20 条全部为 2023~2024 年版本，且池固定、版本重复 | 属反爬策略面，与「IP 维不可由代码解决」的定位需一并评估，勿过度承诺效果 |
| P3-5 | `run_cross.js` 用 `execSync(shell:true)` 拼接路径 | Windows 下 `python` 为 `.cmd` 包装器，去掉 shell 会导致解释器解析失败；当前路径为脚本内常量、无注入实害，属必要权衡 |
| P3-6 | `ref_parser.py` 的 `sys.argv[1]` 无长度检查 | 本轮已补（退出码 2 + 用法提示），仅剩提示文案可再优化 |
| P3-7 | Cookie 凭据经 stdout 传递，重定向到日志即可能外泄 | 属用户明确要求的一键用法（下游 `-c` 依赖 stdout），为已知设计权衡；已在使用提示中留痕，不改动契约 |
| P3-8 | 测试台卫生：共享 `state`、向 vm sandbox 暴露宿主全局对象、未使用变量、错误处理偏弱 | 不影响任何断言有效性，属可维护性改进，按「修复与改进分离」另起一轮 |

## 七、使用提示

- 浏览器调试实例默认端口 `127.0.0.1:9223`；可用环境已有的启动脚本（如 `启动360chromex+MCP_Bridge桥接+chrome-devtools.bat`）或临时 profile 启动。
- 人机验证环节必须人工完成，自动化过码既不合规也不可靠。
- Cookie 属会话凭据：不要把 `get_sogou_cookie.js` 的标准输出重定向到日志文件或提交入库，建议用变量直接管道传给 `-c`。
- 合规边界：仅用于学习研究，禁止商业或大规模绕过。
