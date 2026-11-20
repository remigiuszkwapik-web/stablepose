import apache from '../../licenses/APACHE-2.0.txt?raw';
import ofl from '../../licenses/OFL-1.1-Geist.txt?raw';
import { h } from './dom';

export function renderLicenses(root: HTMLElement, onBack: () => void) {
  root.replaceChildren(
    h(
      'main',
      { class: 'screen' },
      h('div', { class: 'screen-head' }, h('button', { type: 'button', class: 'btn ghost small', onclick: onBack }, 'Zurück'), h('h1', {}, 'Lizenzen')),
      h(
        'section',
        { class: 'card prose' },
        h('h2', {}, 'MediaPipe Tasks Vision'),
        h('p', {}, 'Copyright The MediaPipe Authors (Google LLC). Lizenziert unter der Apache License, Version 2.0. Verwendet für die Erkennung der Körperpunkte. Bibliothek und WebAssembly-Dateien werden unverändert mit dieser App ausgeliefert.'),
        h('h2', {}, 'Pose-Landmarker-Modelle (Lite, Full)'),
        h('p', {}, 'Copyright Google LLC. Lizenziert unter der Apache License, Version 2.0. Die Modelle werden unverändert mit dieser App ausgeliefert.'),
        h('h2', {}, 'Geist und Geist Mono'),
        h('p', {}, 'Copyright 2023 Vercel, in Zusammenarbeit mit basement.studio. Lizenziert unter der SIL Open Font License, Version 1.1.'),
        h('p', { class: 'muted small' }, '„MediaPipe“ und „Google“ sind Marken der Google LLC. Diese App ist kein Produkt von Google und wird von Google weder unterstützt noch empfohlen.'),
      ),
      h('details', { class: 'card' }, h('summary', {}, 'Apache License 2.0 – Volltext'), h('pre', { class: 'license' }, apache)),
      h('details', { class: 'card' }, h('summary', {}, 'SIL Open Font License 1.1 – Volltext'), h('pre', { class: 'license' }, ofl)),
    ),
  );
  window.scrollTo(0, 0);
}
