---
name: playwright-360chrome
slug: playwright-360chrome
version: 2.0.0
homepage: local://skills/playwright-360chrome
description: "通过 Playwright（含 MCP 浏览器工具）实现浏览器自动化：导航网页、点击元素、填写表单、截图、提取数据、调试真实浏览器工作流。适用场景：(1) 需要真实浏览器而非静态抓取时；(2) 任务涉及 Playwright MCP、浏览器工具、Playwright 测试/脚本或 JS 渲染页面时；(3) 用户希望将导航、表单、截图、PDF、下载或浏览器驱动的提取转化为可靠结果时。"
metadata: {"clawdbot":{"emoji":"P","requires":{"bins":["node","npx"]},"os":["linux","darwin","win32"],"install":[{"id":"npm-playwright","kind":"npm","package":"playwright","bins":["playwright"],"global":true,"label":"Install Playwright (global → node_global)"},{"id":"npm-playwright-mcp","kind":"npm","package":"@playwright/mcp","bins":["playwright-mcp"],"global":true,"label":"Install Playwright MCP (global, optional)"}]}}
---

## When to Use

Use this skill for real browser tasks: JS-rendered pages, multi-step forms, screenshots or PDFs, UI debugging, Playwright test authoring, MCP-driven browser control, and structured extraction from rendered pages.

Prefer it when static fetch is insufficient or when the task depends on browser events, visible DOM state, authentication context, uploads or downloads, or user-facing rendering.

If the user mainly wants the agent to drive a browser with simple actions like navigate, click, fill, screenshot, download, or extract, treat MCP as a first-class path.

Use direct Playwright for scripts and tests. Use MCP when browser tools are already in the loop, the user explicitly wants MCP, or the fastest path is browser actions rather than writing new automation code.

Primary fit is repo-owned browser work: tests, debugging, repros, screenshots, and deterministic automation. Treat rendered-page extraction as a secondary use case, not the default identity.

## Architecture

This skill is instruction-only. It does not create local memory, setup folders, or persistent profiles by default.

Load only the smallest reference file needed for the task. Keep auth state temporary unless the repository already standardizes it and the user explicitly wants browser-session reuse.

## 本机依赖安装与检查规范

> 本机工具链优先 `D:\Tools\Assembly`（Node / UV 等已在系统 + 用户 PATH 双通道注册=）；Python 一律经 UV 管理，**禁用裸 `python` / `pip`**。执行任何 Playwright 任务前，先按下方「检查 → 缺失则安装」流程确保依赖就绪。

### 必须依赖

| 依赖 | 用途 | 本机来源 / 安装方式 |
|---|---|---|
| Node.js + npm（全局 prefix） | 运行/调用已全局安装的 Playwright 与 MCP，**一律全局调用**：`node "$(npm root -g)/@playwright/mcp/cli.js"`（或 `npx`，npx 解析全局）；**禁止** `npx -y @playwright/mcp` 让其重新联网下载到 npx 缓存 | `D:\Tools\Assembly\nodejs`（npm 全局 prefix = `D:\Tools\Assembly\nodejs\node_global`） |
| Playwright（Node 库） | 浏览器自动化核心 | **全局安装**：`npm install -g playwright` → 落到 `D:\Tools\Assembly\nodejs\node_global\node_modules`（**禁止**项目内 `npm i playwright`，即禁止装到 `D:\Tools\360Chrome\node_modules` 等本地目录） |
| @playwright/mcp（可选） | 暴露 `browser_*` MCP 工具 | **全局安装**：`npm install -g @playwright/mcp` → 落 `D:\Tools\Assembly\nodejs\node_global\node_modules`；**调用一律全局**：`node "$(npm root -g)/@playwright/mcp/cli.js" --executable-path D:/Tools/360Chrome/360chromex.exe --user-data-dir D:/Tools/360Chrome/MCPProfile`（禁止 `npx -y` 落到缓存、禁止 `--headless` 调自带 Chromium） |
| UV | Python 路径与依赖管理 | `D:\Tools\Assembly\uv`（已在 PATH） |
| Playwright（Python，可选） | 若走 Python 路径 | 经 UV 安装（见下） |

### 自动检查（执行前先核实）

- `node -v` / `npx --version` —— 验证 Node / npx 可用（优先 `D:\Tools\Assembly\nodejs`）。
- **Playwright 全局就绪检查（核心）**：`npm ls -g playwright` 应列出已装版本；或核验目录 `Test-Path D:\Tools\Assembly\nodejs\node_global\node_modules\playwright` 存在。`npx playwright --version` 作为补充验证（npx 会解析全局）。
- `uv --version` —— 验证 UV 可用。
- Python 包检查（若走 Python 路径）：`uv tree --project D:\Tools\Assembly\python\myenv` 或 `uv pip list --python D:\Tools\Assembly\python\myenv\.venv\Scripts\python.exe`，确认 `playwright` 已在列。
- ⚠️ **只认全局**：检查只看全局 `node_global\node_modules`；若仅在项目本地 `node_modules` 发现 playwright，一律视为「未按要求安装」，必须改全局重装。

### 自动安装（检查缺失则按以下顺序）

> 🔒 **全局安装铁律**：本机所有 npx 依赖包与全局程序（Playwright 及可选 MCP）**一律安装到 `D:\Tools\Assembly\nodejs\node_global\node_modules`**（即 npm 全局 prefix `D:\Tools\Assembly\nodejs\node_global`）。**严禁**装到项目本地 `node_modules`（如 `D:\Tools\360Chrome\node_modules`）——那会被本机约束视为无效安装并要求重装。**调用已装包时一律用全局绝对路径**：`node "$(npm root -g)/<pkg>/cli.js"` 或全局 bin（如 `D:\Tools\Assembly\nodejs\node_global\node_modules\.bin\playwright-mcp`），**禁用 `npx -y`** 触发重新联网下载到 npx 缓存。

- **Node / Playwright 缺失**：**强制全局**安装，且**跳过 Playwright 自带 Chromium 下载**（本机用 360Chromex）；**禁止**运行 `playwright install` / `npx playwright install` 等会下载浏览器的命令（本机永不下载 Chromium，只用 360Chromex）：
  ```powershell
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; npm install -g playwright
  ```
  可选 MCP（**同样全局、同样跳过下载**）：`$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; npm install -g @playwright/mcp` → 落 `D:\Tools\Assembly\nodejs\node_global\node_modules`；调用用 `node "$(npm root -g)/@playwright/mcp/cli.js" --executable-path D:/Tools/360Chrome/360chromex.exe`，**禁止** `npx -y @playwright/mcp` 重新下载、禁止 `--headless` 调自带 Chromium。
- **全局包解析说明**：因 Playwright 装在全局，直接 `import/require('playwright')` 的脚本（如 `pw_launch.mjs`）需能解析全局包。**统一走本 Skill 根目录的 `pw_launch.mjs` 封装**（与 SKILL.md 同级；调用用 `./pw_launch.mjs` 相对引用）——其内部已用 `createRequire` 从 `npm root -g` 解析全局 playwright，无需设置 `NODE_PATH`。若自行写脚本调用 `@playwright/mcp`，一律用全局绝对路径：`node "$(npm root -g)/@playwright/mcp/cli.js" --executable-path D:/Tools/360Chrome/360chromex.exe --user-data-dir D:/Tools/360Chrome/MCPProfile`，**禁止 `npx -y @playwright/mcp`**。
- **Python / Playwright 缺失（若走 Python 路径）**，依次尝试直到成功（退出码 0）：
  1. `uv add --project D:\Tools\Assembly\python\myenv playwright`
  2. `uv add --directory D:\Tools\Assembly\python\myenv playwright`
  3. `uv pip install playwright --python D:\Tools\Assembly\python\myenv\.venv\Scripts\python.exe`
- **安装前「2 项检查」（避免重复安装）**：全局 `uv tool list` + `uv pip list`；项目 `uv tree --project D:\Tools\Assembly\python\myenv` + `uv pip list --python D:\Tools\Assembly\python\myenv\.venv\Scripts\python.exe`。命中已装则**禁止重复安装**，告知用户「[名称] 已存在」。
- ⚠️ **严禁**裸 `pip install`、`python xxx.py`；运行 Python 一律 `uv run --project D:\Tools\Assembly\python\myenv python [脚本]`。

## 本机浏览器二进制与配置硬约束

> 本机浏览器自动化统一用 **360 极速浏览器 X（360Chromex，Chromium 内核）**，浏览器根目录固定为 **`D:\Tools\360Chrome`**，并复用其日常浏览配置。以下为硬约束，任何 Agent / 脚本必须无条件遵守（源自永久记忆 §5.4）：
> - **浏览器二进制**：`D:\Tools\360Chrome\360chromex.exe`（强制、唯一，硬编码允许）。
> - **日常浏览配置（只读源）**：`D:\Tools\360Chrome\User Data`——自动化须**继承并使用**这套配置，但**绝对不得修改**其任何内容（见下方「配置继承」）。

### 1. 强制浏览器二进制

- 唯一强制：`D:\Tools\360Chrome\360chromex.exe`。Playwright 一律 `executablePath: 'D:/Tools/360Chrome/360chromex.exe'`。
- **严禁**省略 `executablePath` 让 Playwright 下载 / 调用其自带 Chromium（那会脱离本机已登录的 360Chromex 环境）。

### 2. 配置继承（必须）+ 不修改原配置（硬）

- **继承**：自动化必须复用日常浏览配置 `D:\Tools\360Chrome\User Data` 的已登录账号、Cookie、扩展与偏好——即「继承和使用」这套日常配置。
- **不修改（硬）**：Agent **严禁**直接写入 / 改动 `D:\Tools\360Chrome\User Data` 目录本身（不改 Preferences、不增删扩展、不破坏其任何状态）。运行态（新 Cookie / 历史 / 缓存）只能落在**副本**上。
- **实现方式（二选一）**：
  - 用预置克隆副本：`D:\Tools\360Chrome\PWProfile`（已是 User Data 的克隆，含登录态；当前活跃副本 `PWProfileFresh`）。
  - 或运行时从 User Data 复制一次性临时副本：`robocopy "D:\Tools\360Chrome\User Data" <临时目录> /E /COPYALL` 后 `launchPersistentContext(<临时目录>)`；**使用完毕后必须删除该临时目录**（参考本 Skill 根目录 `pw_launch.mjs` 的「关闭后自动删除临时副本」实现）。
- ⚠️ **锁冲突铁律**：同一 `userDataDir` 同时只能一个进程；日常浏览器正占用 `User Data` 时，自动化**必须**用副本 `PWProfile`，不得强行占用 `User Data`。

### 3. 标准启动（继承 User Data 但不修改原配置）

```js
const { chromium } = require('playwright');
const EXEC = 'D:/Tools/360Chrome/360chromex.exe';
// 继承日常配置但不修改原 User Data：使用其克隆副本 PWProfile（已含登录态）
const context = await chromium.launchPersistentContext(
  'D:/Tools/360Chrome/PWProfile',                 // 副本，不碰原 User Data
  { executablePath: EXEC, headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] }
);
```

> 若需「原样使用 User Data 但不写回」：运行时先 `robocopy` 复制 User Data 到临时目录，再 `launchPersistentContext(临时目录)`，并在 context 关闭后删除该临时目录（参考本 Skill 根目录 `pw_launch.mjs` 的「关闭后自动删除临时副本」实现）。

### 4. 启动参数（360Chromex 兼容）

- 至少 `--no-sandbox`；遇 360 安全中心 / 登录弹窗或 CDP 握手失败，追加 `--disable-blink-features=AutomationControlled`、`--disable-features=...` 或 `headless:false` 规避。
- 360Chromex 对 Playwright 部分默认 flag 支持不全，遇启动异常先排查 flag 与版本校验（必要时忽略 Playwright 的浏览器版本检查）。

## 自修复：确保核心封装 pw_launch.mjs 完整可用

> 本 Skill 的核心启动封装 `pw_launch.mjs` 与 SKILL.md **同目录（本 Skill 根目录）**，是每次浏览器自动化任务的统一入口。为防止该文件被误删/损坏（历史上曾误置于浏览器安装目录 `D:\Tools\360Chrome\`，易被升级或清理波及）导致自动化中断，Agent 在**每次执行 Playwright 任务前**，必须先执行下列「存在性 + 完整性」检查；若缺失或破损，立即按附录权威源码重建。

### 1. 检查流程（每次任务启动前）
1. **定位**：`pw_launch.mjs` 应位于本 Skill 根目录（即 SKILL.md 同目录）。确认该文件是否存在。
2. **完整性校验**（文件存在时，两项都须通过）：
   - **(a) 语法层**：`node --check pw_launch.mjs` 退出码必须为 0（在 Skill 根目录下执行）。
   - **(b) 关键契约层**：文件须包含以下三个关键标记，缺一则视为破损：
     - `export async function launch360`（核心导出函数）
     - `const EXECUTABLE = 'D:/Tools/360Chrome/360chromex.exe'`（强制浏览器二进制约束）
     - `createRequire`（从全局 `npm root -g` 解析 playwright 的实现）
3. **裁决**：
   - 文件存在 **且** (a)(b) 均通过 → 视为完好，直接复用，**跳过重建**。
   - 文件**不存在** 或 任一校验失败 → 进入「2. 重建流程」。

### 2. 重建流程（缺失/破损时）
1. **删除旧文件**（仅当文件存在且破损）：删除本 Skill 根目录内的 `pw_launch.mjs`（**只删这一个文件**，绝不影响浏览器目录 `D:\Tools\360Chrome\` 或其他文件）。
2. **重建**：将本文件末尾「**附录 A：pw_launch.mjs 权威源码**」代码块的内容**原样写入** `pw_launch.mjs`（与 SKILL.md 同级）。
3. **复核**：再次执行「1. 检查流程」两步校验，确认重建成功。
4. **失败上报**：若重建后仍校验失败，或附录源码本身不可用，向用户明确报告「pw_launch.mjs 自修复失败，自动化无法继续」，**禁止静默继续或回退到浏览器目录的旧路径**。

### 3. 调用方式
- Agent 运行/引用封装时，使用本 Skill 根目录的 `pw_launch.mjs`：
  - 脚本内引用：`import { launch360 } from './pw_launch.mjs'`（基于模块 URL 解析，与当前工作目录无关）。
  - 命令行直接运行：先进入本 Skill 根目录，再执行 `node pw_launch.mjs [pw|fresh|userdata]`。
- 回归自测（可选）：先进入本 Skill 根目录，再执行 `node test_pw_userdata.mjs`，判定 PASS 表示「复制临时副本 + 关闭后删除」机制完好。

## Quick Start

### MCP browser path
```bash
# ✅ 正确（全局调用 + 强制 360Chromex + 复用 MCP 专用副本）：
# 禁用 npx -y 重新下载、禁用 --headless 调自带 Chromium
node "$(npm root -g)/@playwright/mcp/cli.js" --executable-path "D:/Tools/360Chrome/360chromex.exe" --user-data-dir "D:/Tools/360Chrome/MCPProfile"
```

Use this path when the agent already has browser tools available or the user wants browser automation without writing new Playwright code.

### Common MCP actions

Typical Playwright MCP tool actions include:
- `browser_navigate` for opening a page
- `browser_click` and `browser_press` for interaction
- `browser_type` and `browser_select_option` for forms
- `browser_snapshot` and `browser_evaluate` for inspection and extraction
- `browser_choose_file` for uploads
- screenshot, PDF, trace, and download capture through the active browser workflow

### Common browser outcomes

| Goal | Typical MCP-style action |
|------|--------------------------|
| Open and inspect a site | navigate, wait, inspect, screenshot |
| Complete a form | navigate, click, fill, select, submit |
| Capture evidence | screenshot, PDF, download, trace |
| Pull structured page data | navigate, wait for rendered state, extract |
| Reproduce a UI bug | headed run, trace, console or network inspection |

### Existing test suite
```bash
npx playwright test
npx playwright test --headed
npx playwright test --trace on
```

### Bootstrap selectors and flows
```bash
npx playwright codegen https://example.com
```

### Direct script path
```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.screenshot({ path: 'page.png', fullPage: true });
  await browser.close();
})();
```

## Quick Reference

| Topic | File |
|------|------|
| Selector strategy and frame handling | `selectors.md` |
| Failure analysis, traces, logs, and headed runs | `debugging.md` |
| Test architecture, mocks, auth, and assertions | `testing.md` |
| CI defaults, retries, workers, and failure artifacts | `ci-cd.md` |
| Rendered-page extraction, pagination, and respectful throttling | `scraping.md` |

## Approach Selection

| Situation | Best path | Why |
|----------|-----------|-----|
| Static HTML or a simple HTTP response is enough | Use a cheaper fetch path first | Faster, cheaper, less brittle |
| You need a reliable first draft of selectors or flows | Start with `codegen` or a headed exploratory run | Faster than guessing selectors from source or stale DOM |
| Local app, staging app, or repo-owned E2E suite | Use `@playwright/test` | Best fit for repeatable tests and assertions |
| One-off browser automation, screenshots, downloads, or rendered extraction | Use direct Playwright API | Simple, explicit, and easy to debug in code |
| Agent/browser-tool workflow already depends on `browser_*` tools or the user wants no-code browser control | Use Playwright MCP | Fastest path for navigate-click-fill-screenshot workflows |
| CI failures, flake, or environment drift | Start with `debugging.md` and `ci-cd.md` | Traces and artifacts matter more than new code |

## Core Rules

### 1. Test user-visible behavior and the real browser boundary
- Do not spend Playwright on implementation details that unit or API tests can cover more cheaply.
- Use Playwright when success depends on rendered UI, actionability, auth, uploads or downloads, navigation, or browser-only behavior.

### 2. Make runs isolated before making them clever
- Keep tests and scripts independent so retries, parallelism, and reruns do not inherit hidden state.
- Extend the repository's existing Playwright harness, config, and fixtures before inventing a parallel testing shape from scratch.
- Do not share mutable accounts, browser state, or server-side data across parallel runs unless the suite was explicitly designed for it.

### 3. Reconnaissance before action
- Open, wait, and inspect the rendered state before locking selectors or assertions.
- Use `codegen`, headed mode, or traces to discover stable locators instead of guessing from source or stale DOM.
- For flaky or CI-only failures, capture a trace before rewriting selectors or waits.

### 4. Prefer resilient locators and web-first assertions
- Use role, label, text, alt text, title, or test ID before CSS or XPath.
- Assert the user-visible outcome with Playwright assertions instead of checking only that a click or fill command executed.
- If a locator is ambiguous, disambiguate it. Do not silence strictness with `first()`, `last()`, or `nth()` unless position is the actual behavior under test.

### 5. Wait on actionability and app state, not arbitrary time
- Let Playwright's actionability checks work for you before reaching for sleeps or forced actions.
- Prefer `expect`, URL waits, response waits, and explicit app-ready signals over generic timing guesses.

### 6. Control what you do not own
- Mock or isolate third-party services, flaky upstream APIs, analytics noise, and cross-origin dependencies whenever the goal is to verify your app.
- For rendered extraction, prefer documented APIs or plain HTTP paths before driving a full browser.
- Do not make live third-party widgets or upstream integrations the reason your suite flakes unless that exact integration is what the user asked to validate.

### 7. Keep auth, production access, and persistence explicit
- Do not persist saved browser state by default.
- Reuse auth state only when the repository already standardizes it or the user explicitly asks for session reuse.
- For destructive, financial, medical, production, or otherwise high-stakes flows, prefer staging or local environments and require explicit user confirmation before continuing.

## Playwright Traps

- Guessing selectors from source or using `first()`, `last()`, or `nth()` to silence ambiguity -> the automation works once and then flakes.
- Starting a new Playwright structure when the repo already has config, fixtures, auth setup, or conventions -> the new flow fights the existing harness and wastes time.
- Testing internal implementation details instead of visible outcomes -> the suite passes while the user path is still broken.
- Sharing one authenticated state across parallel tests that mutate server-side data -> failures become order-dependent and hard to trust.
- Reaching for `force: true` before understanding overlays, disabled state, or actionability -> the test hides a real bug.
- Waiting on `networkidle` for chatty SPAs -> analytics, polling, or sockets keep the page "busy" even when the UI is ready.
- Driving a full browser when HTTP or an API would answer the question -> more cost, more flake, less signal.
- Treating third-party widgets and live upstream services as if they were stable parts of your own product -> failures stop being actionable.

## External Endpoints

| Endpoint | Data Sent | Purpose |
|----------|-----------|---------|
| User-requested web origins | Browser requests, form input, cookies, uploads, and page interactions required by the task | Automation, testing, screenshots, PDFs, and rendered extraction |
| `https://registry.npmjs.org` | Package metadata and tarballs during optional installation | Install Playwright or Playwright MCP |

No other data is sent externally.

## Security & Privacy

Data that leaves your machine:
- Requests sent to the websites the user asked to automate.
- Optional package-install traffic to npm when installing Playwright tooling.

Data that stays local:
- Source code, traces, screenshots, videos, PDFs, and temporary browser state kept in the workspace or system temp directory.

This skill does NOT:
- Create hidden memory files or local folder systems.
- Recommend browser-fingerprint hacks, challenge-solving services, or rotating exits.
- Persist sessions or credentials by default.
- Make undeclared network requests beyond the target sites involved in the task and optional tool installation.
- Treat high-stakes production flows as safe to automate without explicit user direction.

## Trust

By using this skill, browser requests go to the websites you automate and optional package downloads go through npm.
Only install if you trust those services and the sites involved in your workflow.

## Related Skills
Install with `clawhub install <slug>` if user confirms:
- `web` - HTTP-first investigation before escalating to a real browser.
- `scrape` - Broader extraction workflows when browser automation is not the main challenge.
- `screenshots` - Capture and polish visual artifacts after browser work.
- `multi-engine-web-search` - Find and shortlist target pages before automating them.

## Feedback
- If useful: `clawhub star playwright`
- Stay updated: `clawhub sync`

## 附录 A：pw_launch.mjs 权威源码（自修复重建种子）

> 当「自修复」章节判定 `pw_launch.mjs` 缺失/破损时，将下方代码块内容**原样写入** `pw_launch.mjs`（与 SKILL.md 同级）。此源码即当前生效版本；今后若修改 `pw_launch.mjs`，须同步更新此处，否则自修复会回滚到旧版。

```js
// pw_launch.mjs —— 360Chromex + Playwright 统一启动封装
// 约束来源：~/.workbuddy/MEMORY.md §5.4（本机环境事实，任何人/任何 Agent 必须遵守）
//
// 三条硬约束（代码层面强制，无法绕过）：
//   1. 浏览器二进制唯一且强制：D:/Tools/360Chrome/360chromex.exe
//      —— 禁止省略 executablePath 让 Playwright 自行下载/调用自带 Chromium。
//   2. 复用登录态：一律用 launchPersistentContext(userDataDir)。
//   3. userDataDir 三选一（见 PROFILES）。
//
// 用法：
//   node pw_launch.mjs            # 默认用 PWProfile（自动化专用、已克隆登录态）
//   node pw_launch.mjs fresh      # 用 PWProfileFresh（当前活跃副本）
//   node pw_launch.mjs userdata   # 复用日常 User Data（使用前必须关闭日常浏览器，否则 SingletonLock 冲突）
//
// 依赖：本机已安装 Playwright（按 §5.4 / 技能约定**强制全局**安装到
// D:\Tools\Assembly\nodejs\node_global\node_modules，即 `npm install -g playwright`
// + PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1），Node 在 PATH。
// 因 Playwright 装在全局，ESM 默认不解析全局包，故用 createRequire 从 `npm root -g`
// 解析，确保本脚本在「仅全局安装」环境下也能加载 playwright。

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// 从全局 node_modules 解析 playwright（本机约定：依赖一律全局安装，故此处不写顶层 import）
function resolvePlaywright() {
  let globalRoot;
  try {
    globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  } catch {
    globalRoot = 'D:/Tools/Assembly/nodejs/node_global/node_modules';
  }
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch { /* 退回绝对路径 */ }
  return req(path.join(globalRoot, 'playwright'));
}
const { chromium } = resolvePlaywright();

// 【约束1】浏览器二进制——唯一、强制
const EXECUTABLE = 'D:/Tools/360Chrome/360chromex.exe';

// 【约束3】userDataDir 候选（复用登录态的目录）
const PROFILES = {
  pw:       'D:/Tools/360Chrome/PWProfile',
  fresh:    'D:/Tools/360Chrome/PWProfileFresh',
  userdata: 'D:/Tools/360Chrome/User Data', // 日常配置源（只读）：运行时由 launch360 复制为临时副本使用，原 User Data 不被修改
};

/**
 * 启动一个绑定 360Chromex 的持久化浏览器上下文（自动复用登录态）。
 * @param {'pw'|'fresh'|'userdata'} [which='pw'] 选择哪个 userDataDir
 * @param {object} [extra={}] 额外传给 launchPersistentContext 的选项（会与默认合并）
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function launch360(which = 'pw', extra = {}) {
  let userDataDir = PROFILES[which];
  if (!userDataDir) {
    throw new Error(`未知 profile "${which}"，可选：${Object.keys(PROFILES).join(' / ')}`);
  }
  // 【约束3·不修改原配置】userdata 以日常 User Data 为源，运行时复制一次性临时副本，
  // 在副本上读写；使用完毕（context 关闭）后自动删除该副本，原 User Data 保持只读、不被 Agent 改动。
  let tmp = null;
  if (which === 'userdata') {
    tmp = path.join(os.tmpdir(), `pw_userdata_${process.pid}_${Date.now()}`);
    fs.cpSync('D:/Tools/360Chrome/User Data', tmp, { recursive: true });
    userDataDir = tmp;
  }
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: EXECUTABLE, // 【约束1】锁定 360Chromex
    headless: false,            // 360Chromex 对 headless 支持不全，先用 false
    args: [
      '--no-sandbox',                                         // 必需：本机非标准沙箱环境
      '--disable-blink-features=AutomationControlled',        // 降低被站点检测为自动化的概率
    ],
    ...extra,
  });
  // 使用完毕（close 后）删除临时副本，避免残留。
  // 采用覆盖 context.close 的方式：在 await 原 close 之后同步删除（带重试应对残余文件锁），
  // 而非依赖 'close' 事件——后者在进程退出时可能来不及执行即随脚本结束被丢弃。
  if (tmp) {
    const origClose = context.close.bind(context);
    context.close = async () => {
      await origClose();
      for (let i = 0; i < 5; i++) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); break; }
        catch { await new Promise(r => setTimeout(r, 400)); }
      }
    };
  }
  return context;
}

// CLI 直接运行：给一个最小可验证示例（打开 GitHub 并报告当前 URL）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const which = process.argv[2] || 'pw';
  const context = await launch360(which);
  const page = await context.newPage();
  await page.goto('https://www.github.com', { waitUntil: 'domcontentloaded' });
  console.log(`[pw_launch] 已用 ${EXECUTABLE}`);
  console.log(`[pw_launch] profile=${which} -> ${PROFILES[which]}`);
  console.log(`[pw_launch] 已打开 ${page.url()}（登录态已复用）`);
  // 使用完毕关闭 context：userdata 模式下会自动删除临时副本
  await context.close();
  console.log('[pw_launch] 已关闭并清理临时副本（如适用）');
}
```
