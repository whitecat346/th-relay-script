import { SCHEMA_VERSION, migrate, uid } from './model.js';

export const BACKUP_APP = 'th-relay-note';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function backupFileName(now = new Date()) {
  return `接力收集备份_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

export function buildBackup(data, now = new Date()) {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      counts: { projects: data.projects.length, bars: data.bars.length, types: data.types.length },
      data,
    },
    null,
    2,
  );
}

export function parseBackup(text) {
  let raw = null;
  try {
    raw = JSON.parse(String(text || ''));
  } catch {
    return { ok: false, error: '文件不是有效的 JSON' };
  }
  const payload = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!payload || typeof payload !== 'object' || (!Array.isArray(payload.projects) && !Array.isArray(payload.bars))) {
    return { ok: false, error: '文件不是接力收集的备份' };
  }
  const data = migrate(payload);
  return {
    ok: true,
    data,
    app: typeof raw.app === 'string' ? raw.app : '',
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    counts: { projects: data.projects.length, bars: data.bars.length, types: data.types.length },
  };
}

export function mergeData(current, incoming) {
  const base = migrate(current);
  const add = migrate(incoming);

  const types = base.types.slice();
  const idByName = new Map(types.map((t) => [t.name, t.id]));
  const usedTypeIds = new Set(types.map((t) => t.id));
  const typeIdMap = new Map();
  add.types.forEach((t) => {
    const name = String(t.name || '').trim();
    if (!name) return;
    if (idByName.has(name)) {
      typeIdMap.set(t.id, idByName.get(name));
      return;
    }
    const id = t.id && !usedTypeIds.has(t.id) ? t.id : uid('type');
    usedTypeIds.add(id);
    idByName.set(name, id);
    typeIdMap.set(t.id, id);
    types.push({ ...t, id, name });
  });

  const usedBarIds = new Set(base.bars.map((b) => b.id));
  const barIdMap = new Map();
  add.bars.forEach((b) => {
    const id = b.id && !usedBarIds.has(b.id) ? b.id : uid('bar');
    usedBarIds.add(id);
    barIdMap.set(b.id, id);
  });

  const projects = base.projects.slice();
  const usedProjectIds = new Set(projects.map((p) => p.id));
  const projectIdMap = new Map();
  add.projects.forEach((p) => {
    const id = p.id && !usedProjectIds.has(p.id) ? p.id : uid('relay');
    usedProjectIds.add(id);
    projectIdMap.set(p.id, id);
    const barOrder = Array.isArray(p.barOrder) ? p.barOrder.map((x) => barIdMap.get(x)).filter(Boolean) : [];
    projects.push({ ...p, id, barOrder });
  });

  const bars = base.bars.slice();
  add.bars.forEach((b) => {
    if (!projectIdMap.has(b.projectId)) return;
    const typeId = typeIdMap.get(b.typeId) || (types.some((t) => t.id === b.typeId) ? b.typeId : null);
    bars.push({ ...b, id: barIdMap.get(b.id), projectId: projectIdMap.get(b.projectId), typeId });
  });

  return migrate({ ...base, projects, bars, types, settings: base.settings });
}
