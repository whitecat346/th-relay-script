const pageWindow = () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

function currentHref() {
  return String(location.href || '');
}

export function detectPage(href = currentHref()) {
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

function fromStateVideo() {
  const state = pageWindow().__INITIAL_STATE__;
  const data = state && state.videoData;
  return pickOwner(data && data.owner);
}

function fromStateRead() {
  const state = pageWindow().__INITIAL_STATE__;
  if (!state) return null;
  const info = state.readInfo || {};
  const candidates = [
    info.author,
    state.readInfo && state.readInfo.author,
    info.authorInfo,
    info.up_info && info.up_info.author,
    state.upInfo && state.upInfo.author,
  ].filter(Boolean);
  for (const c of candidates) {
    const owner = pickOwner(c);
    if (owner) return owner;
  }
  if (info.author_name || info.mid) {
    return { authorName: String(info.author_name || '').trim(), authorLink: space(info.mid) };
  }
  return null;
}

function fromStateOpus() {
  const state = pageWindow().__INITIAL_STATE__;
  const detail = state && (state.detail || state.dynamic);
  if (!detail) return null;
  const modules = detail.modules || (detail.item && detail.item.modules) || [];
  const author = modules.find((m) => m && (m.module_type === 'MODULE_TYPE_AUTHOR' || m.module_author));
  const ma = author && (author.module_author || author);
  return pickOwner(ma);
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

export async function scrapeCurrentPage() {
  const page = detectPage();
  const result = {
    pageType: page.type,
    workLink: page.type ? page.url : '',
    authorName: '',
    authorLink: '',
    source: '',
  };
  if (!page.type) return result;

  const fromState = page.type === 'video' ? fromStateVideo : page.type === 'read' ? fromStateRead : fromStateOpus;
  try {
    const owner = fromState();
    if (owner && (owner.authorName || owner.authorLink)) {
      return { ...result, ...owner, source: 'state' };
    }
  } catch {}

  try {
    let owner = null;
    if (page.type === 'video') {
      const json = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${page.id}`);
      owner = pickOwner(json.data && json.data.owner);
    } else if (page.type === 'read') {
      const json = await fetchJson(`https://api.bilibili.com/x/article/viewinfo?id=cv${page.id}`);
      const d = json.data || {};
      owner = { authorName: String(d.author_name || d.name || '').trim(), authorLink: space(d.mid) };
    } else {
      const json = await fetchJson(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=${page.id}`);
      const item = (json.data && json.data.item) || {};
      const author = (item.modules || []).find((m) => m && m.module_type === 'MODULE_TYPE_AUTHOR');
      const ma = author && (author.module_author || author);
      owner = pickOwner(ma);
    }
    if (owner && (owner.authorName || owner.authorLink)) {
      return { ...result, ...owner, source: 'api' };
    }
  } catch {}

  try {
    const owner = fromDom();
    if (owner) return { ...result, ...owner, source: 'dom' };
  } catch {}

  return result;
}
