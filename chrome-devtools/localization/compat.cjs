// localization/compat.cjs
// 兼容性修复（幂等）：上游 chrome-devtools-mcp@1.6.0 源码使用 zod v3 API，但未锁定版本；
// npm install 浮动装上 zod v4 会导致 tsc 编译失败（TS2345/TS2339/TS2694 等）。
// 通过 package.json 的 overrides 固定 zod 为已知兼容版本，保证跨机首次 npm install 可重现构建。
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const ZOD_PIN = '3.25.76';

function ensure() {
  const p = path.join(REPO, 'package.json');
  if (!fs.existsSync(p)) { console.error('[兼容] 未找到 package.json: ' + p); return; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!j.overrides) j.overrides = {};
  if (j.overrides.zod !== ZOD_PIN) {
    j.overrides.zod = ZOD_PIN;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
    console.log('[兼容] 已固定 zod=' + ZOD_PIN + ' (写入 package.json overrides)');
  } else {
    console.log('[兼容] zod 已固定为 ' + ZOD_PIN);
  }
}
module.exports = ensure;
