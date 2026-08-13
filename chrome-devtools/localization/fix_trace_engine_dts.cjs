// localization/fix_trace_engine_dts.cjs
// 上游官方 workaround（对应 upstream/scripts/prepare.ts 的 removeConflictingGlobalDeclaration）：
//   devtools-frontend 的 front_end/models/trace/ModelImpl.ts 与
//   @paulirish/trace_engine 的 models/trace/ModelImpl.d.ts 都向全局接口
//   HTMLElementEventMap 注入 `[ModelUpdateEvent.eventName]: ModelUpdateEvent`，
//   但二者 ModelUpdateEvent 的类型身份不同（分属不同模块）→ tsc 报 TS2717。
//   上游在 npm install 之后、tsc 之前剥离 @paulirish/trace_engine 那一份冲突声明。
// 本脚本仅执行该安全剥离（只改 node_modules 内 .d.ts，不动源码、不碰版本库、不触发 submodule 克隆），
// 且幂等：已剥离则跳过。每次 npm install 会还原该 .d.ts，故须于每次构建前重跑。
// 所有路径按脚本位置相对解析，跨机可用。

const fs = require('fs');
const path = require('path');

const UPSTREAM = path.resolve(__dirname, '..', 'upstream');
const DTS = path.join(UPSTREAM, 'node_modules', '@paulirish', 'trace_engine', 'models', 'trace', 'ModelImpl.d.ts');

if (!fs.existsSync(DTS)) {
  console.log('[fix-dts] 未找到 ' + DTS + '（跳过）。');
  process.exit(0);
}

const content = fs.readFileSync(DTS, 'utf-8');
// 与 upstream/scripts/prepare.ts 同款正则：匹配 declare global { interface HTMLElementEventMap { [ModelUpdateEvent.eventName]: ModelUpdateEvent; } }
const RE = /declare global\s*\{\s*interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}\s*\}/s;
if (!RE.test(content)) {
  console.log('[fix-dts] 未检测到冲突声明（已处理或上游变更），跳过。');
  process.exit(0);
}
const newContent = content.replace(RE, '');
fs.writeFileSync(DTS, newContent, 'utf-8');
console.log('[fix-dts] 已剥离 @paulirish/trace_engine 的冲突全局声明（TS2717 修复）。');
