export const SCHEMA_VERSION = 1;

export const PRESET_TYPES = ['插画', '视频', '文章', 'MMD'];

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function defaultData() {
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
    },
  };
}

export function migrate(raw) {
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
  const pos = Number(data.settings.panelPosition);
  data.settings.panelPosition = Number.isFinite(pos) ? Math.min(95, Math.max(5, pos)) : 42;
  data.settings.fillMissingBars = data.settings.fillMissingBars !== false;
  return data;
}

export function projectBars(data, projectId) {
  return data.bars.filter((b) => b.projectId === projectId);
}

export function sortBars(bars) {
  return bars.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'normal' ? -1 : 1;
    if (a.number !== b.number) return a.number - b.number;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function maxNumber(bars, kind) {
  return bars.reduce((m, b) => (b.kind === kind && b.number > m ? b.number : m), 0);
}

export function typeName(types, id) {
  const t = (types || []).find((x) => x.id === id);
  return t ? t.name : '';
}

export function barShortLabel(bar) {
  return bar.kind === 'ex' ? `EX+${bar.number}` : String(bar.number);
}

export function barFullTitle(bar) {
  return bar.kind === 'ex' ? `第EX${bar.number}棒` : `第${bar.number}棒`;
}

export function cnNumber(n) {
  if (n >= 1 && n <= 10) return CN_NUM[n - 1];
  return `宣${n}`;
}

export function parseTime(input) {
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

export function parseTimeParts(hour, minute) {
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

export function splitTime(timeRaw, minutes) {
  const src = String(timeRaw || '').trim() || formatTime(minutes);
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(src);
  if (!m) return { hourInput: '', minuteInput: '' };
  return { hourInput: String(Number(m[1])), minuteInput: pad2(Number(m[2])) };
}

export function formatTime(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}

export function parseBarNumber(input) {
  const s = String(input == null ? '' : input).trim().replace(/[＋]/g, '+');
  if (!s) return { ok: false, error: '请填写接力棒数' };
  const m = /^(?:ex\s*\+?\s*)?(\d+)$/i.exec(s);
  if (!m) return { ok: false, error: '棒数应形如 128 或 EX+12' };
  const number = Number(m[1]);
  if (!Number.isInteger(number) || number < 1) return { ok: false, error: '棒数必须是正整数' };
  const kind = /^ex/i.test(s) ? 'ex' : 'normal';
  return { ok: true, kind, number };
}

export function validateProject(draft, projects) {
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

export function validateBar(draft, bars, selfId) {
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

export function suggestBarPrefill(data, project, kind) {
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

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + days);
  return todayString(dt);
}

export function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return '日一二三四五六'[new Date(y, m - 1, d).getDay()];
}
