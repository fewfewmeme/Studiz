// The sandboxed iframe + its message bus. The parent accepts messages only from this frame's window (origin is "null").
import { h } from '../util.js';

export class FrameHost {
  constructor(id, onMessage) {
    this.id = id; this.onMessage = onMessage; this.ready = false; this.url = null; this.mode = 'blob';
    this.iframe = h('iframe', { class: 'lz-frame', title: 'Документ', sandbox: 'allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer', tabindex: '0' });
    this._on = e => {
      if (e.source !== this.iframe.contentWindow) return;
      const d = e.data;
      // the embedded-timer contract: a конспект emits {type:'studiz:block-start|pause|complete|cancel', blockId, minutes}
      if (d && typeof d.type === 'string' && d.type.startsWith('studiz:block-')) { this.onMessage?.({ type: 'origtimer', ev: d.type.slice('studiz:block-'.length), minutes: d.minutes, blockId: d.blockId }); return; }
      if (!d || d.lz !== 1 || d.id !== this.id) return;
      if (d.type === 'ready') { this.ready = true; this._res?.(d); this._res = null; }
      this.onMessage?.(d);
    };
    addEventListener('message', this._on);
  }
  // returns the 'ready' message (or rejects after `timeout`)
  load(html, timeout = 6000) {
    this.ready = false;
    return new Promise((res, rej) => {
      let tries = 0, timer = null;
      this._res = d => { clearTimeout(timer); res(d); };
      const start = srcdoc => {
        if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
        if (srcdoc) { this.mode = 'srcdoc'; this.iframe.removeAttribute('src'); this.iframe.srcdoc = html; }
        else { this.mode = 'blob'; this.url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); this.iframe.removeAttribute('srcdoc'); this.iframe.src = this.url; }
      };
      const watchdog = () => {
        if (this.dead) return;
        if (tries === 0) { tries = 1; start(true); timer = setTimeout(watchdog, timeout); }   // WebKit refused the Blob URL: srcdoc
        else rej(new Error('Документ не отвечает'));
      };
      timer = setTimeout(watchdog, timeout);
      start(false);
    });
  }
  send(cmd, data) { try { this.iframe.contentWindow?.postMessage({ lz: 1, cmd, ...(data || {}) }, '*'); } catch { /* frame gone */ } }
  focus() { try { this.iframe.contentWindow?.focus(); } catch { /* ignore */ } }
  destroy() {
    this.dead = true; this._res = null;
    removeEventListener('message', this._on);
    if (this.url) URL.revokeObjectURL(this.url);
    this.iframe.remove();
  }
}
