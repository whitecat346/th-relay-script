// ==UserScript==
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
(function () {
'use strict';

// ---- src/core/model.js ----
const SCHEMA_VERSION = 1;

const PRESET_TYPES = ['插画', '视频', '文章', 'MMD'];

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function todayString(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    bars: [],
    types: PRESET_TYPES.map((name, i) => ({ id: `type-${i + 1}`, name })),
    settings: {
      boundProjectId: null,
      fillMissingBars: true,
      exportMode: 'directory',
      panelPosition: 42,
      dirName: '',
      theme: 'auto',
    },
  };
}

function migrate(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const data = {
    schemaVersion: SCHEMA_VERSION,
    projects: Array.isArray(raw.projects) ? raw.projects.filter((p) => p && p.id) : [],
    bars: Array.isArray(raw.bars) ? raw.bars.filter((b) => b && b.id) : [],
    types: Array.isArray(raw.types) && raw.types.length ? raw.types.filter((t) => t && t.id) : base.types,
    settings: { ...base.settings, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) },
  };
  if (!data.types.length) data.types = base.types;
  if (data.settings.boundProjectId && !data.projects.some((p) => p.id === data.settings.boundProjectId)) {
    data.settings.boundProjectId = null;
  }
  if (!['directory', 'download'].includes(data.settings.exportMode)) data.settings.exportMode = 'directory';
  if (!['auto', 'dark', 'light'].includes(data.settings.theme)) data.settings.theme = 'auto';
  const pos = Number(data.settings.panelPosition);
  data.settings.panelPosition = Number.isFinite(pos) ? Math.min(95, Math.max(5, pos)) : 42;
  data.settings.fillMissingBars = data.settings.fillMissingBars !== false;
  return data;
}

function projectBars(data, projectId) {
  return data.bars.filter((b) => b.projectId === projectId);
}

function sortBars(bars) {
  return bars.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'normal' ? -1 : 1;
    if (a.number !== b.number) return a.number - b.number;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function maxNumber(bars, kind) {
  return bars.reduce((m, b) => (b.kind === kind && b.number > m ? b.number : m), 0);
}

function typeName(types, id) {
  const t = (types || []).find((x) => x.id === id);
  return t ? t.name : '';
}

function barShortLabel(bar) {
  return bar.kind === 'ex' ? `EX+${bar.number}` : String(bar.number);
}

function barFullTitle(bar) {
  return bar.kind === 'ex' ? `第EX${bar.number}棒` : `第${bar.number}棒`;
}

function cnNumber(n) {
  if (n >= 1 && n <= 10) return CN_NUM[n - 1];
  return `宣${n}`;
}

function parseTime(input) {
  const s = String(input == null ? '' : input).trim().replace(/：/g, ':').replace(/\s+/g, '');
  if (!s) return { ok: false, error: '请填写接力时间' };
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) return { ok: false, error: '时间格式应为 HH:mm，例如 9:00' };
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return { ok: false, error: '分钟需在 00–59 之间' };
  if (h > 99) return { ok: false, error: '小时不得超过 99' };
  const minutes = h * 60 + min;
  if (minutes > 5999) return { ok: false, error: '时间不得超过 99:59' };
  return { ok: true, minutes, timeRaw: `${h}:${pad2(min)}` };
}

function parseTimeParts(hour, minute) {
  const hs = String(hour == null ? '' : hour).trim();
  const ms = String(minute == null ? '' : minute).trim();
  if (!hs) return { ok: false, error: '请填写接力时间' };
  if (!/^\d{1,3}$/.test(hs)) return { ok: false, error: '小时需为数字，例如 9' };
  if (ms && !/^\d{1,2}$/.test(ms)) return { ok: false, error: '分钟需为数字，例如 05' };
  const h = Number(hs);
  const min = ms ? Number(ms) : 0;
  if (min > 59) return { ok: false, error: '分钟需在 00–59 之间' };
  if (h > 99) return { ok: false, error: '小时不得超过 99' };
  const minutes = h * 60 + min;
  if (minutes > 5999) return { ok: false, error: '时间不得超过 99:59' };
  return { ok: true, minutes, timeRaw: `${h}:${pad2(min)}` };
}

function splitTime(timeRaw, minutes) {
  const src = String(timeRaw || '').trim() || formatTime(minutes);
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(src);
  if (!m) return { hourInput: '', minuteInput: '' };
  return { hourInput: String(Number(m[1])), minuteInput: pad2(Number(m[2])) };
}

function formatTime(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}

function parseBarNumber(input) {
  const s = String(input == null ? '' : input).trim().replace(/[＋]/g, '+');
  if (!s) return { ok: false, error: '请填写接力棒数' };
  const m = /^(?:ex\s*\+?\s*)?(\d+)$/i.exec(s);
  if (!m) return { ok: false, error: '棒数应形如 128 或 EX+12' };
  const number = Number(m[1]);
  if (!Number.isInteger(number) || number < 1) return { ok: false, error: '棒数必须是正整数' };
  const kind = /^ex/i.test(s) ? 'ex' : 'normal';
  return { ok: true, kind, number };
}

function validateProject(draft, projects) {
  const errors = {};
  const name = String(draft.name || '').trim();
  if (!name) errors.name = '请填写项目名称';
  else if (name.length > 40) errors.name = '项目名称不得超过 40 字';
  else if (projects.some((p) => p.id !== draft.id && p.name === name)) errors.name = '已存在同名项目';
  const hostLink = String(draft.hostLink || '').trim();
  if (hostLink && !/^https?:\/\/\S+$/i.test(hostLink)) errors.hostLink = '链接需以 http:// 或 https:// 开头';
  const eventDate = String(draft.eventDate || '').trim();
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) errors.eventDate = '日期格式应为 YYYY-MM-DD';
  return errors;
}

function validateBar(draft, bars, selfId) {
  const errors = {};
  const num = parseBarNumber(draft.numberInput);
  if (!num.ok) errors.numberInput = num.error;
  const time = parseTime(draft.timeInput);
  if (!time.ok) errors.timeInput = time.error;
  let warning = '';
  if (num.ok) {
    const dup = bars.find((b) => b.id !== selfId && b.kind === num.kind && b.number === num.number);
    if (dup) warning = `${barFullTitle({ kind: num.kind, number: num.number })}已存在`;
  }
  return { errors, warning, kind: num.ok ? num.kind : null, number: num.ok ? num.number : null, minutes: time.ok ? time.minutes : null, timeRaw: time.ok ? time.timeRaw : null };
}

function suggestBarPrefill(data, project, kind) {
  const bars = projectBars(data, project.id);
  const number = maxNumber(bars, kind) + 1;
  const now = new Date();
  const today = todayString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let minutes = nowMinutes;
  let note = '';
  if (project.eventDate) {
    if (today === project.eventDate) {
      minutes = nowMinutes;
    } else if (today === addDays(project.eventDate, 1)) {
      minutes = 1440 + nowMinutes;
    } else {
      minutes = nowMinutes;
      note = '与活动日期不一致，请手动确认';
    }
  }
  return { number, minutes, timeRaw: formatTime(minutes), note };
}

function timeFromPublish(publishedAt, project) {
  const d = new Date(Number(publishedAt));
  if (!Number.isFinite(d.getTime())) return null;
  const pubDay = todayString(d);
  const tod = d.getHours() * 60 + d.getMinutes();
  let dayOffset = 0;
  let note = '';
  if (project && project.eventDate) {
    const ev = Date.parse(`${project.eventDate}T00:00:00`);
    const pub = Date.parse(`${pubDay}T00:00:00`);
    if (Number.isFinite(ev) && Number.isFinite(pub)) {
      const diff = Math.round((pub - ev) / 86400000);
      if (diff === 0 || diff === 1) dayOffset = diff;
      else note = '作品发布时间不在活动当天，只取了时分';
    }
  }
  const minutes = dayOffset * 1440 + tod;
  return { minutes, timeRaw: formatTime(minutes), note };
}

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + days);
  return todayString(dt);
}

function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return '日一二三四五六'[new Date(y, m - 1, d).getDay()];
}

// ---- src/core/export-md.js ----
const NA = 'N/A';

function link(url, text) {
  const href = String(url || '').trim() || NA;
  return `${text} [查看](${href})`;
}

function barHeading(title, time) {
  const t = String(time || '').trim();
  return `### ${title} ${t || NA}`;
}

function barBlock(bar, types) {
  const authorName = String(bar.authorName || '').trim() || NA;
  const authorLink = String(bar.authorLink || '').trim() || NA;
  const t = (types || []).find((x) => x.id === bar.typeId);
  const typeName = t ? String(t.name || '').trim() || NA : NA;
  const workLink = String(bar.workLink || '').trim() || NA;
  return [
    barHeading(bar.kind === 'ex' ? `第EX${bar.number}棒` : `第${bar.number}棒`, bar.timeRaw || formatTime(bar.minutes)),
    '',
    `创作者 [@${authorName}](${authorLink})`,
    '',
    link(workLink, typeName),
  ];
}

function placeholderBlock(kind, number) {
  const title = kind === 'ex' ? `第EX${number}棒` : `第${number}棒`;
  return [barHeading(title, NA), '', '创作者 N/A', '', link('', NA)];
}

function sortWithin(a, b) {
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

function buildSectionBars(bars, kind, fillMissingBars, types) {
  const list = bars.filter((b) => b.kind === kind).sort(sortWithin);
  if (!list.length) return [];
  if (!fillMissingBars) return list.map((b) => barBlock(b, types));
  const blocks = [];
  const max = list.reduce((m, b) => Math.max(m, b.number), 0);
  for (let n = 1; n <= max; n += 1) {
    const same = list.filter((b) => b.number === n);
    if (!same.length) blocks.push(placeholderBlock(kind, n));
    else same.forEach((b) => blocks.push(barBlock(b, types)));
  }
  return blocks;
}

function promotionLabel(index, total) {
  if (total <= 1) return '终宣';
  if (index === total - 1) return '终宣';
  const n = index + 1;
  return n <= 10 ? `${cnNumber(n)}宣` : `宣${n}`;
}

function exportFileName(project, now = new Date()) {
  const name = String(project && project.name ? project.name : '未命名项目').trim();
  const date = String((project && project.eventDate) || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = m ? m[1] : String(now.getFullYear());
  const month = m ? m[2] : pad2(now.getMonth() + 1);
  return `${name}_${year}_${month}.md`;
}

function buildMarkdown({ project, bars = [], types = [], fillMissingBars = true }) {
  const hostName = String(project && project.hostName ? project.hostName : '').trim() || NA;
  const hostLink = String(project && project.hostLink ? project.hostLink : '').trim() || NA;
  const promotions = (project && project.promotions) || [];
  const extraNotes = (project && project.extraNotes) || [];

  const out = [];
  out.push('## 宣传');
  out.push('');
  out.push(`主催 [${hostName}](${hostLink})`);
  promotions.forEach((p, i) => {
    out.push('');
    out.push(`${promotionLabel(i, promotions.length)}：[查看](${String(p.url || '').trim() || NA})`);
  });
  extraNotes.forEach((n) => {
    out.push('');
    out.push(`${String(n.label || '').trim() || '标注'}：[查看](${String(n.url || '').trim() || NA})`);
  });

  out.push('');
  out.push('## 整点接力');

  const normalBlocks = buildSectionBars(bars, 'normal', fillMissingBars, types);
  const exBlocks = buildSectionBars(bars, 'ex', fillMissingBars, types);

  if (normalBlocks.length) {
    normalBlocks.forEach((block, i) => {
      if (i > 0) {
        out.push('');
        out.push('---');
      }
      out.push('');
      out.push(...block);
    });
  }

  out.push('');
  if (normalBlocks.length) {
    out.push('---');
    out.push('');
  }
  out.push('## EX棒');

  exBlocks.forEach((block, i) => {
    if (i > 0) {
      out.push('');
      out.push('---');
    }
    out.push('');
    out.push(...block);
  });

  return `${out.join('\n')}\n`;
}

function missingNumbers(bars, kind) {
  const nums = bars.filter((b) => b.kind === kind).map((b) => b.number);
  if (!nums.length) return [];
  const max = Math.max(...nums);
  const set = new Set(nums);
  const miss = [];
  for (let n = 1; n <= max; n += 1) if (!set.has(n)) miss.push(n);
  return miss;
}

// ---- src/core/storage.js ----
const KEY = 'relayNoteData';
const HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

function rawRead() {
  try {
    const v = HAS_GM ? GM_getValue(KEY, null) : window.localStorage.getItem(KEY);
    if (v == null) return null;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (err) {
    console.warn('[TH-Relay-Note] 读取数据失败', err);
    return null;
  }
}

function rawWrite(value) {
  const text = JSON.stringify(value);
  if (HAS_GM) GM_setValue(KEY, text);
  else window.localStorage.setItem(KEY, text);
}

function loadData() {
  const raw = rawRead();
  if (!raw || typeof raw !== 'object') return migrate(null);
  const version = Number(raw.schemaVersion) || 0;
  if (version && version !== SCHEMA_VERSION) {
    try {
      rawWrite({ __backup: true, from: version, at: Date.now(), data: raw });
    } catch (err) {
      console.warn('[TH-Relay-Note] 备份旧数据失败', err);
    }
  }
  return migrate(raw);
}

function saveData(data) {
  rawWrite(data);
}

function onExternalChange(callback) {
  if (typeof GM_addValueChangeListener !== 'function') return () => {};
  const id = GM_addValueChangeListener(KEY, (name, oldValue, newValue, remote) => {
    if (!remote) return;
    let parsed = null;
    try {
      parsed = typeof newValue === 'string' ? JSON.parse(newValue) : newValue;
    } catch {
      parsed = null;
    }
    callback(migrate(parsed));
  });
  return () => {
    if (typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(id);
  };
}

// ---- src/core/scrape.js ----
const pageWindow = () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

function currentHref() {
  return String(location.href || '');
}

function detectPage(href = currentHref()) {
  const clean = href.split('#')[0];
  let m = /\/video\/(BV[0-9A-Za-z]+)/.exec(clean);
  if (m) return { type: 'video', id: m[1], url: `https://www.bilibili.com/video/${m[1]}` };
  m = /\/read\/cv(\d+)/.exec(clean);
  if (m) return { type: 'read', id: m[1], url: `https://www.bilibili.com/read/cv${m[1]}` };
  m = /\/opus\/(\d+)/.exec(clean);
  if (m) return { type: 'opus', id: m[1], url: `https://www.bilibili.com/opus/${m[1]}` };
  m = /^https?:\/\/t\.bilibili\.com\/(\d+)/.exec(clean);
  if (m) return { type: 'opus', id: m[1], url: `https://t.bilibili.com/${m[1]}` };
  return { type: null, id: null, url: clean };
}

function space(mid) {
  return mid ? `https://space.bilibili.com/${mid}` : '';
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json && json.code && json.code !== 0) throw new Error(json.message || `code ${json.code}`);
  return json;
}

function pickOwner(owner) {
  if (!owner || typeof owner !== 'object') return null;
  const mid = owner.mid != null ? String(owner.mid) : '';
  const name = String(owner.name || owner.uname || '').trim();
  if (!mid && !name) return null;
  return { authorName: name, authorLink: space(mid) };
}

function pickPublishTime(...candidates) {
  for (const c of candidates) {
    if (c == null || c === '' || c === 0) continue;
    const n = typeof c === 'number' ? c : Number(c);
    if (!Number.isFinite(n) || n <= 0) continue;
    return n < 1e12 ? n * 1000 : n;
  }
  return null;
}

function fromStateVideo() {
  const state = pageWindow().__INITIAL_STATE__;
  const data = state && state.videoData;
  const owner = pickOwner(data && data.owner);
  if (!owner && !data) return null;
  return { ...(owner || {}), publishedAt: pickPublishTime(data && data.pubdate, data && data.ctime) };
}

function fromStateRead() {
  const state = pageWindow().__INITIAL_STATE__;
  if (!state) return null;
  const info = state.readInfo || {};
  const publishedAt = pickPublishTime(info.publish_time, info.pubtime, info.pub_time, state.readInfo && state.readInfo.articleInfo && state.readInfo.articleInfo.publish_time);
  const candidates = [
    info.author,
    state.readInfo && state.readInfo.author,
    info.authorInfo,
    info.up_info && info.up_info.author,
    state.upInfo && state.upInfo.author,
  ].filter(Boolean);
  for (const c of candidates) {
    const owner = pickOwner(c);
    if (owner) return { ...owner, publishedAt };
  }
  if (info.author_name || info.mid) {
    return { authorName: String(info.author_name || '').trim(), authorLink: space(info.mid), publishedAt };
  }
  return publishedAt ? { authorName: '', authorLink: '', publishedAt } : null;
}

function fromStateOpus() {
  const state = pageWindow().__INITIAL_STATE__;
  const detail = state && (state.detail || state.dynamic);
  if (!detail) return null;
  const modules = detail.modules || (detail.item && detail.item.modules) || [];
  const author = modules.find((m) => m && (m.module_type === 'MODULE_TYPE_AUTHOR' || m.module_author));
  const ma = author && (author.module_author || author);
  const owner = pickOwner(ma);
  const publishedAt = pickPublishTime(ma && ma.pub_ts, detail.basic && detail.basic.pub_ts, detail.item && detail.item.basic && detail.item.basic.pub_ts);
  if (!owner) return publishedAt ? { authorName: '', authorLink: '', publishedAt } : null;
  return { ...owner, publishedAt };
}

function fromDom() {
  const links = Array.from(document.querySelectorAll('a[href*="space.bilibili.com/"]'));
  for (const a of links.slice(0, 6)) {
    const m = /space\.bilibili\.com\/(\d+)/.exec(a.getAttribute('href') || '');
    if (!m) continue;
    const name = String(a.textContent || '').trim();
    if (!name) continue;
    return { authorName: name, authorLink: space(m[1]) };
  }
  return null;
}

async function scrapeCurrentPage() {
  const page = detectPage();
  const result = {
    pageType: page.type,
    workLink: page.type ? page.url : '',
    authorName: '',
    authorLink: '',
    publishedAt: null,
    source: '',
  };
  if (!page.type) return result;

  const fromState = page.type === 'video' ? fromStateVideo : page.type === 'read' ? fromStateRead : fromStateOpus;
  try {
    const owner = fromState();
    if (owner && (owner.authorName || owner.authorLink || owner.publishedAt)) {
      return { ...result, ...owner, source: 'state' };
    }
  } catch {}

  try {
    let owner = null;
    if (page.type === 'video') {
      const json = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${page.id}`);
      const d = (json.data || {});
      owner = { ...(pickOwner(d.owner) || {}), publishedAt: pickPublishTime(d.pubdate) };
    } else if (page.type === 'read') {
      const json = await fetchJson(`https://api.bilibili.com/x/article/viewinfo?id=cv${page.id}`);
      const d = json.data || {};
      owner = { authorName: String(d.author_name || d.name || '').trim(), authorLink: space(d.mid), publishedAt: pickPublishTime(d.publish_time, d.ctime) };
    } else {
      const json = await fetchJson(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=${page.id}`);
      const item = (json.data && json.data.item) || {};
      const author = (item.modules || []).find((m) => m && m.module_type === 'MODULE_TYPE_AUTHOR');
      const ma = author && (author.module_author || author);
      owner = { ...(pickOwner(ma) || {}), publishedAt: pickPublishTime(ma && ma.pub_ts) };
    }
    if (owner && (owner.authorName || owner.authorLink || owner.publishedAt)) {
      return { ...result, ...owner, source: 'api' };
    }
  } catch {}

  try {
    const owner = fromDom();
    if (owner) return { ...result, ...owner, source: 'dom' };
  } catch {}

  return result;
}

// ---- src/core/export-file.js ----
const DB_NAME = 'th-relay-note';
const STORE = 'handles';
const HANDLE_KEY = 'relayDirHandle';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve(req && req.result);
      }),
  );
}

const idbGetHandle = () => idb('readonly', (store) => store.get(HANDLE_KEY));
const idbSetHandle = (handle) => idb('readwrite', (store) => store.put(handle, HANDLE_KEY));
const idbClearHandle = () => idb('readwrite', (store) => store.delete(HANDLE_KEY));

function supportsDirectory() {
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  return typeof w.showDirectoryPicker === 'function';
}

async function pickDirectory() {
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (typeof w.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持目录访问');
  const handle = await w.showDirectoryPicker({ id: 'th-relay-note', mode: 'readwrite' });
  await idbSetHandle(handle);
  return handle;
}

async function ensurePermission(dir) {
  const opts = { mode: 'readwrite' };
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return (await dir.requestPermission(opts)) === 'granted';
}

async function hasFile(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function readText(dir, name) {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return file.text();
}

async function writeText(dir, name, text) {
  const handle = await dir.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  await stream.write(text);
  await stream.close();
}

async function saveToDirectory(dir, filename, text) {
  if (!dir) throw new Error('尚未选择导出目录');
  if (!(await ensurePermission(dir))) throw new Error('未获得目录写入权限');
  if (await hasFile(dir, filename)) {
    const previous = await readText(dir, filename);
    let index = 1;
    let backupName = `${filename}.${index}`;
    while (await hasFile(dir, backupName)) {
      index += 1;
      backupName = `${filename}.${index}`;
    }
    await writeText(dir, backupName, previous);
  }
  await writeText(dir, filename, text);
  return filename;
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

// ---- src/ui/styles.js ----
const CSS = `
:host { all: initial; }
.trn-root {
  --trn-primary: #6b5bdb;
  --trn-primary-strong: #5b4bd0;
  --trn-primary-weak: #efecff;
  --trn-primary-text: #5b4fc0;
  --trn-bg: #ffffff;
  --trn-bg-soft: #fafafd;
  --trn-bg-input: #fbfbfd;
  --trn-text: #1e2130;
  --trn-text-2: #4b5062;
  --trn-sub: #8b8f9c;
  --trn-placeholder: #b9bdc9;
  --trn-border: #e8e9f0;
  --trn-border-strong: #dcdee8;
  --trn-danger: #e5484d;
  --trn-danger-weak: #fdeceb;
  --trn-shadow: 0 18px 50px rgba(28, 30, 45, 0.16), 0 2px 8px rgba(28, 30, 45, 0.06);
  --trn-radius: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  color: var(--trn-text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.trn-root.trn-dark {
  --trn-primary: #8b7cf0;
  --trn-primary-strong: #7a6ae8;
  --trn-primary-weak: #2b2745;
  --trn-primary-text: #b3a8f5;
  --trn-bg: #212227;
  --trn-bg-soft: #26272d;
  --trn-bg-input: #2a2b32;
  --trn-text: #e9eaf0;
  --trn-text-2: #c3c6d2;
  --trn-sub: #8d92a1;
  --trn-placeholder: #6b6f7d;
  --trn-border: #33353d;
  --trn-border-strong: #4c4f5b;
  --trn-danger: #f06266;
  --trn-danger-weak: #3a2628;
  --trn-shadow: 0 18px 50px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
}
.trn-root *, .trn-root *::before, .trn-root *::after { box-sizing: border-box; }
.trn-root { pointer-events: none; }
.trn-tab, .trn-panel, .trn-card, .trn-big, .trn-backdrop, .trn-toast { pointer-events: auto; }
.trn-root :where(button) { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.trn-root input, .trn-root select, .trn-root textarea { font: inherit; color: inherit; }
.trn-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.trn-root ::-webkit-scrollbar-thumb { background: var(--trn-border-strong); border-radius: 8px; }
.trn-root ::-webkit-scrollbar-track { background: transparent; }

.trn-tab {
  position: fixed; right: 14px; top: 42%; z-index: 2147483000;
  writing-mode: vertical-rl; letter-spacing: 3px;
  padding: 14px 8px; border-radius: 10px;
  background: linear-gradient(160deg, #7f6ff0, #6250d4);
  color: #fff; font-size: 13px; font-weight: 600;
  box-shadow: 0 4px 14px rgba(107, 91, 219, 0.35);
  user-select: none; touch-action: none;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.trn-tab:hover { background: linear-gradient(160deg, #8b7af5, #6b58e0); transform: translateX(-3px); }

.trn-backdrop { position: fixed; inset: 0; z-index: 2147483000; background: rgba(20, 21, 31, 0.28); }
.trn-backdrop.clear { background: transparent; }

.trn-panel {
  position: fixed; right: 56px; z-index: 2147483001;
  width: 338px; max-height: 84vh; overflow: auto;
  background: var(--trn-bg); border-radius: 18px; box-shadow: var(--trn-shadow);
  padding: 20px 20px 4px;
  transform: translate(var(--trn-panel-x, 0px), var(--trn-panel-y, 0px));
}
.trn-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-drag] { cursor: grab; touch-action: none; }
.trn-dragging [data-drag] { cursor: grabbing; }
.trn-dragging .trn-root, .trn-dragging { user-select: none; }
.trn-panel-tools { display: flex; align-items: center; gap: 4px; }
.trn-icon-btn { width: 26px; height: 26px; border-radius: 50%; color: var(--trn-sub); font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.trn-icon-btn:hover { background: var(--trn-bg-soft); color: var(--trn-text); }
.trn-title { font-size: 19px; font-weight: 700; letter-spacing: 0.2px; }
.trn-sub { color: var(--trn-sub); font-size: 12px; margin-top: 4px; }
.trn-x { width: 26px; height: 26px; border-radius: 50%; color: var(--trn-sub); font-size: 15px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.trn-x:hover { background: var(--trn-bg-soft); color: var(--trn-text); }

.trn-bind { margin-top: 14px; padding: 12px 14px 10px; border-radius: 12px; background: var(--trn-primary-weak); }
.trn-bind-label { font-size: 11px; color: var(--trn-primary-text); font-weight: 600; }
.trn-bind-name { font-size: 15px; font-weight: 700; margin-top: 6px; }
.trn-bind-hint { font-size: 10px; color: var(--trn-sub); margin-top: 6px; }
.trn-bind-link { display: inline-block; font-size: 11px; color: var(--trn-primary-text); margin-top: 6px; }
.trn-bind-link:hover { text-decoration: underline; }
.trn-bind-empty { margin-top: 14px; padding: 12px 14px; border-radius: 12px; border: 1px dashed var(--trn-border-strong); color: var(--trn-sub); font-size: 12px; }

.trn-entry { display: block; width: 100%; text-align: left; padding: 13px 2px; border-radius: 10px; }
.trn-entry:hover { background: var(--trn-bg-soft); }
.trn-entry-title { font-size: 13px; font-weight: 600; }
.trn-entry-sub { font-size: 11px; color: var(--trn-sub); margin-top: 3px; }
.trn-panel-foot { margin: 10px -20px 0; padding: 10px 20px; border-top: 1px solid var(--trn-border); color: var(--trn-placeholder); font-size: 11px; }

.trn-card {
  position: fixed; left: 50%; top: 50%;
  transform: translate(-50%, -50%) translate(var(--trn-modal-x, 0px), var(--trn-modal-y, 0px));
  z-index: 2147483002; display: flex; flex-direction: column;
  background: var(--trn-bg); border-radius: 18px; box-shadow: var(--trn-shadow);
  max-height: 88vh; max-width: 94vw;
}
.trn-card-head { padding: 20px 22px 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex: 0 0 auto; }
.trn-badge { display: inline-block; font-size: 10px; font-weight: 600; color: var(--trn-primary-text); background: var(--trn-primary-weak); padding: 2px 7px; border-radius: 5px; margin-bottom: 6px; }
.trn-card-body { padding: 14px 22px 4px; overflow: auto; flex: 1 1 auto; }
.trn-card-foot { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 22px; border-top: 1px solid var(--trn-border); }
.trn-foot-note { color: var(--trn-sub); font-size: 11px; }

.trn-field { margin-top: 14px; }
.trn-field.first { margin-top: 0; }
.trn-row { display: flex; gap: 14px; }
.trn-row > .trn-field { flex: 1 1 0; min-width: 0; }
.trn-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--trn-text-2); margin-bottom: 7px; }
.trn-label em { font-style: normal; font-weight: 500; color: var(--trn-sub); font-size: 11px; }
.trn-input, .trn-select, .trn-textarea {
  width: 100%; height: 38px; padding: 0 12px; border-radius: 9px;
  border: 1px solid var(--trn-border); background: var(--trn-bg-input); color: var(--trn-text);
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.trn-textarea { height: auto; padding: 9px 12px; resize: vertical; min-height: 62px; }
.trn-input::placeholder, .trn-textarea::placeholder { color: var(--trn-placeholder); }
.trn-input:focus, .trn-select:focus, .trn-textarea:focus { border-color: var(--trn-primary); box-shadow: 0 0 0 3px var(--trn-primary-weak); }
.trn-input.has-error { border-color: var(--trn-danger); }
.trn-select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--trn-sub) 50%), linear-gradient(135deg, var(--trn-sub) 50%, transparent 50%); background-position: calc(100% - 16px) 16px, calc(100% - 11px) 16px; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; padding-right: 30px; }
.trn-hint { color: var(--trn-sub); font-size: 11px; margin-top: 6px; }
.trn-time { display: flex; align-items: center; gap: 8px; }
.trn-time .trn-input { width: 74px; text-align: center; padding: 0 8px; }
.trn-time .trn-time-sep { color: var(--trn-sub); font-weight: 700; margin: 0 -2px; }
.trn-time .trn-btn { height: 38px; padding: 0 12px; }
.trn-root input[type="date"] { padding-right: 8px; }
.trn-root input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.55; cursor: pointer; }
.trn-root input[type="date"]::-webkit-calendar-picker-indicator:hover { opacity: 0.9; }
.trn-root.trn-dark input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.75); }
.trn-err { color: var(--trn-danger); font-size: 11px; margin-top: 6px; }

.trn-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 16px; border-radius: 9px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--trn-border-strong); background: var(--trn-bg); color: var(--trn-text-2); white-space: nowrap; }
.trn-btn:hover { background: var(--trn-bg-soft); }
.trn-btn.primary { background: var(--trn-primary); border-color: var(--trn-primary); color: #fff; }
.trn-btn.primary:hover { background: var(--trn-primary-strong); }
.trn-btn.danger { background: var(--trn-danger); border-color: var(--trn-danger); color: #fff; }
.trn-btn.danger:hover { filter: brightness(0.94); }
.trn-btn.ghost { border-color: transparent; }
.trn-btn.sm { height: 30px; padding: 0 11px; font-size: 12px; }
.trn-btn.link { height: auto; padding: 0; border: 0; background: none; color: var(--trn-primary-text); font-weight: 600; }
.trn-btn.link:hover { text-decoration: underline; }
.trn-btn.link.danger { color: var(--trn-danger); background: none; }
.trn-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.trn-info { border-radius: 10px; background: var(--trn-primary-weak); padding: 11px 13px; color: var(--trn-primary-text); font-size: 12px; }
.trn-info strong { display: block; font-weight: 700; margin-bottom: 4px; }
.trn-info .trn-info-sub { color: var(--trn-sub); font-size: 11px; margin-top: 4px; }
.trn-danger-box { border-radius: 10px; background: var(--trn-danger-weak); padding: 11px 13px; color: var(--trn-danger); font-size: 12px; }
.trn-danger-box .trn-danger-name { font-weight: 700; margin-bottom: 4px; }
.trn-danger-box .trn-danger-sub { color: var(--trn-text-2); font-size: 11px; }

.trn-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.trn-chip { height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--trn-border-strong); background: var(--trn-bg-input); font-size: 12px; color: var(--trn-text-2); transition: border-color 0.14s, background 0.14s; }
.trn-chip:hover { border-color: var(--trn-primary); color: var(--trn-primary-text); }
.trn-chip.is-on { border-color: var(--trn-primary); background: var(--trn-primary-weak); color: var(--trn-primary-text); font-weight: 600; }
.trn-chip.add { border-style: dashed; color: var(--trn-sub); padding: 0 11px; }
.trn-chev { display: inline-block; vertical-align: -2px; margin-left: 3px; color: var(--trn-sub); }
.trn-chev.down { transform: rotate(90deg); }
.trn-bind-link .trn-chev, .trn-entry-title .trn-chev { color: currentColor; opacity: 0.72; }

.trn-inline-add { display: flex; gap: 8px; margin-top: 8px; }

.trn-big {
  position: fixed; left: 50%; top: 50%;
  transform: translate(-50%, -50%) translate(var(--trn-big-x, 0px), var(--trn-big-y, 0px));
  z-index: 2147483002; display: flex; flex-direction: column;
  width: min(1160px, 94vw); height: min(820px, 90vh);
  background: var(--trn-bg); border-radius: 18px; box-shadow: var(--trn-shadow); overflow: hidden;
}
.trn-big-head { padding: 18px 24px 0; flex: 0 0 auto; }
.trn-big-head-row { display: flex; align-items: flex-start; justify-content: space-between; }
.trn-tabs { display: flex; align-items: center; gap: 18px; margin-top: 6px; font-size: 12px; }
.trn-tabbtn { color: var(--trn-sub); padding: 4px 0; }
.trn-tabbtn.is-on { color: var(--trn-primary-text); font-weight: 700; }
.trn-tabbtn:hover { color: var(--trn-primary-text); }

.trn-manage { display: flex; flex: 1 1 auto; min-height: 0; }
.trn-side { width: 230px; flex: 0 0 auto; border-right: 1px solid var(--trn-border); padding: 16px 16px 20px; overflow: auto; }
.trn-side-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.trn-side-title { font-size: 12px; font-weight: 700; color: var(--trn-text-2); }
.trn-count { font-size: 11px; color: var(--trn-sub); }
.trn-side-item { display: block; width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; margin-bottom: 6px; cursor: pointer; }
.trn-side-item:hover { background: var(--trn-bg-soft); }
.trn-side-item.is-on { background: var(--trn-primary-weak); }
.trn-side-item:focus-visible { outline: 2px solid var(--trn-primary); outline-offset: 1px; }
.trn-side-name { font-size: 12.5px; font-weight: 600; }
.trn-side-item.is-on .trn-side-name { color: var(--trn-primary-text); }
.trn-side-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; }
.trn-side-meta { font-size: 10.5px; color: var(--trn-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trn-side-bind {
  flex: 0 0 auto; height: 21px; padding: 0 8px; border-radius: 6px; font-size: 10.5px; font-weight: 600;
  color: var(--trn-primary-text); background: var(--trn-bg); border: 1px solid var(--trn-primary);
  opacity: 0; transition: opacity 0.14s ease;
}
.trn-side-bind:hover { background: var(--trn-primary); color: #fff; }
.trn-side-item:hover .trn-side-bind, .trn-side-item:focus-within .trn-side-bind { opacity: 1; }
.trn-side-badge { display: inline-block; margin-top: 6px; font-size: 10px; color: var(--trn-primary-text); background: rgba(107, 91, 219, 0.14); border-radius: 5px; padding: 1px 6px; }
.trn-add-project { width: 100%; height: 34px; border-radius: 9px; border: 1px dashed var(--trn-border-strong); color: var(--trn-sub); font-size: 12px; }
.trn-add-project:hover { border-color: var(--trn-primary); color: var(--trn-primary-text); }

.trn-main { flex: 1 1 auto; min-width: 0; padding: 16px 22px 0; display: flex; flex-direction: column; overflow: hidden; }
.trn-main-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.trn-main-title { font-size: 20px; font-weight: 700; }
.trn-main-meta { font-size: 11.5px; color: var(--trn-sub); margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.trn-main-meta a { color: var(--trn-sub); }
.trn-main-meta a:hover { color: var(--trn-primary-text); }
.trn-actions { display: flex; align-items: center; gap: 14px; margin-top: 8px; font-size: 12px; }

.trn-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
.trn-stat { background: var(--trn-bg-soft); border-radius: 12px; padding: 12px 14px; display: flex; align-items: baseline; gap: 8px; }
.trn-stat b { font-size: 21px; font-weight: 700; }
.trn-stat span { font-size: 11.5px; color: var(--trn-sub); }

.trn-toolbar { display: flex; gap: 10px; margin-top: 14px; }
.trn-toolbar .trn-input { flex: 1 1 auto; }
.trn-filters { display: flex; align-items: center; gap: 16px; margin-top: 14px; font-size: 12px; color: var(--trn-sub); border-bottom: 1px solid var(--trn-border); padding-bottom: 8px; }
.trn-filters button { color: var(--trn-sub); font-size: 12px; }
.trn-filters button.is-on { color: var(--trn-primary-text); font-weight: 700; }

.trn-table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; margin-top: 4px; }
.trn-table { width: 100%; border-collapse: collapse; }
.trn-table th { position: sticky; top: 0; background: var(--trn-bg); text-align: left; font-size: 11px; font-weight: 600; color: var(--trn-sub); padding: 9px 10px; border-bottom: 1px solid var(--trn-border); }
.trn-table td { padding: 11px 10px; font-size: 12px; border-bottom: 1px solid var(--trn-border); }
.trn-table tr:hover td { background: var(--trn-bg-soft); }
.trn-table td.ops { white-space: nowrap; }
.trn-table td.ops button { margin-right: 12px; }
.trn-num { font-variant-numeric: tabular-nums; }
.trn-pager { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 10px 0 12px; color: var(--trn-sub); font-size: 11px; }
.trn-pager-controls { display: flex; align-items: center; gap: 8px; }
.trn-empty { padding: 40px 0; text-align: center; color: var(--trn-sub); font-size: 12px; }

.trn-toggle { display: block; text-align: left; border: 1px solid var(--trn-border); border-radius: 11px; padding: 12px 14px; background: var(--trn-bg); }
.trn-toggle + .trn-toggle { margin-top: 10px; }
.trn-toggle.is-on { border-color: var(--trn-primary); background: var(--trn-primary-weak); }
.trn-toggle-title { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; }
.trn-dot { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--trn-border-strong); flex: 0 0 auto; }
.trn-toggle.is-on .trn-dot { border-color: var(--trn-primary); box-shadow: inset 0 0 0 3px var(--trn-bg), inset 0 0 0 8px var(--trn-primary); }
.trn-toggle-sub { font-size: 11px; color: var(--trn-sub); margin-top: 5px; padding-left: 21px; }
.trn-toggle-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.trn-toggle-pair .trn-toggle + .trn-toggle { margin-top: 0; }

.trn-dir { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--trn-border); border-radius: 11px; padding: 11px 14px; margin-top: 12px; }
.trn-dir-name { font-size: 12px; font-weight: 600; }
.trn-dir-sub { font-size: 11px; color: var(--trn-sub); margin-top: 3px; }

.trn-settings { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 18px 24px 0; }
.trn-section-title { font-size: 15px; font-weight: 700; margin-top: 14px; }
.trn-section-sub { font-size: 11.5px; color: var(--trn-sub); margin-top: 5px; }
.trn-list { border: 1px solid var(--trn-border); border-radius: 11px; margin-top: 10px; overflow: hidden; }
.trn-list-head, .trn-list-row { display: flex; align-items: center; gap: 12px; padding: 9px 14px; font-size: 12px; }
.trn-list-head { color: var(--trn-sub); font-size: 11px; border-bottom: 1px solid var(--trn-border); }
.trn-list-row + .trn-list-row { border-top: 1px solid var(--trn-border); }
.trn-col-name { flex: 1 1 auto; min-width: 0; }
.trn-col-use { width: 120px; flex: 0 0 auto; color: var(--trn-sub); font-size: 11px; }
.trn-col-ops { width: 110px; flex: 0 0 auto; text-align: right; }
.trn-col-ops button { margin-left: 12px; }

.trn-sort-list { border: 1px solid var(--trn-border); border-radius: 11px; margin-top: 10px; overflow: hidden; }
.trn-sort-row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; font-size: 12.5px; background: var(--trn-bg); }
.trn-sort-row + .trn-sort-row { border-top: 1px solid var(--trn-border); }
.trn-sort-row.dragging { opacity: 0.45; }
.trn-sort-row.drop-target { box-shadow: inset 0 2px 0 var(--trn-primary); }
.trn-grip { color: var(--trn-placeholder); cursor: grab; letter-spacing: 1px; }
.trn-sort-name { flex: 1 1 auto; }
.trn-sort-tag { font-size: 10.5px; color: var(--trn-sub); }
.trn-sort-num { font-size: 11px; color: var(--trn-sub); font-variant-numeric: tabular-nums; }
.trn-sort-num b { color: var(--trn-primary-text); }
.trn-move { width: 22px; height: 22px; border-radius: 6px; color: var(--trn-sub); font-size: 11px; }
.trn-move:hover { background: var(--trn-primary-weak); color: var(--trn-primary-text); }

.trn-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 2147483003; background: #2b2d38; color: #fff; font-size: 12px; padding: 9px 16px; border-radius: 9px; box-shadow: var(--trn-shadow); max-width: 70vw; }
.trn-toast.is-error { background: var(--trn-danger); }

.trn-note-list { margin-top: 10px; }
.trn-note-row { display: flex; gap: 8px; margin-top: 8px; }
.trn-note-row .trn-input { flex: 1 1 0; }
.trn-note-row .trn-input.label { flex: 0 0 96px; }
.trn-note-row .trn-x { width: 30px; height: 30px; align-self: center; border: 1px solid var(--trn-border); }
`;

// ---- src/ui/dom.js ----
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function field({ label, name, value = '', placeholder = '', hint = '', error = '', half = false, type = 'text', textarea = false, extraClass = '', note = '', disabled = false }) {
  const input = textarea
    ? `<textarea class="trn-textarea" name="${esc(name)}" placeholder="${esc(placeholder)}"${disabled ? ' disabled' : ''}>${esc(value)}</textarea>`
    : `<input class="trn-input${error ? ' has-error' : ''} ${esc(extraClass)}" type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${disabled ? ' disabled' : ''} autocomplete="off" />`;
  return `<div class="trn-field${half ? '' : ''}">
    ${label ? `<div class="trn-label">${esc(label)}${note ? `<em>${esc(note)}</em>` : ''}</div>` : ''}
    ${input}
    ${error ? `<div class="trn-err">${esc(error)}</div>` : ''}
    ${hint && !error ? `<div class="trn-hint">${esc(hint)}</div>` : ''}
  </div>`;
}

function modalShell({ title, badge = '', subtitle = '', width = 560, body = '', footer = '', footNote = '', scroll = false }) {
  return `<div class="trn-backdrop" data-act="close-modal"></div>
  <div class="trn-card" style="width:${width}px">
    <div class="trn-card-head" data-drag="modal">
      <div>
        ${badge ? `<div class="trn-badge">${esc(badge)}</div>` : ''}
        <div class="trn-title">${esc(title)}</div>
        ${subtitle ? `<div class="trn-sub">${esc(subtitle)}</div>` : ''}
      </div>
      <button class="trn-x" data-act="close-modal" title="关闭">✕</button>
    </div>
    <div class="trn-card-body" style="${scroll ? 'max-height:58vh' : ''}">${body}</div>
    <div class="trn-card-foot">
      <span class="trn-foot-note">${esc(footNote)}</span>
      <div style="display:flex;gap:10px">${footer}</div>
    </div>
  </div>`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// ---- src/ui/app.js ----
const state = {
  data: null,
  view: 'closed',
  bigTab: 'projects',
  modal: null,
  manage: { projectId: null, search: '', filter: 'all', page: 1 },
  toast: null,
  pinned: false,
  offsets: { big: { x: 0, y: 0 }, modal: { x: 0, y: 0 }, panel: { x: 0, y: 0 } },
  newTypeValue: '',
  focusKey: null,
  dragId: null,
};

let root = null;
let onSave = () => {};

function projectOf(id) {
  return state.data.projects.find((p) => p.id === id) || null;
}

function boundProject() {
  return projectOf(state.data.settings.boundProjectId);
}

function activeProject() {
  const picked = state.manage.projectId ? projectOf(state.manage.projectId) : null;
  return picked || boundProject() || state.data.projects[0] || null;
}

function persist() {
  saveData(state.data);
  onSave(state.data);
}

function toast(text, isError) {
  state.toast = { text, isError: !!isError };
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, 2800);
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function openModal(modal) {
  if (state.offsets.modal.x || state.offsets.modal.y) state.offsets.modal = { x: 0, y: 0 };
  state.modal = modal;
  render();
}

function barCount(projectId) {
  return projectBars(state.data, projectId).length;
}

function displayOrder(bars) {
  const sorted = sortBars(bars);
  const project = bars.length ? projectOf(bars[0].projectId) : null;
  if (project && project.sortMode === 'keep' && Array.isArray(project.barOrder)) {
    const index = new Map(project.barOrder.map((id, i) => [id, i]));
    return sorted.sort((a, b) => (index.has(a.id) ? index.get(a.id) : 1e6) - (index.has(b.id) ? index.get(b.id) : 1e6));
  }
  return sorted;
}

function mount(host, options = {}) {
  onSave = options.onSave || (() => {});
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);
  root = document.createElement('div');
  root.className = 'trn-root';
  shadow.appendChild(root);

  state.data = loadData();
  onExternalChange((data) => {
    state.data = data;
    render();
  });
  idbGetHandle()
    .then((handle) => {
      if (!handle) return;
      state.data.settings.dirName = handle.name || '';
      render();
    })
    .catch(() => {});

  bindEvents();
  render();
}

function themeIsDark() {
  const theme = state.data.settings.theme || 'auto';
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return document.documentElement.classList.contains('bili_dark');
}

function render() {
  if (!root) return;
  const pos = Number(state.data.settings.panelPosition) || 42;
  root.className = `trn-root${themeIsDark() ? ' trn-dark' : ''}`;
  root.style.setProperty('--trn-big-x', `${state.offsets.big.x}px`);
  root.style.setProperty('--trn-big-y', `${state.offsets.big.y}px`);
  root.style.setProperty('--trn-modal-x', `${state.offsets.modal.x}px`);
  root.style.setProperty('--trn-modal-y', `${state.offsets.modal.y}px`);
  root.style.setProperty('--trn-panel-x', `${state.offsets.panel.x}px`);
  root.style.setProperty('--trn-panel-y', `${state.offsets.panel.y}px`);
  const parts = [`<button class="trn-tab" style="top:${pos}%">接力收集</button>`];
  if (state.view === 'panel') parts.push(renderPanel(pos));
  if (state.view === 'big') parts.push(renderBig());
  if (state.modal) parts.push(renderModal());
  if (state.toast) parts.push(`<div class="trn-toast${state.toast.isError ? ' is-error' : ''}">${esc(state.toast.text)}</div>`);
  root.innerHTML = parts.join('');
  restoreFocus();
}

function restoreFocus() {
  const key = state.focusKey;
  if (!key) return;
  state.focusKey = null;
  const el = root.querySelector(`[data-role="${key}"]`);
  if (!el) return;
  el.focus();
  if (typeof el.setSelectionRange === 'function') {
    const n = el.value.length;
    try {
      el.setSelectionRange(n, n);
    } catch {}
  }
}

const chev = (dir = '') =>
  `<svg class="trn-chev${dir ? ` ${dir}` : ''}" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4.4 2.6 7.8 6l-3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderPanel(pos) {
  const bound = boundProject();
  const bindCard = bound
    ? `<div class="trn-bind">
        <div class="trn-bind-label">当前绑定</div>
        <div class="trn-bind-name">${esc(bound.name)}</div>
        <div class="trn-bind-hint">后续棒记录默认添加到此项目</div>
        <button class="trn-bind-link" data-act="bind-picker">更换绑定项目 ${chev()}</button>
      </div>`
    : '<div class="trn-bind-empty">尚未绑定项目，创建一个或在项目管理中选择。</div>';
  return `<div class="trn-panel" style="${pos > 55 ? 'bottom:70px' : 'top:96px'}">
    <div class="trn-panel-head" data-drag="panel">
      <div>
        <div class="trn-title">接力收集</div>
        <div class="trn-sub">在 BiliBili，接住每一份创作。</div>
      </div>
      <div class="trn-panel-tools">
        <button class="trn-icon-btn" data-act="toggle-theme" title="${themeIsDark() ? '切换为浅色' : '切换为夜间模式'}">${themeIsDark() ? '☀' : '☾'}</button>
        <button class="trn-x" data-act="close-panel" title="关闭">✕</button>
      </div>
    </div>
    ${bindCard}
    <button class="trn-entry" data-act="bar-new">
      <div class="trn-entry-title">＋ 记录接力棒</div>
      <div class="trn-entry-sub">自动获取当前页面的作者与作品</div>
    </button>
    <button class="trn-entry" data-act="project-new">
      <div class="trn-entry-title">＋ 创建接力项目</div>
      <div class="trn-entry-sub">填写项目名称、主催与活动日期</div>
    </button>
    <button class="trn-entry" data-act="open-big">
      <div class="trn-entry-title">项目管理 ${chev()}</div>
      <div class="trn-entry-sub">整理、编辑和导出项目</div>
    </button>
    <button class="trn-entry" data-act="open-settings">
      <div class="trn-entry-title">设置 ${chev()}</div>
      <div class="trn-entry-sub">管理作品类型与导出路径</div>
    </button>
    <div class="trn-panel-foot">支持动态 / 专栏 / 视频页面</div>
  </div>`;
}

function renderBig() {
  const settings = state.bigTab === 'settings';
  const head = `<div class="trn-big-head" data-drag="big">
    <div class="trn-big-head-row">
      <div>
        <div class="trn-title">${settings ? '设置' : '项目管理'}</div>
        ${settings ? '<div class="trn-sub">让每次收集，都按你的习惯进行。</div>' : ''}
        <div class="trn-tabs">
          <button class="trn-tabbtn${settings ? '' : ' is-on'}" data-act="big-tab" data-id="projects">项目管理</button>
          <button class="trn-tabbtn${settings ? ' is-on' : ''}" data-act="big-tab" data-id="settings">设置</button>
          <button class="trn-tabbtn" data-act="back-panel">返回侧边菜单</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="trn-sub">接力收集</span>
        <button class="trn-x" data-act="close-big" title="关闭">✕</button>
      </div>
    </div>
  </div>`;
  const body = settings ? renderSettingsBody() : renderManageBody();
  const foot = settings
    ? `<div class="trn-card-foot"><span class="trn-foot-note"></span><div style="display:flex;gap:10px">
        <button class="trn-btn" data-act="close-big">取消</button>
        <button class="trn-btn primary" data-act="save-settings">保存设置</button>
      </div></div>`
    : '';
  return `<div class="trn-big">${head}${body}${foot}</div>`;
}

function renderManageBody() {
  const projects = state.data.projects;
  const active = activeProject();
  const sideItems = projects
    .map((p) => {
      const isBound = p.id === state.data.settings.boundProjectId;
      return `<div class="trn-side-item${active && p.id === active.id ? ' is-on' : ''}" role="button" tabindex="0" data-act="switch-project" data-id="${esc(p.id)}">
        <div class="trn-side-name">${esc(p.name)}</div>
        <div class="trn-side-row">
          <span class="trn-side-meta">${barCount(p.id)} 棒${p.eventDate ? ` · ${esc(p.eventDate)}` : ''}</span>
          ${isBound ? '' : `<button class="trn-side-bind" data-act="bind-here" data-id="${esc(p.id)}">绑定项目</button>`}
        </div>
        ${isBound ? '<span class="trn-side-badge">当前绑定</span>' : ''}
      </div>`;
    })
    .join('');
  const side = `<div class="trn-side">
    <div class="trn-side-head"><span class="trn-side-title">我的项目</span><span class="trn-count">${projects.length}</span></div>
    <button class="trn-add-project" data-act="project-new">＋ 添加项目</button>
    <div style="margin-top:10px">${sideItems || '<div class="trn-empty">还没有项目</div>'}</div>
  </div>`;
  return `<div class="trn-manage">${side}<div class="trn-main">${active ? renderProjectDetail(active) : renderNoProject()}</div></div>`;
}

function renderNoProject() {
  return `<div class="trn-empty" style="margin:auto">
    <div style="margin-bottom:12px">还没有接力项目</div>
    <button class="trn-btn primary" data-act="project-new">＋ 创建第一个项目</button>
  </div>`;
}

function renderProjectDetail(project) {
  const all = displayOrder(projectBars(state.data, project.id));
  const normal = all.filter((b) => b.kind === 'normal');
  const ex = all.filter((b) => b.kind === 'ex');
  const keyword = state.manage.search.trim().toLowerCase();
  const rows = all.filter((b) => {
    if (state.manage.filter === 'normal' && b.kind !== 'normal') return false;
    if (state.manage.filter === 'ex' && b.kind !== 'ex') return false;
    if (!keyword) return true;
    return (
      String(b.authorName || '').toLowerCase().includes(keyword) ||
      String(b.number).includes(keyword) ||
      barShortLabel(b).toLowerCase().includes(keyword)
    );
  });
  const isBound = project.id === state.data.settings.boundProjectId;
  const trs = rows
    .map(
      (b) => `<tr>
      <td class="trn-num">${esc(barShortLabel(b))}</td>
      <td>${esc(b.authorName || '—')}</td>
      <td>${esc(typeName(state.data.types, b.typeId) || '—')}</td>
      <td class="trn-num">${esc(b.eventDate ? b.eventDate.slice(5) : '')} ${esc(b.timeRaw || formatTime(b.minutes))}</td>
      <td>${b.workLink ? `<a href="${esc(b.workLink)}" target="_blank" rel="noreferrer" style="color:var(--trn-primary-text)">查看 ↗</a>` : '—'}</td>
      <td class="ops">
        <button class="trn-btn link" data-act="bar-edit" data-id="${esc(b.id)}">编辑</button>
        <button class="trn-btn link danger" data-act="bar-delete" data-id="${esc(b.id)}">删除</button>
      </td>
    </tr>`,
    )
    .join('');

  return `<div class="trn-main-head">
      <div style="min-width:0">
        <div class="trn-main-title">${esc(project.name)}</div>
        <div class="trn-main-meta">
          <span>主催：${esc(project.hostName || 'N/A')}</span>
          ${project.hostLink ? `<a href="${esc(project.hostLink)}" target="_blank" rel="noreferrer">查看主页 ↗</a>` : ''}
          ${project.eventDate ? `<span>活动日期：${esc(project.eventDate)}</span>` : '<span>活动日期：未填写</span>'}
        </div>
        <div class="trn-actions">
          <button class="trn-btn link" data-act="project-edit" data-id="${esc(project.id)}">编辑项目</button>
          <button class="trn-btn link" data-act="export-open" data-id="${esc(project.id)}">导出 Markdown</button>
          <button class="trn-btn link danger" data-act="project-delete" data-id="${esc(project.id)}">删除项目</button>
        </div>
      </div>
      <div>${isBound ? '<span class="trn-badge" style="margin:0">已绑定</span>' : ''}</div>
    </div>
    <div class="trn-stats">
      <div class="trn-stat"><b>${all.length}</b><span>全部接力棒</span></div>
      <div class="trn-stat"><b>${normal.length}</b><span>普通棒</span></div>
      <div class="trn-stat"><b>${ex.length}</b><span>EX 棒</span></div>
    </div>
    <div class="trn-toolbar">
      <input class="trn-input" data-role="search" data-key="search" placeholder="搜索作者或棒数" value="${esc(state.manage.search)}" />
      <button class="trn-btn" data-act="sort-open" data-id="${esc(project.id)}">排序</button>
      <button class="trn-btn primary" data-act="bar-new" data-id="${esc(project.id)}">＋ 添加棒</button>
    </div>
    <div class="trn-filters">
      <button class="${state.manage.filter === 'all' ? 'is-on' : ''}" data-act="filter" data-id="all">全部 ${all.length}</button>
      <button class="${state.manage.filter === 'normal' ? 'is-on' : ''}" data-act="filter" data-id="normal">普通棒 ${normal.length}</button>
      <button class="${state.manage.filter === 'ex' ? 'is-on' : ''}" data-act="filter" data-id="ex">EX 棒 ${ex.length}</button>
    </div>
    <div class="trn-table-wrap">
      ${
        rows.length
          ? `<table class="trn-table">
        <thead><tr><th style="width:74px">棒数</th><th style="width:110px">作者</th><th style="width:82px">类型</th><th style="width:130px">接力时间</th><th style="width:82px">作品</th><th style="width:110px">操作</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`
          : `<div class="trn-empty">${all.length ? '没有符合条件的棒' : '还没有接力棒，点「＋ 添加棒」开始记录'}</div>`
      }
    </div>
    <div class="trn-pager">
      <span>共 ${rows.length} 棒，普通棒与 EX 棒独立编号</span>
    </div>`;
}

function renderSettingsBody() {
  const counts = new Map();
  state.data.bars.forEach((b) => {
    if (b.typeId) counts.set(b.typeId, (counts.get(b.typeId) || 0) + 1);
  });
  const typeRows = state.data.types
    .map(
      (t) => `<div class="trn-list-row">
      <div class="trn-col-name">${esc(t.name)}</div>
      <div class="trn-col-use">${counts.get(t.id) || 0} 条棒记录</div>
      <div class="trn-col-ops">
        <button class="trn-btn link" data-act="type-edit" data-id="${esc(t.id)}">编辑</button>
        <button class="trn-btn link danger" data-act="type-delete" data-id="${esc(t.id)}">删除</button>
      </div>
    </div>`,
    )
    .join('');
  const mode = state.data.settings.exportMode;
  const dirName = state.data.settings.dirName || '未选择目录';
  const canDir = supportsDirectory();
  const fill = state.data.settings.fillMissingBars !== false;
  const theme = state.data.settings.theme || 'auto';

  return `<div class="trn-settings">
    <div class="trn-section-title">棒类型设置</div>
    <div class="trn-section-sub">用于棒记录中的作品类型单选标签，适用于所有项目。</div>
    <div class="trn-list">
      <div class="trn-list-head"><div class="trn-col-name">类型名称</div><div class="trn-col-use">使用情况</div><div class="trn-col-ops">操作</div></div>
      ${typeRows || '<div class="trn-list-row"><div class="trn-col-name" style="color:var(--trn-sub)">暂无类型</div></div>'}
    </div>
    <div class="trn-inline-add">
      <input class="trn-input" data-role="newType" data-key="newType" name="newType" placeholder="输入新类型名称，如：音乐" value="${esc(state.newTypeValue)}" />
      <button class="trn-btn primary" data-act="type-add">＋ 添加类型</button>
    </div>
    <div class="trn-hint">名称不可重复；删除使用中的类型时，需先为相关记录指定替代类型。</div>

    <div class="trn-section-title">导出设置</div>
    <div class="trn-section-sub">项目以 Markdown（.md）导出。选择文件的保存方式。</div>
    <div class="trn-toggle-pair" style="margin-top:10px">
      <button class="trn-toggle${mode === 'directory' ? ' is-on' : ''}" data-act="export-mode" data-id="directory">
        <div class="trn-toggle-title"><span class="trn-dot"></span>指定本地目录</div>
        <div class="trn-toggle-sub">使用 File System Access API，需浏览器支持并授权。</div>
      </button>
      <button class="trn-toggle${mode === 'download' ? ' is-on' : ''}" data-act="export-mode" data-id="download">
        <div class="trn-toggle-title"><span class="trn-dot"></span>浏览器下载</div>
        <div class="trn-toggle-sub">使用浏览器默认下载目录，或由浏览器询问保存位置。</div>
      </button>
    </div>
    <div class="trn-dir">
      <div>
        <div class="trn-dir-name">当前目录：${esc(dirName)}</div>
        <div class="trn-dir-sub">${state.data.settings.dirName ? '已授权 · 导出前会检查目录访问权限' : '尚未选择目录，导出时会提示'}</div>
      </div>
      <button class="trn-btn sm" data-act="pick-dir"${canDir ? '' : ' disabled'}>更换目录</button>
    </div>
    <div class="trn-hint">不支持此 API 或未获得授权时，仍可通过「浏览器下载」导出。</div>

    <div class="trn-section-title">外观</div>
    <div class="trn-section-sub">决定侧边菜单与弹窗的明暗风格。</div>
    <div class="trn-toggle-pair" style="margin-top:10px">
      <button class="trn-toggle${theme === 'auto' ? ' is-on' : ''}" data-act="theme" data-id="auto">
        <div class="trn-toggle-title"><span class="trn-dot"></span>跟随 B 站主题</div>
        <div class="trn-toggle-sub">页面切到深色时，接力收集也自动变深色。</div>
      </button>
      <button class="trn-toggle${theme === 'dark' ? ' is-on' : ''}" data-act="theme" data-id="dark">
        <div class="trn-toggle-title"><span class="trn-dot"></span>始终深色</div>
        <div class="trn-toggle-sub">不看页面主题，固定使用夜间样式。</div>
      </button>
      <button class="trn-toggle${theme === 'light' ? ' is-on' : ''}" data-act="theme" data-id="light">
        <div class="trn-toggle-title"><span class="trn-dot"></span>始终浅色</div>
        <div class="trn-toggle-sub">不看页面主题，固定使用白天样式。</div>
      </button>
    </div>

    <div class="trn-section-title">导出细节</div>
    <div class="trn-toggle${fill ? ' is-on' : ''}" data-act="toggle-fill">
      <div class="trn-toggle-title"><span class="trn-dot"></span>缺号自动补位</div>
      <div class="trn-toggle-sub">导出时按棒号逐个生成，缺失的棒号自动写成 N/A 占位。</div>
    </div>
    <div style="height:24px"></div>
  </div>`;
}

function renderModal() {
  const m = state.modal;
  switch (m.type) {
    case 'project':
      return renderProjectModal(m);
    case 'bar':
      return renderBarModal(m);
    case 'sort':
      return renderSortModal(m);
    case 'export':
      return renderExportModal(m);
    case 'bind-picker':
      return renderBindPicker();
    case 'confirm-bar':
      return renderConfirmBar(m);
    case 'confirm-project':
      return renderConfirmProject(m);
    case 'type-edit':
      return renderTypeEdit(m);
    case 'type-delete':
      return renderTypeDelete(m);
    default:
      return '';
  }
}

function renderProjectModal(m) {
  const d = m.draft;
  const errs = m.errors || {};
  const promoRows = d.promotions
    .map(
      (p, i) => `<div class="trn-note-row">
        <input class="trn-input" name="promo" placeholder="https://…" value="${esc(p.url)}" />
        <button class="trn-x" data-act="promo-del" data-idx="${i}" title="删除">✕</button>
      </div>`,
    )
    .join('');
  const noteRows = d.extraNotes
    .map(
      (n, i) => `<div class="trn-note-row">
        <input class="trn-input label" name="noteLabel" placeholder="标签" value="${esc(n.label)}" />
        <input class="trn-input" name="noteUrl" placeholder="https://…" value="${esc(n.url)}" />
        <button class="trn-x" data-act="note-del" data-idx="${i}" title="删除">✕</button>
      </div>`,
    )
    .join('');
  const count = m.id ? barCount(m.id) : 0;

  const body = `
    ${field({ label: '项目名称', name: 'name', value: d.name, placeholder: '例如：晨光创作接力 2026', error: errs.name })}
    <div class="trn-row">
      ${field({ label: '主催昵称', name: 'hostName', value: d.hostName, placeholder: '输入主催昵称', error: errs.hostName })}
      ${field({ label: '主催主页链接', name: 'hostLink', value: d.hostLink, placeholder: 'https://space.bilibili.com/…', error: errs.hostLink })}
    </div>
    ${field({ label: '活动日期', name: 'eventDate', type: 'date', value: d.eventDate, placeholder: 'YYYY-MM-DD', error: errs.eventDate, hint: '留空时，导出文件名使用导出当天的年月' })}
    <div class="trn-info" style="margin-top:16px">
      <strong>${m.id ? '当前绑定项目' : '✓ 创建后自动绑定此项目'}</strong>
      <div>${m.id ? `修改项目信息不会更改当前绑定，也不会影响项目中已有的 ${count} 条棒记录。` : '后续记录的接力棒将默认添加到这里；你可以随时在侧边菜单更换绑定。'}</div>
    </div>
    <div class="trn-field">
      <div class="trn-label">宣传链接<em>按顺序生成一宣 / 二宣 / … / 终宣</em></div>
      <div class="trn-note-list">${promoRows || '<div class="trn-hint">暂未填写宣传链接</div>'}</div>
      <button class="trn-btn sm" data-act="promo-add" style="margin-top:8px">＋ 添加宣传链接</button>
    </div>
    <div class="trn-field">
      <div class="trn-label">附加标注行<em>输出在终宣之后</em></div>
      <div class="trn-note-list">${noteRows || '<div class="trn-hint">暂未填写标注行</div>'}</div>
      <button class="trn-btn sm" data-act="note-add" style="margin-top:8px">＋ 添加标注行</button>
    </div>
  `;

  return modalShell({
    title: m.id ? '编辑接力项目' : '创建接力项目',
    subtitle: m.id ? '已填入现有信息，保存后更新当前项目。' : '为新一轮创作接力，建立一个专属项目。',
    width: 600,
    scroll: true,
    body,
    footNote: m.id ? `项目 ID · ${m.id}` : '新项目',
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>
      <button class="trn-btn primary" data-act="project-save">${m.id ? '保存修改' : '创建并绑定'}</button>`,
  });
}

function renderBarModal(m) {
  const d = m.draft;
  const errs = m.errors || {};
  const options = state.data.projects
    .map(
      (p) =>
        `<option value="${esc(p.id)}"${p.id === d.projectId ? ' selected' : ''}>${esc(p.name)}${p.id === state.data.settings.boundProjectId ? '（当前绑定）' : ''}</option>`,
    )
    .join('');
  const chips = state.data.types
    .map(
      (t) =>
        `<button class="trn-chip${d.typeId === t.id ? ' is-on' : ''}" data-act="pick-type" data-id="${esc(t.id)}">${d.typeId === t.id ? '✓ ' : ''}${esc(t.name)}</button>`,
    )
    .join('');
  const addType = m.addingType
    ? `<div class="trn-inline-add">
        <input class="trn-input" name="newTypeName" placeholder="新类型名称" value="${esc(m.newTypeValue || '')}" autocomplete="off" />
        <button class="trn-btn primary" data-act="type-add-inline">添加</button>
      </div>`
    : '';

  const body = `
    <div class="trn-row">
      ${field({ label: '接力棒数', name: 'numberInput', value: d.numberInput, placeholder: '如 128 或 EX+12', error: errs.numberInput, hint: '普通棒 / EX+棒 均在此填写' })}
      <div class="trn-field">
        <div class="trn-label">接力时间<em>24 小时制</em></div>
        <div class="trn-time">
          <input class="trn-input${errs.timeInput ? ' has-error' : ''}" type="text" inputmode="numeric" maxlength="3" name="hourInput" value="${esc(d.hourInput)}" placeholder="9" autocomplete="off" />
          <span class="trn-time-sep">:</span>
          <input class="trn-input${errs.timeInput ? ' has-error' : ''}" type="text" inputmode="numeric" maxlength="2" name="minuteInput" value="${esc(d.minuteInput)}" placeholder="00" autocomplete="off" />
          <button class="trn-btn sm" data-act="time-now" title="填入当前时间">现在</button>
        </div>
        ${errs.timeInput ? `<div class="trn-err">${esc(errs.timeInput)}</div>` : '<div class="trn-hint">跨日时间可填 25:47 这样的小时</div>'}
      </div>
    </div>
    ${m.warning ? `<div class="trn-err">${esc(m.warning)}（仍可保存）</div>` : ''}
    <div class="trn-row">
      ${field({ label: '接力作者', name: 'authorName', value: d.authorName, placeholder: '输入作者昵称' })}
      ${field({ label: '作者主页链接', name: 'authorLink', value: d.authorLink, placeholder: 'https://' })}
    </div>
    <div class="trn-field">
      <div class="trn-label">接力作品类型<em>单选</em></div>
      <div class="trn-chips">${chips}<button class="trn-chip add" data-act="type-add-open" title="新增类型">＋</button></div>
      ${addType}
    </div>
    ${field({ label: '接力作品链接', name: 'workLink', value: d.workLink, placeholder: '粘贴作品的完整链接' })}
    <div class="trn-field">
      <div class="trn-label">目标接力项目</div>
      <select class="trn-select" name="projectId">${options}</select>
    </div>
    ${m.scrapeMessage ? `<div class="trn-hint" style="margin-top:12px">${esc(m.scrapeMessage)}</div>` : ''}
  `;

  return modalShell({
    title: m.barId ? '编辑接力棒' : '新增接力棒',
    badge: '接力收集',
    subtitle: m.barId ? '已填入现有记录，修改后将更新此棒。' : '把这一棒的作者与作品，一起记录下来。',
    width: 600,
    scroll: true,
    body,
    footNote: m.barId ? `正在编辑 · ${m.footLabel || ''}` : '记录每一棒的创作',
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>
      <button class="trn-btn primary" data-act="bar-save">${m.barId ? '保存修改' : '保存接力'}</button>`,
  });
}

function renderSortModal(m) {
  const items = m.items;
  const numbered = new Map();
  ['normal', 'ex'].forEach((kind) => {
    let n = 0;
    items.forEach((it) => {
      if (it.bar.kind !== kind) return;
      n += 1;
      numbered.set(it.bar.id, n);
    });
  });
  const rows = items
    .map((it) => {
      const next = m.mode === 'renumber' ? numbered.get(it.bar.id) : it.bar.number;
      return `<div class="trn-sort-row" draggable="true" data-bar="${esc(it.bar.id)}">
      <span class="trn-grip">⠿</span>
      <span class="trn-sort-name">${esc(it.bar.authorName || `第${it.bar.number}棒`)}</span>
      <span class="trn-sort-tag">${it.bar.kind === 'ex' ? 'EX' : '普通'}</span>
      <span class="trn-sort-num">${esc(barShortLabel(it.bar))} → <b>${esc(it.bar.kind === 'ex' ? `EX+${next}` : next)}</b></span>
      <button class="trn-move" data-act="sort-up" data-id="${esc(it.bar.id)}" title="上移">↑</button>
      <button class="trn-move" data-act="sort-down" data-id="${esc(it.bar.id)}" title="下移">↓</button>
    </div>`;
    })
    .join('');
  const preview = ['normal', 'ex']
    .map((kind) => {
      const list = items.filter((it) => it.bar.kind === kind);
      if (!list.length) return '';
      const nums = list.map((it) => (m.mode === 'renumber' ? numbered.get(it.bar.id) : it.bar.number));
      return kind === 'ex' ? `EX 棒 EX+${nums[0]}–EX+${nums[nums.length - 1]}` : `普通棒 ${nums[0]}-${nums[nums.length - 1]}`;
    })
    .filter(Boolean)
    .join('；');

  const body = `
    <div class="trn-label">排序后如何处理棒号？</div>
    <button class="trn-toggle${m.mode === 'renumber' ? ' is-on' : ''}" data-act="sort-mode" data-id="renumber">
      <div class="trn-toggle-title"><span class="trn-dot"></span>重新编排棒号</div>
      <div class="trn-toggle-sub">普通棒从 1 开始；EX 棒从 EX+1 开始，分别连续编号。</div>
    </button>
    <button class="trn-toggle${m.mode === 'keep' ? ' is-on' : ''}" data-act="sort-mode" data-id="keep" style="margin-top:10px">
      <div class="trn-toggle-title"><span class="trn-dot"></span>保留原棒号</div>
      <div class="trn-toggle-sub">仅调整展示顺序，不修改任何棒号。</div>
    </button>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
      <span class="trn-hint">拖动条目，或用 ↑ ↓ 调整</span>
      <button class="trn-btn link" data-act="sort-by-time">按时间排序 ⌄</button>
    </div>
    <div class="trn-sort-list">${rows || '<div class="trn-empty">没有可排序的棒</div>'}</div>
    <div class="trn-hint" style="margin-top:10px">预览：${esc(preview || '暂无棒')}。保存后生效。</div>
  `;

  return modalShell({
    title: '接力棒排序',
    subtitle: `${m.projectName} · 共 ${items.length} 棒`,
    width: 620,
    scroll: true,
    body,
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>
      <button class="trn-btn primary" data-act="sort-save" data-id="${esc(m.projectId)}">保存排序</button>`,
  });
}

function renderExportModal(m) {
  const d = m.draft;
  const mode = state.data.settings.exportMode;
  const dirName = state.data.settings.dirName || '未选择目录';
  return modalShell({
    title: '导出项目',
    subtitle: `${m.projectName} · ${m.barCount} 条棒记录`,
    width: 640,
    body: `
      ${field({ label: '文件名称', name: 'filename', value: d.filename, placeholder: '文件名.md' })}
      <div class="trn-info" style="margin-top:14px">
        <strong>Markdown · .md</strong>
        <div>包含当前项目与棒记录，保留当前展示顺序。</div>
      </div>
      <div class="trn-field">
        <div class="trn-label">导出位置</div>
        <div class="trn-hint" style="margin-top:0">${esc(mode === 'directory' ? `${dirName} / ${d.filename}` : '浏览器默认下载目录')}</div>
        ${
          mode === 'directory'
            ? `<div class="trn-hint">${
                state.data.settings.dirName ? '已授权目录 · File System Access API' : '尚未选择目录 · 导出时会先请求目录访问权限'
              }</div>
               <button class="trn-btn link" data-act="pick-dir" style="margin-top:6px">更改目录 ›</button>`
            : ''
        }
      </div>
      ${m.dateNote ? `<div class="trn-hint">${esc(m.dateNote)}</div>` : ''}
      <div class="trn-hint">${
        mode === 'directory'
          ? '如浏览器不支持目录访问或授权失效，可使用浏览器下载。'
          : '浏览器下载无法探测同名文件，重名时会自动追加 (1) 后缀。'
      }</div>
    `,
    footer: `<button class="trn-btn" data-act="export-download">浏览器下载</button>
      <button class="trn-btn primary" data-act="export-directory">导出到目录</button>`,
  });
}

function renderBindPicker() {
  const items = state.data.projects
    .map(
      (p) => `<button class="trn-toggle${p.id === state.data.settings.boundProjectId ? ' is-on' : ''}" data-act="bind" data-id="${esc(p.id)}">
      <div class="trn-toggle-title"><span class="trn-dot"></span>${esc(p.name)}</div>
      <div class="trn-toggle-sub">${barCount(p.id)} 棒${p.eventDate ? ` · ${esc(p.eventDate)}` : ''}</div>
    </button>`,
    )
    .join('');
  return modalShell({
    title: '更换绑定项目',
    subtitle: '后续记录的接力棒会默认添加到这里。',
    width: 440,
    scroll: true,
    body: items || '<div class="trn-empty">还没有项目，请先创建。</div>',
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>`,
  });
}

function renderConfirmBar(m) {
  const bar = state.data.bars.find((b) => b.id === m.id);
  if (!bar) return '';
  const project = projectOf(bar.projectId);
  return modalShell({
    title: '删除这条接力棒？',
    subtitle: '删除后无法恢复，请确认这不是误操作。',
    width: 460,
    body: `<div class="trn-info">
        <strong>${esc(barFullTitle(bar))} · ${esc(bar.authorName || 'N/A')}</strong>
        <div>${esc(typeName(state.data.types, bar.typeId) || 'N/A')} · ${esc(bar.eventDate || '')} ${esc(bar.timeRaw || formatTime(bar.minutes))}</div>
      </div>
      <div class="trn-hint" style="margin-top:14px">将从「${esc(project ? project.name : '')}」中移除此记录，不影响 BiliBili 原作品。<br/>其他棒号保持不变。</div>`,
    footer: `<button class="trn-btn" data-act="close-modal">保留记录</button>
      <button class="trn-btn danger" data-act="bar-confirm-delete" data-id="${esc(bar.id)}">删除接力棒</button>`,
  });
}

function renderConfirmProject(m) {
  const project = projectOf(m.id);
  if (!project) return '';
  const isBound = project.id === state.data.settings.boundProjectId;
  return modalShell({
    title: '删除整个接力项目？',
    subtitle: '此操作不可撤销，请谨慎确认。',
    width: 460,
    body: `<div class="trn-danger-box">
        <div class="trn-danger-name">${esc(project.name)}</div>
        <div class="trn-danger-sub">将一并删除项目及其全部 ${barCount(project.id)} 条棒记录。</div>
      </div>
      <div class="trn-hint" style="margin-top:14px">${
        isBound
          ? '这个项目当前处于绑定状态。删除后将解除绑定，下次记录前需要选择其他项目。'
          : '删除后不可恢复，项目中的棒记录也会一并移除。'
      }</div>`,
    footer: `<button class="trn-btn" data-act="close-modal">保留项目</button>
      <button class="trn-btn danger" data-act="project-confirm-delete" data-id="${esc(project.id)}">删除整个项目</button>`,
  });
}

function renderTypeEdit(m) {
  const type = state.data.types.find((t) => t.id === m.id);
  if (!type) return '';
  const used = state.data.bars.filter((b) => b.typeId === type.id).length;
  return modalShell({
    title: '编辑作品类型',
    subtitle: '修改名称会同步更新使用该类型的棒记录。',
    width: 460,
    body: `${field({ label: '类型名称', name: 'typeName', value: m.value, error: m.error })}
      <div class="trn-info" style="margin-top:14px">
        <strong>当前有 ${used} 条棒记录使用此类型</strong>
        <div>仅更改类型名称，不更改棒号或作品链接。</div>
      </div>`,
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>
      <button class="trn-btn primary" data-act="type-save" data-id="${esc(type.id)}">保存修改</button>`,
  });
}

function renderTypeDelete(m) {
  const type = state.data.types.find((t) => t.id === m.id);
  if (!type) return '';
  const used = state.data.bars.filter((b) => b.typeId === type.id);
  const options = state.data.types
    .filter((t) => t.id !== type.id)
    .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
    .join('');
  const body = used.length
    ? `<div class="trn-hint" style="margin-top:0">有 ${used.length} 条棒记录正在使用此类型。</div>
      <div class="trn-danger-box" style="margin-top:12px">先选择替代类型，避免记录丢失分类。</div>
      <div class="trn-field"><div class="trn-label">将这 ${used.length} 条记录的类型更改为</div>
        <select class="trn-select" name="replacement">${options || '<option value="">（没有其他类型）</option>'}</select>
      </div>
      <div class="trn-hint">确认后迁移这 ${used.length} 条记录并删除「${esc(type.name)}」标签，不会删除棒记录。</div>`
    : `<div class="trn-hint" style="margin-top:0">没有棒记录使用「${esc(type.name)}」，可以安全删除。</div>`;
  return modalShell({
    title: `删除「${type.name}」类型？`,
    width: 480,
    body,
    footer: `<button class="trn-btn" data-act="close-modal">取消</button>
      <button class="trn-btn danger" data-act="type-confirm-delete" data-id="${esc(type.id)}">${used.length ? '迁移并删除' : '删除类型'}</button>`,
  });
}

function val(name) {
  const el = root.querySelector(`[name="${name}"]`);
  return el ? el.value : '';
}

function allVals(name) {
  return Array.from(root.querySelectorAll(`[name="${name}"]`)).map((el) => el.value);
}

function readProjectDraft(base) {
  const promos = allVals('promo');
  const labels = allVals('noteLabel');
  const urls = allVals('noteUrl');
  const hasDom = root.querySelector('[name="name"]') && root.querySelector('[name="promo"], [data-act="promo-add"]');
  const draft = { ...base.draft };
  if (!hasDom) return draft;
  draft.name = val('name');
  draft.hostName = val('hostName');
  draft.hostLink = val('hostLink');
  draft.eventDate = val('eventDate');
  draft.promotions = promos.map((url) => ({ url }));
  draft.extraNotes = labels.map((label, i) => ({ label, url: urls[i] || '' }));
  return draft;
}

function readBarDraft(base) {
  const draft = { ...base.draft };
  const el = root.querySelector('[name="numberInput"]');
  if (!el) return draft;
  draft.numberInput = val('numberInput');
  draft.hourInput = val('hourInput');
  draft.minuteInput = val('minuteInput');
  draft.authorName = val('authorName');
  draft.authorLink = val('authorLink');
  draft.workLink = val('workLink');
  draft.projectId = val('projectId') || draft.projectId;
  return draft;
}

function onSaveProject() {
  const m = state.modal;
  const draft = readProjectDraft(m);
  const errors = validateProject({ ...draft, id: m.id }, state.data.projects);
  if (Object.keys(errors).length) {
    state.modal = { ...m, draft, errors };
    render();
    return;
  }
  if (m.id) {
    const project = projectOf(m.id);
    Object.assign(project, draft, { updatedAt: Date.now() });
  } else {
    const id = `relay-${todayString().replace(/-/g, '')}-${state.data.projects.length + 1}`;
    state.data.projects.push({ id, ...draft, barOrder: [], createdAt: Date.now(), updatedAt: Date.now() });
    state.data.settings.boundProjectId = id;
    state.manage.projectId = id;
  }
  persist();
  closeModal();
  toast('项目已保存');
}

function openProjectModal(id) {
  const project = id ? projectOf(id) : null;
  state.manage.projectId = id || state.manage.projectId;
  openModal({
    type: 'project',
    id: id || null,
    draft: project
      ? {
          name: project.name,
          hostName: project.hostName || '',
          hostLink: project.hostLink || '',
          eventDate: project.eventDate || '',
          promotions: (project.promotions || []).map((p) => ({ url: p.url || '' })),
          extraNotes: (project.extraNotes || []).map((n) => ({ label: n.label || '', url: n.url || '' })),
        }
      : { name: '', hostName: '', hostLink: '', eventDate: todayString(), promotions: [], extraNotes: [] },
  });
}

function barDraftFrom(bar) {
  return {
    numberInput: barShortLabel(bar),
    ...splitTime(bar.timeRaw, bar.minutes),
    authorName: bar.authorName || '',
    authorLink: bar.authorLink || '',
    workLink: bar.workLink || '',
    typeId: bar.typeId || '',
    projectId: bar.projectId,
  };
}

function onBarSave() {
  const m = state.modal;
  const draft = readBarDraft(m);
  const project = projectOf(draft.projectId);
  if (!project) {
    toast('请选择目标接力项目', true);
    return;
  }
  const time = parseTimeParts(draft.hourInput, draft.minuteInput);
  const check = validateBar({ ...draft, timeInput: time.ok ? time.timeRaw : '' }, projectBars(state.data, draft.projectId), m.barId);
  if (!time.ok) check.errors.timeInput = time.error;
  if (Object.keys(check.errors).length) {
    state.modal = { ...m, draft, errors: check.errors, warning: check.warning };
    render();
    return;
  }
  const payload = {
    projectId: draft.projectId,
    eventDate: project.eventDate || null,
    kind: check.kind,
    number: check.number,
    minutes: check.minutes,
    timeRaw: check.timeRaw,
    authorName: draft.authorName.trim(),
    authorLink: draft.authorLink.trim(),
    workLink: draft.workLink.trim(),
    typeId: draft.typeId || null,
    updatedAt: Date.now(),
  };
  if (m.barId) {
    const bar = state.data.bars.find((b) => b.id === m.barId);
    Object.assign(bar, payload);
  } else {
    const id = uid('bar');
    state.data.bars.push({ id, ...payload, createdAt: Date.now() });
    if (!Array.isArray(project.barOrder)) project.barOrder = [];
    project.barOrder.push(id);
  }
  persist();
  closeModal();
  toast(m.barId ? '接力棒已更新' : '已保存接力棒');
}

async function openBarForm(barId) {
  if (!state.data.projects.length) {
    toast('请先创建一个接力项目', true);
    openProjectModal(null);
    return;
  }
  if (barId) {
    const bar = state.data.bars.find((b) => b.id === barId);
    if (!bar) return;
    state.manage.projectId = bar.projectId;
    openModal({ type: 'bar', barId, draft: barDraftFrom(bar), footLabel: barFullTitle(bar) });
    return;
  }
  const project = state.manage.projectId ? projectOf(state.manage.projectId) : activeProject();
  if (!project) return;
  const prefill = suggestBarPrefill(state.data, project, 'normal');
  openModal({
    type: 'bar',
    barId: null,
    draft: { numberInput: String(prefill.number), ...splitTime(prefill.timeRaw), authorName: '', authorLink: '', workLink: '', typeId: '', projectId: project.id },
    scrapeMessage: prefill.note || '正在读取当前页面的作者与作品…',
  });
  const page = detectPage();
  const scraped = await scrapeCurrentPage();
  const m = state.modal;
  if (!m || m.type !== 'bar' || m.barId) return;
  const publishTime = scraped.publishedAt ? timeFromPublish(scraped.publishedAt, project) : null;
  if (!scraped.authorName && !scraped.workLink) {
    state.modal = {
      ...m,
      draft: publishTime ? { ...m.draft, ...splitTime(publishTime.timeRaw) } : m.draft,
      scrapeMessage: `${page.type ? '未识别当前页面的作者，请手动填写' : '当前不是作品页面，请手动填写'}${publishTime ? `；接力时间已按作品发布时间填入 ${publishTime.timeRaw}` : ''}`,
    };
  } else {
    state.modal = {
      ...m,
      draft: { ...m.draft, ...(publishTime ? splitTime(publishTime.timeRaw) : {}), authorName: scraped.authorName || '', authorLink: scraped.authorLink || '', workLink: scraped.workLink || '' },
      scrapeMessage: `已从${scraped.source === 'state' ? '页面数据' : scraped.source === 'api' ? '官方接口' : '页面元素'}填充作者与作品链接${publishTime ? `；接力时间取作品发布时间 ${publishTime.timeRaw}` : ''}${prefill.note ? `；${prefill.note}` : ''}`,
    };
  }
  render();
}

function onSaveSort() {
  const m = state.modal;
  const project = projectOf(m.projectId);
  if (!project) return;
  const ids = m.items.map((it) => it.bar.id);
  ['normal', 'ex'].forEach((kind) => {
    let n = 0;
    ids.forEach((id) => {
      const bar = state.data.bars.find((b) => b.id === id);
      if (!bar || bar.kind !== kind) return;
      n += 1;
      if (m.mode === 'renumber') {
        bar.number = n;
        bar.updatedAt = Date.now();
      }
    });
  });
  project.barOrder = ids;
  project.sortMode = m.mode;
  project.updatedAt = Date.now();
  persist();
  closeModal();
  toast('排序已保存');
}

function openSortModal(projectId) {
  const project = projectOf(projectId);
  if (!project) return;
  const items = displayOrder(projectBars(state.data, projectId)).map((bar) => ({ bar }));
  if (!items.length) {
    toast('该项目还没有棒，无法排序', true);
    return;
  }
  openModal({ type: 'sort', projectId, projectName: project.name, mode: project.sortMode === 'keep' ? 'keep' : 'renumber', items });
}

function openExportModal(projectId) {
  const project = projectOf(projectId);
  if (!project) return;
  openModal({
    type: 'export',
    projectId,
    projectName: project.name,
    barCount: barCount(projectId),
    dateNote: project.eventDate ? '' : '项目缺少活动日期，文件名使用了当天年月',
    draft: { filename: exportFileName(project) },
  });
}

async function doExport(mode) {
  const m = state.modal;
  const project = projectOf(m.projectId);
  if (!project) return;
  const typed = val('filename');
  state.modal = { ...m, draft: { filename: typed } };
  const filename = (typed || '').trim() || exportFileName(project);
  if (!/\.md$/i.test(filename)) {
    toast('文件名需以 .md 结尾', true);
    return;
  }
  const md = buildMarkdown({
    project,
    bars: projectBars(state.data, project.id),
    types: state.data.types,
    fillMissingBars: state.data.settings.fillMissingBars !== false,
  });
  if (mode === 'download') {
    downloadText(md, filename);
    closeModal();
    toast('已开始下载');
    return;
  }
  try {
    const dir = await idbGetHandle();
    if (!dir) {
      downloadText(md, filename);
      closeModal();
      toast('尚未选择导出目录，已使用浏览器下载');
      return;
    }
    await saveToDirectory(dir, filename, md);
    state.data.settings.dirName = dir.name || '';
    persist();
    closeModal();
    toast(`已导出到 ${dir.name || '目录'}`);
  } catch (err) {
    downloadText(md, filename);
    closeModal();
    toast(`${err.message || '目录导出失败'}，已改为浏览器下载`, true);
  }
}

function onPickDir() {
  pickDirectory()
    .then((handle) => {
      state.data.settings.dirName = handle.name || '';
      state.data.settings.exportMode = 'directory';
      persist();
      render();
      toast(`已选择目录：${handle.name || ''}`);
    })
    .catch((err) => {
      if (err && err.name === 'AbortError') return;
      toast(err.message || '选择目录失败', true);
    });
}

function addType(nameValue) {
  const name = String(nameValue || '').trim();
  if (!name) {
    toast('请填写类型名称', true);
    return;
  }
  if (state.data.types.some((t) => t.name === name)) {
    toast('类型名称已存在', true);
    return;
  }
  const type = { id: uid('type'), name };
  state.data.types.push(type);
  state.newTypeValue = '';
  persist();
  return type;
}

function addTypeInline() {
  const m = state.modal;
  const input = root.querySelector('[name="newTypeName"]');
  const type = addType(input ? input.value : '');
  if (!type) {
    render();
    return;
  }
  state.modal = { ...m, addingType: false, newTypeValue: '', draft: { ...m.draft, typeId: type.id } };
  render();
  toast('已添加类型');
}

function bindProject(id) {
  state.data.settings.boundProjectId = id;
  if (id) state.manage.projectId = id;
  persist();
  if (state.modal && state.modal.type === 'bind-picker') state.modal = null;
  render();
  toast(id ? '已更换绑定项目' : '已取消绑定');
}

function moveSortBar(id, delta) {
  const m = state.modal;
  const index = m.items.findIndex((it) => it.bar.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= m.items.length) return;
  const items = m.items.slice();
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  state.modal = { ...m, items };
  render();
}

function togglePanel() {
  if (state.view === 'panel') {
    state.pinned = false;
    state.view = 'closed';
  } else {
    state.pinned = true;
    state.view = 'panel';
  }
  render();
}

function bindEvents() {
  let drag = null;
  let surfaceDrag = null;

  root.addEventListener('pointerdown', (e) => {
    const zone = e.target.closest('[data-drag]');
    if (!zone || e.target.closest('button, input, select, textarea, a')) return;
    const key = zone.dataset.drag;
    const cur = state.offsets[key] || { x: 0, y: 0 };
    const card = zone.closest('.trn-big, .trn-card, .trn-panel');
    surfaceDrag = { key, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, zone, rect: card ? card.getBoundingClientRect() : null };
    if (zone.setPointerCapture) {
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {}
    }
    root.classList.add('trn-dragging');
  });

  root.addEventListener('pointermove', (e) => {
    if (!surfaceDrag) return;
    let x = Math.round(surfaceDrag.ox + (e.clientX - surfaceDrag.sx));
    let y = Math.round(surfaceDrag.oy + (e.clientY - surfaceDrag.sy));
    const r = surfaceDrag.rect;
    if (r) {
      const keep = 160;
      x = Math.min(x, window.innerWidth - keep - r.left);
      x = Math.max(x, keep - r.width - r.left);
      y = Math.min(y, window.innerHeight - keep - r.top);
      y = Math.max(y, 60 - r.height - r.top);
    }
    root.style.setProperty(`--trn-${surfaceDrag.key}-x`, `${x}px`);
    root.style.setProperty(`--trn-${surfaceDrag.key}-y`, `${y}px`);
    surfaceDrag.x = x;
    surfaceDrag.y = y;
  });

  root.addEventListener('pointerup', () => {
    if (!surfaceDrag) return;
    const d = surfaceDrag;
    surfaceDrag = null;
    root.classList.remove('trn-dragging');
    if (d.x != null) state.offsets[d.key] = { x: d.x, y: d.y };
  });

  root.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.trn-tab');
    if (!tab) return;
    drag = { y: e.clientY, base: Number(state.data.settings.panelPosition) || 42, moved: false, el: tab };
    e.preventDefault();
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y) < 5) return;
    drag.moved = true;
    const pos = Math.max(5, Math.min(95, drag.base + ((e.clientY - drag.y) / window.innerHeight) * 100));
    drag.pos = pos;
    if (drag.el) drag.el.style.top = `${pos}%`;
  });

  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (finished.moved && finished.pos != null) {
      state.data.settings.panelPosition = Math.round(finished.pos);
      persist();
      render();
    } else if (!finished.moved) {
      togglePanel();
    }
  });

  root.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (!target || target.disabled) return;
    handleAction(target.dataset.act, target.dataset.id, target, e);
  });

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.key === 'search') {
      state.manage.search = el.value;
      state.focusKey = 'search';
      render();
    } else if (el.dataset && el.dataset.key === 'newType') {
      state.newTypeValue = el.value;
    } else if (el.dataset && el.dataset.key === 'newTypeInline') {
      if (state.modal) state.modal = { ...state.modal, newTypeValue: el.value };
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.modal) {
        closeModal();
      } else if (state.view === 'big' || state.view === 'panel') {
        state.pinned = false;
        state.view = 'closed';
          render();
      }
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.target && e.target.name === 'newTypeName') {
      e.preventDefault();
      addTypeInline();
    } else if (e.target && e.target.dataset && e.target.dataset.key === 'newType') {
      e.preventDefault();
      addType(e.target.value);
      render();
    }
  });

  root.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.trn-sort-row');
    if (!row) return;
    state.dragId = row.dataset.bar;
    row.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragend', () => {
    state.dragId = null;
    root.querySelectorAll('.trn-sort-row').forEach((r) => r.classList.remove('dragging', 'drop-target'));
  });
  root.addEventListener('dragover', (e) => {
    if (!state.dragId) return;
    const row = e.target.closest('.trn-sort-row');
    if (!row) return;
    e.preventDefault();
    root.querySelectorAll('.trn-sort-row').forEach((r) => r.classList.remove('drop-target'));
    row.classList.add('drop-target');
  });
  root.addEventListener('drop', (e) => {
    if (!state.dragId) return;
    const row = e.target.closest('.trn-sort-row');
    if (!row) return;
    e.preventDefault();
    const from = state.modal.items.findIndex((it) => it.bar.id === state.dragId);
    const to = state.modal.items.findIndex((it) => it.bar.id === row.dataset.bar);
    state.dragId = null;
    if (from < 0 || to < 0 || from === to) return;
    const items = state.modal.items.slice();
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    state.modal = { ...state.modal, items };
    render();
  });
}

function handleAction(act, id, target) {
  switch (act) {
    case 'theme':
      state.data.settings.theme = id;
      persist();
      render();
      break;
    case 'toggle-theme': {
      state.data.settings.theme = themeIsDark() ? 'light' : 'dark';
      persist();
      render();
      break;
    }
    case 'close-panel':
      state.pinned = false;
      state.view = 'closed';
      render();
      break;
    case 'close-big':
      state.pinned = false;
      state.view = 'closed';
      render();
      break;
    case 'open-big':
      state.view = 'big';
      state.bigTab = 'projects';
      render();
      break;
    case 'open-settings':
      state.view = 'big';
      state.bigTab = 'settings';
      render();
      break;
    case 'back-panel':
      state.view = 'panel';
      render();
      break;
    case 'big-tab':
      state.bigTab = id;
      render();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'project-new':
      state.view = 'big';
      state.bigTab = 'projects';
      openProjectModal(null);
      break;
    case 'project-edit':
      openProjectModal(id);
      break;
    case 'project-save':
      onSaveProject();
      break;
    case 'project-delete':
      openModal({ type: 'confirm-project', id });
      break;
    case 'project-confirm-delete': {
      const project = projectOf(id);
      state.data.projects = state.data.projects.filter((p) => p.id !== id);
      state.data.bars = state.data.bars.filter((b) => b.projectId !== id);
      if (state.data.settings.boundProjectId === id) state.data.settings.boundProjectId = null;
      if (state.manage.projectId === id) state.manage.projectId = null;
      persist();
      closeModal();
      toast(`已删除项目${project ? `「${project.name}」` : ''}`);
      break;
    }
    case 'bar-new':
      openBarForm(null);
      break;
    case 'bar-edit':
      openBarForm(id);
      break;
    case 'bar-save':
      onBarSave();
      break;
    case 'time-now': {
      const draft = readBarDraft(state.modal);
      const project = projectOf(draft.projectId);
      if (!project) break;
      const next = suggestBarPrefill(state.data, project, 'normal');
      state.modal = {
        ...state.modal,
        draft: { ...draft, ...splitTime(next.timeRaw) },
        errors: { ...(state.modal.errors || {}), timeInput: '' },
        scrapeMessage: next.note || state.modal.scrapeMessage,
      };
      render();
      break;
    }
    case 'bar-delete':
      openModal({ type: 'confirm-bar', id });
      break;
    case 'bar-confirm-delete': {
      const bar = state.data.bars.find((b) => b.id === id);
      state.data.bars = state.data.bars.filter((b) => b.id !== id);
      state.data.projects.forEach((p) => {
        if (Array.isArray(p.barOrder)) p.barOrder = p.barOrder.filter((x) => x !== id);
      });
      persist();
      closeModal();
      toast(bar ? `已删除${barFullTitle(bar)}` : '已删除接力棒');
      break;
    }
    case 'pick-type': {
      const draft = readBarDraft(state.modal);
      state.modal = { ...state.modal, draft: { ...draft, typeId: id } };
      render();
      break;
    }
    case 'type-add-open': {
      const draft = readBarDraft(state.modal);
      state.modal = { ...state.modal, draft, addingType: true };
      render();
      const input = root.querySelector('[name="newTypeName"]');
      if (input) input.focus();
      break;
    }
    case 'type-add-inline':
      addTypeInline();
      break;
    case 'promo-add': {
      const draft = readProjectDraft(state.modal);
      draft.promotions = [...draft.promotions, { url: '' }];
      state.modal = { ...state.modal, draft };
      render();
      break;
    }
    case 'promo-del': {
      const draft = readProjectDraft(state.modal);
      draft.promotions = draft.promotions.slice();
      draft.promotions.splice(Number(target.dataset.idx), 1);
      state.modal = { ...state.modal, draft };
      render();
      break;
    }
    case 'note-add': {
      const draft = readProjectDraft(state.modal);
      draft.extraNotes = [...draft.extraNotes, { label: '', url: '' }];
      state.modal = { ...state.modal, draft };
      render();
      break;
    }
    case 'note-del': {
      const draft = readProjectDraft(state.modal);
      draft.extraNotes = draft.extraNotes.slice();
      draft.extraNotes.splice(Number(target.dataset.idx), 1);
      state.modal = { ...state.modal, draft };
      render();
      break;
    }
    case 'bind-here':
    case 'bind':
      bindProject(id);
      break;
    case 'unbind':
      bindProject(null);
      break;
    case 'bind-picker':
      openModal({ type: 'bind-picker' });
      break;
    case 'switch-project':
      state.manage.projectId = id;
      render();
      break;
    case 'filter':
      state.manage.filter = id;
      render();
      break;
    case 'sort-open':
      openSortModal(id);
      break;
    case 'sort-mode':
      state.modal = { ...state.modal, mode: id };
      render();
      break;
    case 'sort-up':
      moveSortBar(id, -1);
      break;
    case 'sort-down':
      moveSortBar(id, 1);
      break;
    case 'sort-by-time': {
      const m = state.modal;
      const items = m.items.slice().sort((a, b) => a.bar.minutes - b.bar.minutes);
      state.modal = { ...m, items };
      render();
      break;
    }
    case 'sort-save':
      onSaveSort();
      break;
    case 'export-open':
      openExportModal(id);
      break;
    case 'export-download':
      doExport('download');
      break;
    case 'export-directory':
      doExport('directory');
      break;
    case 'export-mode':
      state.data.settings.exportMode = id;
      persist();
      render();
      break;
    case 'toggle-fill':
      state.data.settings.fillMissingBars = state.data.settings.fillMissingBars === false;
      persist();
      render();
      break;
    case 'type-add':
      addType(val('newType'));
      render();
      break;
    case 'type-edit': {
      const type = state.data.types.find((t) => t.id === id);
      if (type) openModal({ type: 'type-edit', id, value: type.name });
      break;
    }
    case 'type-save': {
      const m = state.modal;
      const name = val('typeName').trim();
      if (!name) {
        state.modal = { ...m, error: '请填写类型名称' };
        render();
        return;
      }
      if (state.data.types.some((t) => t.id !== id && t.name === name)) {
        state.modal = { ...m, error: '已存在同名类型', value: name };
        render();
        return;
      }
      const type = state.data.types.find((t) => t.id === id);
      if (type) type.name = name;
      persist();
      closeModal();
      toast('类型已更新');
      break;
    }
    case 'type-delete':
      openModal({ type: 'type-delete', id });
      break;
    case 'type-confirm-delete': {
      const type = state.data.types.find((t) => t.id === id);
      const used = state.data.bars.filter((b) => b.typeId === id);
      const replacement = val('replacement');
      if (used.length && replacement) {
        used.forEach((b) => {
          b.typeId = replacement;
          b.updatedAt = Date.now();
        });
      }
      state.data.types = state.data.types.filter((t) => t.id !== id);
      persist();
      closeModal();
      toast(type ? `已删除类型「${type.name}」` : '已删除类型');
      break;
    }
    case 'pick-dir':
      onPickDir();
      break;
    case 'save-settings':
      state.newTypeValue = val('newType');
      persist();
      toast('设置已保存');
      break;
    default:
      break;
  }
}

// ---- src/main.js ----
const HOST_ID = 'th-relay-note-host';

function boot() {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  document.documentElement.appendChild(host);
  try {
    mount(host);
  } catch (err) {
    console.error('[TH-Relay-Note] 初始化失败', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
})();
