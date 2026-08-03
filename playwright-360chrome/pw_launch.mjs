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
