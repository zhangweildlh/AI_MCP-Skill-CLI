#!/usr/bin/env node
/**
 * Level-3 有头回交「续跑守护」编排器（B-01/B-02 闭环配套）。
 *
 * 把单批动作串成可断点续跑的循环，每轮严格按引导词顺序：
 *   ① level3_cdp_fetch.js --batch N  驱动真实 9223 浏览器取回正文、写合格 handback（保留证据标签）
 *   ② 批量 --retire-stub             退役「3 级实探确认已删除」的 stub（离开 needs-fetch / pending_fetch）
 *   ③ --verify-batch --json          独立 CDP 取证复核；rejected>0 或 provenanceValid=false 即停机诊断
 *   ④ --ingest-pending               消费 handback 入库（过滤 / 闸门 / 查重复验全在 pipeline 内）
 *   ⑤ --close-tabs                   仅关闭已成功消费的证据标签；在途（入库失败待重试）标签保留
 *   ⑥ 进展检测：stub 数未下降即停机，避免反爬限流下空转
 *
 * [FID] 约束：folder_id 每轮经 state.js resolve-folder 按 --folder-name 实时解析，禁止硬编码。
 * 参数：--ws --card --kb-id --folder-name --port --batch --max-rounds --rounds(0=直到清空)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = __dirname;
const PIPE = path.join(SKILL_DIR, 'pipeline.js');
const FETCH = path.join(SKILL_DIR, 'level3_cdp_fetch.js');
const STATE = path.join(SKILL_DIR, 'state.js');

function arg(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const WS = path.resolve(arg('--ws', process.cwd()));
const CARD = arg('--card', 'A');
const PORT = arg('--port', '9223');
const KB = arg('--kb-id', '');
const FOLDER_NAME = arg('--folder-name', '');
const BATCH = Number(arg('--batch', '10'));
const MAX_ROUNDS = Number(arg('--max-rounds', '20'));
const ROUNDS = Number(arg('--rounds', '0')); // 0 = 跑到清空或无进展
const DIRECT = process.argv.includes('--direct'); // 搜狗 link 被限流时改用 stub.candidates 的 mp 真实直链
const LOG = path.join(WS, 'l3_drive.log');

function log(s) { try { fs.appendFileSync(LOG, s + '\n', 'utf8'); } catch (_) {} console.log(s); }
function detail(tag, out, err) { try { fs.appendFileSync(LOG, `--- ${tag} ---\n${out || ''}\n${err || ''}\n`, 'utf8'); } catch (_) {} }
function run(script, argv, timeout = 900000) {
  const r = spawnSync('node', [script, ...argv], { encoding: 'utf8', cwd: WS, timeout, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '', error: r.error ? r.error.message : '' };
}
function looseJson(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; } }
/** B9：统计本卡全部 .md。原实现只认 NEEDS_FETCH 标记，而 pipeline 在「拒收 / 入库失败」时
 * 会保留不带该标记的 handback —— 漏计会使 before=0，驱动误判「所有 stub 已清空」并正常退出，
 * 但状态机仍 needs-fetch、闭环不可达。取回脚本自身仍只处理 stub（isPending），二者职责不同。 */
function stubs() {
  const d = path.join(WS, 'pending_fetch');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.startsWith(CARD + '__') && f.endsWith('.md'));
}

/** B1：以目录实际文件为准对账历史重试清单，清除「早已闭环却永留」的僵尸 key。 */
function reconcileRetry() {
  const p = path.join(WS, '_l3_retry_' + CARD + '.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return 0; }
  if (!Array.isArray(list)) return 0;
  const d = path.join(WS, 'pending_fetch');
  const kept = list.filter((k) => fs.existsSync(path.join(d, String(k) + '.md')));
  const removed = list.length - kept.length;
  if (removed) { try { fs.writeFileSync(p, JSON.stringify(kept)); } catch (_) {} }
  return removed;
}

/** B3：把续跑断点信号写入 _progress_<card>.json（SKILL.md §「断点续跑」唯一事实源），
 * 由 state.js update-card --l3-checkpoint 单一入口承载，不新建并行状态文件。 */
function checkpoint(phase, round, remain, reason) {
  const pp = path.join(WS, '_progress_' + CARD + '.json');
  const payload = JSON.stringify({ phase, round, remain, reason: reason || '', at: new Date().toISOString(), mode: DIRECT ? 'direct' : 'sogou' });
  const r = run(STATE, ['--progress', pp, 'update-card', '--card', CARD, '--l3-checkpoint', payload], 30000);
  if (r.status !== 0) log('  [警告] 断点写入失败：' + String(r.err || r.out).slice(0, 160));
}
function resolveFolder() {
  if (!FOLDER_NAME || !KB) { log('[致命] 缺少 --kb-id / --folder-name（[FID] 须实时解析，禁止硬编码）'); process.exit(2); }
  const r = run(STATE, ['resolve-folder', '--name', FOLDER_NAME, '--kb-id', KB, '--json'], 120000);
  const j = looseJson(r.out);
  if (r.status !== 0 || !j || !j.folder_id) { log('[致命] resolve-folder 失败：' + (r.err || r.out).slice(0, 300)); process.exit(2); }
  return j.folder_id;
}
function retireAll() {
  const p = path.join(WS, '_l3_retire_' + CARD + '.json');
  let list = []; try { list = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  if (!Array.isArray(list)) list = [];
  let n = 0; const remain = [];
  for (const item of list) {
    // 兼容两种清单格式：早期纯字符串 key，及新增的 {key, reason}（记录精确永久不可达理由）
    const ent = typeof item === 'string' ? { key: item, reason: 'Level-3 有头实探确认文章已被发布者删除' } : item;
    const k = ent && ent.key ? ent.key : '';
    if (!k || !fs.existsSync(path.join(WS, 'pending_fetch', k + '.md'))) continue;
    const r = run(PIPE, ['--workspace', WS, '--card', CARD, '--retire-stub', '--stub-key', k, '--reason', (ent.reason || 'Level-3 有头实探确认永久不可达') + '（3 级实探）']);
    if (r.status === 0) n++;
    else { remain.push(ent); log('  [退役失败] ' + k + ' ' + String(r.err || r.out).slice(0, 120)); }
  }
  try { fs.writeFileSync(p, JSON.stringify(remain)); } catch (_) {}
  return n;
}

function main() {
  if (!KB || !FOLDER_NAME) { log('用法：node level3_drive.js --ws <工区> --card A --kb-id K --folder-name <ima子目录名> [--port 9223] [--batch 10] [--max-rounds 20] [--rounds N] [--direct]'); process.exit(2); }
  // P2 修复：log()/detail() 均为 append，启动时若用 writeFileSync 会清空历史逐篇回交明细，
  // 导致断点续跑的可追溯链断裂。改为 append + 前导空行分隔每次启动会话。
  fs.appendFileSync(LOG, `\n===== level3_drive 启动 ${new Date().toISOString()} =====\n`, 'utf8');
  const FID = resolveFolder();
  log(`[FID] 实时解析：${FOLDER_NAME} → ${FID}`);
  const cleaned = reconcileRetry();
  log(`[对账] 清理陈旧重试条目 ${cleaned} 个（B1）`);
  checkpoint('start', 0, stubs().length, '续跑守护启动');
  log(`[配置] ws=${WS} card=${CARD} port=${PORT} batch=${BATCH} maxRounds=${MAX_ROUNDS} rounds=${ROUNDS || '直到清空'} mode=${DIRECT ? 'direct(mp真实直链)' : 'sogou(中转链)'}`);

  let round = 0, totIng = 0, totRet = 0;
  while (true) {
    const before = stubs().length;
    if (before === 0) { log('\n✅ 所有本卡文件已清空'); checkpoint('done', round, 0, '全部回交并消费完成'); break; }
    if (ROUNDS > 0 && round >= ROUNDS) { log('\n达到指定 --rounds 上限，正常暂停'); checkpoint('paused', round, before, 'rounds 上限'); break; }
    if (round >= MAX_ROUNDS) { log('\n达到 --max-rounds 上限，正常暂停'); checkpoint('paused', round, before, 'max-rounds 上限'); break; }
    round++;
    log(`\n===== 第 ${round} 轮 | 起始 stub=${before} =====`);

    // ① 有头取回
    const fetchArgs = ['--ws', WS, '--card', CARD, '--port', PORT, '--batch', String(BATCH)];
    if (DIRECT) fetchArgs.push('--direct');
    const f = run(FETCH, fetchArgs);
    detail('① level3_cdp_fetch', f.out, f.err);
    const wrote = Number((String(f.out).match(/写回交 (\d+)/) || [])[1] || 0);
    log(`[1] 取回：写回交 ${wrote}${f.error ? '（异常:' + f.error + '）' : ''}`);

    // ② 退役删除页
    const ret = retireAll(); totRet += ret;
    log(`[2] 退役已删除页：${ret}`);

    // ③ 独立取证门禁
    const v = run(PIPE, ['--workspace', WS, '--card', CARD, '--verify-batch', '--batch-id', 'default', '--json']);
    const vj = looseJson(v.out);
    if (!vj) { log('[3] verify-batch JSON 解析失败，停机诊断：' + String(v.out || v.err).slice(0, 400)); checkpoint('blocked', round, before, 'verify-batch JSON 解析失败'); break; }
    log(`[3] 门禁：done=${vj.done}/${vj.total} pending=${vj.pending} missing=${vj.missing} rejected=${vj.rejected} provenanceValid=${vj.provenanceValid} batchDone=${vj.batchDone}`);
    if (vj.rejected > 0 || vj.provenanceValid === false) { log('  ⚠️ 存在拒收或证据无效，停机诊断（不继续消费，避免污染 KB）'); checkpoint('blocked', round, before, `门禁拒收=${vj.rejected} provenanceValid=${vj.provenanceValid}`); break; }

    // ④ 消费入库
    const ip = run(PIPE, ['--workspace', WS, '--card', CARD, '--ingest-pending', '--kb-id', KB, '--folder-id', FID]);
    detail('④ ingest-pending', ip.out, ip.err);
    const ing = Number((String(ip.out).match(/补入成功\s*:\s*(\d+)/) || [])[1] || 0);
    const stillFailed = Number((String(ip.out).match(/失败\s*:\s*(\d+)/) || [])[1] || 0);
    totIng += ing;
    log(`[4] 消费：补入成功=${ing} 仍失败=${stillFailed}${ip.error ? '（异常:' + ip.error + '）' : ''}`);

    // ⑤ 关闭已消费标签（在途自动保留）
    const ct = run(FETCH, ['--ws', WS, '--card', CARD, '--port', PORT, '--close-tabs']);
    log(`[5] ${String(ct.out).trim() || 'close-tabs 完成'}`);

    const after = stubs().length;
    log(`[6] 本轮后 stub=${after}（减少 ${before - after}）`);
    if (after >= before && (vj.pending || 0) === 0) { log('⚠️ 本轮无进展，停机（疑似反爬限流或全部为待诊断条目）'); checkpoint('stalled', round, after, '无进展且批次无 pending'); break; }
    checkpoint('round', round, after, `本轮减少 ${before - after}，批次 pending=${vj.pending || 0}`);
  }
  log(`\n===== 汇总：轮数=${round} 累计入库=${totIng} 累计退役=${totRet} 剩余 stub=${stubs().length} =====`);
}

main();
