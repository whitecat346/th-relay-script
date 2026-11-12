import {
  barFullTitle,
  barShortLabel,
  formatTime,
  parseTime,
  parseTimeParts,
  projectBars,
  sortBars,
  splitTime,
  suggestBarPrefill,
  todayString,
  typeName,
  uid,
  validateBar,
  validateProject,
} from '../core/model.js';
import { buildMarkdown, exportFileName } from '../core/export-md.js';
import { loadData, onExternalChange, saveData } from '../core/storage.js';
import { detectPage, scrapeCurrentPage } from '../core/scrape.js';
import { downloadText, idbGetHandle, pickDirectory, saveToDirectory, supportsDirectory } from '../core/export-file.js';
import { CSS } from './styles.js';
import { esc, field, modalShell } from './dom.js';

const PAGE_SIZE = 20;

const state = {
  data: null,
  view: 'closed',
  bigTab: 'projects',
  modal: null,
  manage: { projectId: null, search: '', filter: 'all', page: 1 },
  toast: null,
  pinned: false,
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

export function mount(host, options = {}) {
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

function render() {
  if (!root) return;
  const pos = Number(state.data.settings.panelPosition) || 42;
  root.className = `trn-root${document.documentElement.classList.contains('bili_dark') ? ' trn-dark' : ''}`;
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
    <div class="trn-panel-head">
      <div>
        <div class="trn-title">接力收集</div>
        <div class="trn-sub">在 BiliBili，接住每一份创作。</div>
      </div>
      <button class="trn-x" data-act="close-panel" title="关闭">✕</button>
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
  const head = `<div class="trn-big-head">
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
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, state.manage.page), totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isBound = project.id === state.data.settings.boundProjectId;
  const trs = pageRows
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
        pageRows.length
          ? `<table class="trn-table">
        <thead><tr><th style="width:74px">棒数</th><th style="width:110px">作者</th><th style="width:82px">类型</th><th style="width:130px">接力时间</th><th style="width:82px">作品</th><th style="width:110px">操作</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`
          : `<div class="trn-empty">${all.length ? '没有符合条件的棒' : '还没有接力棒，点「＋ 添加棒」开始记录'}</div>`
      }
    </div>
    <div class="trn-pager">
      <span>共 ${rows.length} 棒，普通棒与 EX 棒独立编号</span>
      <div class="trn-pager-controls"><span>${page} / ${totalPages}</span></div>
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
  if (!scraped.authorName && !scraped.workLink) {
    state.modal = { ...m, scrapeMessage: page.type ? '未识别当前页面的作者，请手动填写' : '当前不是作品页面，请手动填写' };
  } else {
    state.modal = {
      ...m,
      draft: { ...m.draft, authorName: scraped.authorName || '', authorLink: scraped.authorLink || '', workLink: scraped.workLink || '' },
      scrapeMessage: `已从${scraped.source === 'state' ? '页面数据' : scraped.source === 'api' ? '官方接口' : '页面元素'}填充作者与作品链接${prefill.note ? `；${prefill.note}` : ''}`,
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
  if (state.view === 'panel' && state.pinned) {
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

  root.addEventListener('mouseover', (e) => {
    if (!e.target.closest('.trn-tab')) return;
    if (state.view !== 'closed') return;
    state.view = 'panel';
    render();
  });

  root.addEventListener('mouseout', (e) => {
    if (state.pinned || state.view !== 'panel') return;
    const panel = e.target.closest('.trn-panel');
    if (!panel) return;
    if (e.relatedTarget && panel.contains(e.relatedTarget)) return;
    state.view = 'closed';
    render();
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
      state.manage.page = 1;
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
      } else if (state.view === 'big') {
        state.view = 'panel';
        render();
      } else if (state.view === 'panel') {
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
    case 'close-panel':
      state.pinned = false;
      state.view = 'closed';
      render();
      break;
    case 'close-big':
      if (state.bigTab === 'settings') {
        state.bigTab = 'projects';
        render();
      } else {
        state.view = 'panel';
        render();
      }
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
      state.manage.page = 1;
      render();
      break;
    case 'filter':
      state.manage.filter = id;
      state.manage.page = 1;
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
