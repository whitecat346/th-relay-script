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

export const idbGetHandle = () => idb('readonly', (store) => store.get(HANDLE_KEY));
export const idbSetHandle = (handle) => idb('readwrite', (store) => store.put(handle, HANDLE_KEY));
export const idbClearHandle = () => idb('readwrite', (store) => store.delete(HANDLE_KEY));

export function supportsDirectory() {
  const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  return typeof w.showDirectoryPicker === 'function';
}

export async function pickDirectory() {
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

export async function saveToDirectory(dir, filename, text) {
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

export function downloadText(text, filename, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
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
