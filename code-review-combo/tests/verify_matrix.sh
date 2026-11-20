#!/usr/bin/env bash
#
# verify_matrix.sh — code-review-combo 全场景 × 全边界契约矩阵断言（v1.2.0，离线）
# ==========================================================================
# 用途：对修订后技能做纯静态契约断言（不调用 ocr / LLM），证明 R1 方案 §2.4 的
#       全场景 S1-S9 × 全边界 B1-B14 对应的代码路径与文档契约均存在。
# 断言分组（对应 §3.7.3）：
#   1. scene-coverage      场景 S1-S9 触发词 + audit_target_type 四值 + Stage0.5.4 挂载表
#   2. mirror-files        两镜文件存在非空 + SA-1~9 / TR-1~6 编号连续 + 严重度四值 + ⊘
#   3. severity-mapping    致命→high / 严重→medium / 一般→low / ⊘ / critical 保留 + 文档不占 critical
#   4. morph-applicability SA-2 单文件型 ⊘ + 非规则文本 TR ⊘（B10）
#   5. fallback-routing    audit_target_type 缺省/非法回退 program-code，不反问不中断（B11）
#   6. residual-risks      两镜输出纪律含「无法定位者入 Residual Risks」（B12）
#   7. self-contained      运行时文件零外部技能名 / URL / 跨技能调用（B14）
#   8. schema-frozen       merge_reports + SKILL.md Schema 五顶层键未变（由 schema_parity.js 承担）
#   9. regression-parity   既有 test_merge_reports.sh 通过（S1-S6 + B1-B9 等价）
#  10. manifest-registration  verify_matrix.sh 已登记 test_manifest.py（9.6.1/9.7）
#
# 判据纪律：禁用 grep -q（SIGPIPE 假阴性，见 AGENTS.md 门禁铁律④）；内容断言一律
#           用 node 逐文件 readFileSync，避免管道短读。退出码 = [FAIL] 组数。
# 环境变量：CRC_MATRIX_SKIP_MANIFEST=1 时跳过第 10 组（配对 meta PR 尚未合入时使用；
#           最终全量验证必须不带该变量重跑，确保登记已落地）。
# ==========================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

FAILS=0
run_group() {
  local name="$1"; shift
  if "$@"; then echo "[PASS] $name"; else echo "[FAIL] $name"; FAILS=$((FAILS + 1)); fi
}

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then echo "ERROR: 无 node，无法运行矩阵断言" >&2; exit 99; fi

# 1. scene-coverage
g_scene() {
  "$NODE_BIN" -e '
    const fs=require("fs");
    const s=fs.readFileSync(process.argv[1],"utf8");
    let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    const kws=["审查 Skill","审计 Skill","Skill 校验","规则审计","纪律审计","文本规则审查","目录型 Skill 审计","单文件 Skill 审计"];
    for(const k of kws) need("keyword:"+k, s.includes(k));
    for(const t of ["program-code","skill-dir","skill-file","text-rules"]) need("target-type:"+t, s.includes(t));
    need("Stage0.5.4", s.includes("0.5.4"));
    need("挂载表", s.includes("挂载的质量镜"));
    need("description 含 Skill 审计", s.includes("Skill 结构审计"));
    need("description 含文本规则审计", s.includes("文本规则"));
    process.exit(bad?1:0);
  ' "$ROOT/SKILL.md"
}

# 2. mirror-files
g_mirrors() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0;
    const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    const mirrors=[{p:"local/skill-audit-dimensions.md",pre:"SA",n:9},
                   {p:"local/text-rules-audit.md",pre:"TR",n:6}];
    for(const m of mirrors){
      let t=""; try{t=fs.readFileSync(path.join(root,m.p),"utf8");}catch{need(m.p+" 存在",false);continue;}
      need(m.p+" 非空",t.trim().length>0);
      const nums=[...new Set([...t.matchAll(new RegExp(m.pre+"-(\\d+)","g"))].map(x=>+x[1]))].sort((a,b)=>a-b);
      need(m.p+" "+m.pre+" 连续", JSON.stringify(nums)===JSON.stringify(Array.from({length:m.n},(_,i)=>i+1)));
      for(const sev of ["high","medium","low","critical","⊘"]) need(m.p+" 含 "+sev, t.includes(sev));
    }
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 3. severity-mapping
g_severity() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    const files=["local/skill-audit-dimensions.md","local/text-rules-audit.md"];
    for(const f of files){
      const t=fs.readFileSync(path.join(root,f),"utf8");
      need(f+" 致命→high", /致命[^\n]*high|high[^\n]*致命/.test(t));
      need(f+" 严重→medium", /严重[^\n]*medium|medium[^\n]*严重/.test(t));
      need(f+" 一般→low", /一般[^\n]*low|low[^\n]*一般/.test(t));
      need(f+" critical 保留", t.includes("critical") && t.includes("运行时后果"));
      need(f+" 文档不占 critical", t.includes("默认不占"));
    }
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 4. morph-applicability (B10)
g_morph() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    const sa=fs.readFileSync(path.join(root,"local/skill-audit-dimensions.md"),"utf8");
    const tr=fs.readFileSync(path.join(root,"local/text-rules-audit.md"),"utf8");
    need("SA-2 单文件型 ⊘", /SA-2[^\n]*单文件型[^\n]*⊘/.test(sa));
    need("TR 非规则文本 ⊘", tr.includes("非规则类文本") && tr.includes("⊘"));
    need("SA ⊘ 不计入问题", sa.includes("不计入问题"));
    need("TR ⊘ 不计入问题", tr.includes("不计入问题"));
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 5. fallback-routing (B11)
g_fallback() {
  "$NODE_BIN" -e '
    const fs=require("fs");
    const s=fs.readFileSync(process.argv[1],"utf8"); let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    need("缺省回退", s.includes("按目标形态推断") && s.includes("program-code"));
    need("非法回退", s.includes("取值非法") && s.includes("回退 `program-code`"));
    need("不中断", s.includes("不中断审查"));
    need("不反问", s.includes("不反问用户"));
    need("报告注明", s.includes("在报告注明"));
    process.exit(bad?1:0);
  ' "$ROOT/SKILL.md"
}

# 6. residual-risks (B12)
g_residual() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    for(const f of ["local/skill-audit-dimensions.md","local/text-rules-audit.md"]){
      const t=fs.readFileSync(path.join(root,f),"utf8");
      need(f+" Residual Risks", t.includes("Residual Risks") && t.includes("不进 findings"));
    }
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 7. self-contained (B14)
g_selfcontained() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0;
    // 禁用串动态拼接，避免测试脚本自身字面命中（自指命中，参见门禁铁律②）
    const banned=["skill"+"-forge","yao"+"-meta","yaojing"+"ang","github.com/yaojing"+"ang"];
    const files=["SKILL.md"];
    for(const d of ["local","tests"]){
      for(const n of fs.readdirSync(path.join(root,d))){
        const p=path.join(d,n);
        if(fs.statSync(path.join(root,p)).isFile() && /\.(md|sh|js)$/.test(n)) files.push(p);
      }
    }
    for(const f of files){
      const t=fs.readFileSync(path.join(root,f),"utf8");
      for(const b of banned) if(t.toLowerCase().includes(b)){console.log("   HIT "+b+" in "+f);bad++;}
    }
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 8. schema-frozen
g_schema() {
  "$NODE_BIN" -e '
    const fs=require("fs"),path=require("path");
    const root=process.argv[1]; let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    need("schema_parity.js 存在", fs.existsSync(path.join(root,"tests/schema_parity.js")));
    need("test_merge_reports.sh 存在", fs.existsSync(path.join(root,"tests/test_merge_reports.sh")));
    const guard=fs.readFileSync(path.join(root,"tests/guard.sh"),"utf8");
    need("guard 调用 schema_parity", guard.includes("schema_parity.js"));
    const skill=fs.readFileSync(path.join(root,"SKILL.md"),"utf8");
    for(const k of ["\"tool\"","\"mode\"","\"sources\"","\"findings\"","\"summary\""]) need("Schema 顶层键 "+k, skill.includes(k));
    process.exit(bad?1:0);
  ' "$ROOT"
}

# 9. regression-parity
g_regression() {
  bash "$SCRIPT_DIR/test_merge_reports.sh" >/dev/null 2>&1
}

# 10. manifest-registration
g_manifest() {
  "$NODE_BIN" -e '
    const fs=require("fs"); let bad=0; const need=(n,c)=>{if(!c){console.log("   MISS "+n);bad++;}};
    const f=process.argv[1];
    let t=""; try{t=fs.readFileSync(f,"utf8");}catch{need("manifest 可读",false);process.exit(1);}
    need("verify_matrix.sh 登记", t.includes("verify_matrix.sh"));
    need("crc-matrix 名称", t.includes("crc-matrix"));
    need("scope dir/code-review-combo", t.includes("dir/code-review-combo"));
    process.exit(bad?1:0);
  ' "$ROOT/../scripts/smoke/test_manifest.py"
}

run_group scene-coverage        g_scene
run_group mirror-files          g_mirrors
run_group severity-mapping      g_severity
run_group morph-applicability   g_morph
run_group fallback-routing      g_fallback
run_group residual-risks        g_residual
run_group self-contained        g_selfcontained
run_group schema-frozen         g_schema
run_group regression-parity     g_regression
if [ "${CRC_MATRIX_SKIP_MANIFEST:-0}" = "1" ]; then
  echo "[SKIP] manifest-registration (CRC_MATRIX_SKIP_MANIFEST=1；配对 meta PR 合入后须不带此变量重跑)"
else
  run_group manifest-registration g_manifest
fi

echo "=============================================="
if [ "$FAILS" -gt 0 ]; then
  echo "verify_matrix.sh: $FAILS group(s) FAILED" >&2
  exit "$FAILS"
fi
echo "verify_matrix.sh: all groups PASS (S1-S9 × B1-B14 契约矩阵)"
exit 0
