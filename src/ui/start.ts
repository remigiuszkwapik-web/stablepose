import { config } from '../config';
import type { ModelVariant } from '../pose/landmarker';
import type { Facing } from '../pose/source';
import { h, segmented } from './dom';

export type TestKind = 'singleLeg' | 'posture' | 'live';

export interface StartSettings {
  test: TestKind;
  facing: Facing;
  model: ModelVariant;
}

/** Einstellungen bleiben nur im Speicher (kein localStorage). */
export const settings: StartSettings = { test: 'live', facing: 'user', model: config.pose.defaultModel };

export interface StartHandlers {
  tests: { value: TestKind; label: string; description: string }[];
  onCamera: () => void;
  onFile: (file: File) => void;
  onLicenses: () => void;
  error?: string;
}

export function renderStart(root: HTMLElement, hd: StartHandlers) {
  const fileInput = h('input', { type: 'file', accept: 'video/*', class: 'visually-hidden', tabindex: '-1' });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) hd.onFile(f);
  });

  const testList =
    hd.tests.length > 1
      ? h(
          'div',
          { class: 'field' },
          h('div', { class: 'label' }, 'Test'),
          h(
            'div',
            { class: 'choice-list', role: 'radiogroup', 'aria-label': 'Test' },
            ...hd.tests.map((t) => {
              const b = h(
                'button',
                { type: 'button', role: 'radio', class: 'choice', 'aria-checked': String(settings.test === t.value) },
                h('span', { class: 'choice-title' }, t.label),
                h('span', { class: 'choice-desc' }, t.description),
              );
              b.addEventListener('click', () => {
                settings.test = t.value;
                b.parentElement!.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
              });
              return b;
            }),
          ),
        )
      : null;
  if (hd.tests.length === 1) settings.test = hd.tests[0].value;
  if (!hd.tests.some((t) => t.value === settings.test)) settings.test = hd.tests[0].value;

  root.replaceChildren(
    h(
      'main',
      { class: 'screen start' },
      h('header', { class: 'brand' }, h('h1', { class: 'wordmark' }, 'Stand'), h('p', { class: 'muted' }, 'Bewegungs-Check fürs Training · Prototyp')),
      hd.error ? h('div', { class: 'notice warn', role: 'alert' }, hd.error) : null,
      h(
        'section',
        { class: 'card' },
        testList,
        segmented<Facing>('Kamera', [{ value: 'user', label: 'Vorne' }, { value: 'environment', label: 'Hinten' }], settings.facing, (v) => (settings.facing = v)),
        segmented<ModelVariant>('Modell', [{ value: 'full', label: 'Full · genauer' }, { value: 'lite', label: 'Lite · schneller' }], settings.model, (v) => (settings.model = v)),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'btn primary', onclick: hd.onCamera }, 'Kamera starten'),
          h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Video laden'),
          fileInput,
        ),
      ),
      h(
        'footer',
        { class: 'foot' },
        h('p', {}, 'Alles läuft lokal auf diesem Gerät. Kein Bild, kein Video und keine Messung wird hochgeladen.'),
        h('p', {}, 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training.'),
        h('button', { type: 'button', class: 'link', onclick: hd.onLicenses }, 'Lizenzen'),
      ),
    ),
  );
}
