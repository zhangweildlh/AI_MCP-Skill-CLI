/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync, writeFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';

const projectRoot = process.cwd();

const filesToRemove = [
  'node_modules/chrome-devtools-frontend/package.json',
  'node_modules/chrome-devtools-frontend/front_end/models/trace/lantern/testing',
  'node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat/package/package.json',
];

/**
 * Removes the conflicting global HTMLElementEventMap declaration from
 * @paulirish/trace_engine/models/trace/ModelImpl.d.ts to avoid TS2717 error
 * when both chrome-devtools-frontend and @paulirish/trace_engine declare
 * the same property.
 */
function removeConflictingGlobalDeclaration(): void {
  const filePath = resolve(
    projectRoot,
    'node_modules/@paulirish/trace_engine/models/trace/ModelImpl.d.ts',
  );
  console.log(
    'Removing conflicting global declaration from @paulirish/trace_engine...',
  );
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    // 上游版本漂移：该文件可能已不存在或路径变更，跳过即可（无冲突声明即无需处理）。
    console.error(
      `Skipped (@paulirish/trace_engine ModelImpl.d.ts 不存在，非致命): ${filePath}`,
    );
    return;
  }
  // Remove the declare global block using regex
  // Matches: declare global { ... interface HTMLElementEventMap { ... } ... }
  const newContent = content.replace(
    /declare global\s*\{\s*interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}\s*\}/s,
    '',
  );
  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Successfully removed conflicting global declaration.');
}

async function main() {
  console.log('Running prepare script to clean up chrome-devtools-frontend...');
  for (const file of filesToRemove) {
    const fullPath = resolve(projectRoot, file);
    console.log(`Removing: ${file}`);
    try {
      await rm(fullPath, {recursive: true, force: true});
    } catch (error) {
      console.error(`Skipped (removal failed, non-fatal): ${file}:`, error);
    }
  }
  console.log('Clean up of chrome-devtools-frontend complete.');

  removeConflictingGlobalDeclaration();
  mockAiAssistanceFiles();
}

function mockAiAssistanceFiles(): void {
  const patchAgentPath = resolve(
    projectRoot,
    'node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/agents/PatchAgent.ts',
  );
  try {
    writeFileSync(patchAgentPath, 'export class PatchAgent {}', 'utf-8');
  } catch (error) {
    console.error(`Skipped (mock PatchAgent failed, non-fatal):`, error);
  }

  const skillRegistryPath = resolve(
    projectRoot,
    'node_modules/chrome-devtools-frontend/front_end/models/ai_assistance/skills/SkillRegistry.ts',
  );
  const skillRegistryContent = `export class SkillRegistry {}
export const SKILLS: any = { styling: {}, network: {}, accessibility: {} };
`;
  try {
    writeFileSync(skillRegistryPath, skillRegistryContent, 'utf-8');
  } catch (error) {
    console.error(`Skipped (mock SkillRegistry failed, non-fatal):`, error);
  }
  console.log('Successfully mocked AI assistance files (where present).');
}

void main();
