export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function field({ label, name, value = '', placeholder = '', hint = '', error = '', half = false, type = 'text', textarea = false, extraClass = '', note = '', disabled = false }) {
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

export function modalShell({ title, badge = '', subtitle = '', width = 560, body = '', footer = '', footNote = '', scroll = false }) {
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
    <div class="trn-card-body" data-scroll="card" style="${scroll ? 'max-height:58vh' : ''}">${body}</div>
    <div class="trn-card-foot">
      <span class="trn-foot-note">${esc(footNote)}</span>
      <div style="display:flex;gap:10px">${footer}</div>
    </div>
  </div>`;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}
