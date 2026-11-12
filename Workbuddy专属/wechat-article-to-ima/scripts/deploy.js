#!/usr/bin/env node
/**
 * 开发态 → 部署态同步【薄包装】（AGENTS.md §7.7）。
 *
 * 本文件不含任何同步实现：全部能力由仓库级唯一入口 scripts/deploy-skill.cjs 提供
 * （运行时解析 AGENTS.md §7.2 注册表 → 从 main 的 git blob 逐字节重建 → 三项判据校验）。
 * 部署态专有物 ima_credentials.json 的保留声明下沉在技能内 deploy-manifest.json。
 * 合集内共享的参数转发实现见 ../../deploy-skill-wrapper.cjs。
 *
 * 用法（须在仓库或其 worktree 内运行）：
 *   node scripts/deploy.js                     # 同步（默认来源 main）
 *   node scripts/deploy.js --dry-run           # 预演，不写盘
 *   node scripts/deploy.js --verify            # 仅三项判据校验
 *   node scripts/deploy.js --ref <引用>        # 指定内容来源
 *   node scripts/deploy.js --to <部署目录>     # 指定技能部署目录（或 skills 根）
 *   node scripts/deploy.js --json              # 格式化 JSON 输出
 *
 * 说明：默认来源由旧版 HEAD 改为 main（§7.3 部署态以 main blob 为唯一权威）；
 *       --skill-path 已废弃（映射由 §7.2 唯一登记），传了会被忽略并提示。
 */
'use strict';
require('../../deploy-skill-wrapper.cjs')('wechat-article-to-ima');
