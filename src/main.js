import { mount } from './ui/app.js';

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
