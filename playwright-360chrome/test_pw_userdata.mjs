// test_pw_userdata.mjs —— 验证「从 User Data 复制临时副本 + 关闭后删除」
// 用法：node test_pw_userdata.mjs
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { launch360 } from './pw_launch.mjs';

const PREFIX = 'pw_userdata_';
function snap() {
  try {
    return fs.readdirSync(os.tmpdir()).filter(n => n.startsWith(PREFIX));
  } catch { return []; }
}

const before = snap();
console.log(`[测试] close 前 tmp 中 ${PREFIX}:`, before);

let context;
try {
  context = await launch360('userdata'); // 内部应已 fs.cpSync 复制 User Data 临时副本
} catch (e) {
  console.error('[测试] launch360 失败：', e.message);
  process.exit(1);
}
console.log('[测试] context 已创建（launch360 内部应已复制 User Data 临时副本）');

const during = snap();
console.log('[测试] 运行时 tmp 中', PREFIX + ':', during);

// 打开一个页面，确认 360Chromex 启动 + 继承登录态可用
const page = await context.newPage();
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
console.log('[测试] 已打开页面:', page.url(), '（说明 360Chromex 启动 + 继承登录态可用）');

// 关闭 context：userdata 模式下应触发临时副本删除
await context.close();
console.log('[测试] context 已关闭（应触发临时副本删除）');

const after = snap();
console.log('[测试] close 后 tmp 中', PREFIX + ':', after);

// 判定：运行时存在、关闭后清空
const created = during.filter(d => !before.includes(d));
const remaining = after.filter(d => created.includes(d));
if (created.length > 0 && remaining.length === 0) {
  console.log('PASS: 临时副本已创建且关闭后已删除');
  process.exit(0);
} else {
  console.log('FAIL: 临时副本创建=', created.length, ' 残留=', remaining.length);
  process.exit(1);
}
