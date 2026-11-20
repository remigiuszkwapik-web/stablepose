import { countVisible } from '../analysis/frame';
import { config } from '../config';
import type { Controller, SessionUI } from './session';
import { h } from './dom';

/** M1: nur Live-Ansicht mit Skelett, ohne Test. */
export function liveController(ui: SessionUI): Controller {
  const info = h('p', { class: 'panel-text' }, 'Live-Ansicht. Stell dich so hin, dass du ganz im Bild bist.');
  ui.panel.replaceChildren(info);
  return {
    onFrame(frame) {
      const n = countVisible(frame.image, config.pose.goodVisibility);
      ui.setHint(frame.image ? null : 'Keine Person erkannt', 'warn');
      info.textContent = frame.image
        ? `Person erkannt · ${n} von 33 Punkten gut sichtbar`
        : 'Live-Ansicht. Stell dich so hin, dass du ganz im Bild bist.';
    },
  };
}
