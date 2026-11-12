import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(ROOT, 'src/main.js');
const OUT = resolve(ROOT, 'dist/th-relay-note.user.js');

const HEADER = `// ==UserScript==
// @name         B站接力收集（TH-Relay-Note）
// @namespace    th-relay-note
// @version      0.1.0
// @description  在 B 站动态/专栏/视频页记录接力棒，管理接力项目并导出 Markdown。
// @author       whitecat346
// @match        https://*.bilibili.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @connect      api.bilibili.com
// ==/UserScript==
`;

const IMPORT_RE = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?/g;
const EXPORT_RE = /(^|\n)export\s+(?=(?:const|let|var|function|async|class)\b)/g;

const cache = new Map();

function load(file) {
  if (cache.has(file)) return cache.get(file);
  const raw = readFileSync(file, 'utf8');
  const deps = [];
  let body = raw.replace(IMPORT_RE, (_, spec) => {
    deps.push(resolve(dirname(file), spec));
    return '';
  });
  body = body.replace(EXPORT_RE, '$1');
  const mod = { file, deps, body };
  cache.set(file, mod);
  return mod;
}

function order(entry) {
  const seen = new Set();
  const out = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const mod = load(file);
    mod.deps.forEach(visit);
    out.push(mod);
  };
  visit(entry);
  return out;
}

const mods = order(ENTRY);
const parts = mods.map((m) => `// ---- ${m.file.slice(ROOT.length + 1).replace(/\\/g, '/')} ----\n${m.body.trim()}\n`);
const code = `${HEADER}(function () {\n'use strict';\n\n${parts.join('\n')}})();\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, code, 'utf8');
console.log(`built ${OUT} (${mods.length} modules, ${(code.length / 1024).toFixed(1)} KB)`);
