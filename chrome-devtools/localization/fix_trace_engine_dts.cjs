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
// F5 修复：与 upstream/scripts/prepare.ts 同款意图，但放宽锚定——
//   原正则要求 interface 声明后「全局块闭合 } 必须紧随其自身的闭合 }」，
//   一旦 declare global 内 HTMLElementEventMap 之后还有其它成员（非末位），整体即不匹配、剥离失败 → tsc 报 TS2717 复发。
//   改为仅锚定 interface 声明本身：其 [^}]* 不能跨 }，必停于该 interface 自身的闭合 }，
//   无论它在 declare global 内处于首位/中位/末位均可稳健剥离（且不会误吞后续成员）。
const RE = /interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}/s;
// 预检是否落在 declare global 上下文（仅作信息提示，不影响匹配稳健性）
const inGlobal = /declare global\s*\{[\s\S]*interface HTMLElementEventMap/.test(content);
if (!RE.test(content)) {
  console.log('[fix-dts] 未检测到冲突声明（已处理或上游变更），跳过。');
  process.exit(0);
}
const newContent = content.replace(RE, '');
fs.writeFileSync(DTS, newContent, 'utf-8');
console.log('[fix-dts] 已剥离 @paulirish/trace_engine 的冲突全局声明（TS2717 修复）。');
