import { SCHEMA_VERSION, migrate } from './model.js';

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

function rawWriteKey(key, value) {
  const text = JSON.stringify(value);
  if (HAS_GM) GM_setValue(key, text);
  else window.localStorage.setItem(key, text);
}

function rawWrite(value) {
  rawWriteKey(KEY, value);
}

export function saveSnapshot(data) {
  rawWriteKey(`${KEY}__preImportAt`, { at: Date.now(), data });
}

export function loadData() {
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

export function saveData(data) {
  rawWrite(data);
}

export function onExternalChange(callback) {
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
