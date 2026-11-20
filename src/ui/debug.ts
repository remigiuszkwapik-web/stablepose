import { countVisible } from '../analysis/frame';
import type { PoseFrame } from '../analysis/types';
import { config } from '../config';
import type { FrameStats } from '../pose/runner';
import { fmtInt, h } from './dom';

/** Ein- und ausklappbare Debug-Leiste. Zeigt Technik-Werte und (ab M3) Winkel und aktive Fehler. */
export class DebugBar {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private toggle: HTMLButtonElement;
  private open = false;
  private base = h('dl', { class: 'debug-grid' });
  private extra = h('dl', { class: 'debug-grid' });
  private lastRender = 0;

  constructor() {
    this.toggle = h('button', { type: 'button', class: 'debug-toggle', 'aria-expanded': 'false' }, 'Debug');
    this.body = h('div', { class: 'debug-body', hidden: true }, this.base, this.extra);
    this.el = h('div', { class: 'debug' }, this.toggle, this.body);
    this.toggle.addEventListener('click', () => {
      this.open = !this.open;
      this.body.hidden = !this.open;
      this.toggle.setAttribute('aria-expanded', String(this.open));
    });
  }

  update(frame: PoseFrame, stats: FrameStats, extraRows: [string, string, boolean?][] = []) {
    if (!this.open) return;
    const now = performance.now();
    if (now - this.lastRender < 150) return; // ~7 Hz reicht zum Ablesen
    this.lastRender = now;
    const good = countVisible(frame.image, config.pose.goodVisibility);
    rows(this.base, [
      ['fps', fmtInt(stats.fps)],
      ['Inferenz', `${fmtInt(stats.inferenceMs)} ms`],
      ['Modell', stats.model],
      ['Rechner', stats.delegate + (stats.fallbackReason ? ' (GPU fehlgeschlagen)' : '')],
      ['Punkte gut sichtbar', frame.image ? `${good} / 33` : 'keine Person'],
      ['Bild', `${frame.width} × ${frame.height}`],
    ]);
    rows(this.extra, extraRows);
  }
}

function rows(dl: HTMLElement, data: [string, string, boolean?][]) {
  dl.replaceChildren(
    ...data.flatMap(([k, v, alert]) => [h('dt', {}, k), h('dd', { class: alert ? 'alert' : '' }, v)]),
  );
}
