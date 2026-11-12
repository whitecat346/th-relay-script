export const CSS = `
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
  position: fixed; right: 0; top: 42%; z-index: 2147483000;
  writing-mode: vertical-rl; letter-spacing: 3px;
  padding: 14px 8px; border-radius: 10px 0 0 10px;
  background: linear-gradient(160deg, #7f6ff0, #6250d4);
  color: #fff; font-size: 13px; font-weight: 600;
  box-shadow: -2px 4px 14px rgba(107, 91, 219, 0.35);
  user-select: none; touch-action: none;
}
.trn-tab:hover { background: linear-gradient(160deg, #8b7af5, #6b58e0); }

.trn-backdrop { position: fixed; inset: 0; z-index: 2147483000; background: rgba(20, 21, 31, 0.28); }
.trn-backdrop.clear { background: transparent; }

.trn-panel {
  position: fixed; right: 18px; z-index: 2147483001;
  width: 338px; max-height: 84vh; overflow: auto;
  background: var(--trn-bg); border-radius: 18px; box-shadow: var(--trn-shadow);
  padding: 20px 20px 4px;
}
.trn-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
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
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
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
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
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
