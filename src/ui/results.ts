import { ERROR_LABELS, ERROR_TYPES } from '../analysis/bess';
import { exportFileName, sideDifference, summarize, toCSV, toJSON, type SideSummary, type TrialRecord } from '../analysis/results';
import { config } from '../config';
import { fmtInt, h } from './dom';

const VERSION = '0.1.0';

/** Startet einen lokalen Download. Nichts wird hochgeladen. */
function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sideCard(s: SideSummary) {
  const label = s.stand === 'left' ? 'Standbein links' : 'Standbein rechts';
  return h(
    'div',
    { class: 'side-card' },
    h('div', { class: 'label' }, label),
    s.trials.length
      ? h('div', { class: 'stat' }, h('span', { class: 'stat-value num' }, fmtInt(s.mean)), h('span', { class: 'stat-label' }, 'Fehler im Mittel'))
      : h('div', { class: 'stat' }, h('span', { class: 'stat-value num muted' }, '–'), h('span', { class: 'stat-label' }, 'nicht gemessen')),
    s.trials.length
      ? h('ul', { class: 'kv' }, ...s.trials.map((t) => h('li', {}, h('span', {}, `Versuch ${t.trial}`), h('span', { class: 'num' }, String(t.errors)))))
      : null,
  );
}

export function renderResults(root: HTMLElement, records: TrialRecord[], onNew: () => void) {
  const left = summarize(records, 'left');
  const right = summarize(records, 'right');
  const diff = sideDifference(left, right);
  const date = records.length ? new Date(records[0].date) : new Date();
  const exportMeta = () => ({
    app: 'Stand',
    version: VERSION,
    test: 'Einbeinstand (BESS-Fehlerkriterien, Augen offen)',
    exportedAt: new Date().toISOString(),
    hinweis: 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training.',
    config: config.singleLeg,
  });

  const detailRows = records.map((r) =>
    h(
      'tr',
      {},
      h('td', {}, `${r.stand === 'left' ? 'L' : 'R'} ${r.trial}`),
      h('td', { class: 'num' }, String(r.errors)),
      ...ERROR_TYPES.map((t) => h('td', { class: 'num' }, String(r.byType[t]))),
      h('td', { class: 'num' }, `${r.unmeasurablePct} %`),
    ),
  );

  root.replaceChildren(
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'screen-head' },
        h('h1', {}, 'Ergebnis Einbeinstand'),
      ),
      h('p', { class: 'muted' }, `${date.toLocaleDateString('de-DE')} · ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${config.singleLeg.durationS} s pro Versuch · Augen offen`),
      h('section', { class: 'compare' }, sideCard(left), sideCard(right)),
      Number.isFinite(diff)
        ? h('div', { class: 'card diff' }, h('span', { class: 'label' }, 'Unterschied links / rechts'), h('span', { class: 'num diff-value' }, `${fmtInt(diff)} ${diff === 1 ? 'Fehler' : 'Fehler'}`))
        : null,
      h('p', { class: 'notice' }, 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training.'),
      h(
        'details',
        { class: 'card' },
        h('summary', {}, 'Fehler je Versuch und Typ'),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Versuch'), h('th', {}, 'Gesamt'), ...ERROR_TYPES.map((t) => h('th', {}, ERROR_LABELS[t])), h('th', {}, 'Nicht auswertbar'))),
            h('tbody', {}, ...detailRows),
          ),
        ),
        h('p', { class: 'muted small' }, 'Ferse/Vorfuß ist experimentell und nicht in „Gesamt“ enthalten. „Augen geöffnet“ wird nicht gemessen. Höchstens 10 Fehler pro Versuch.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'label' }, 'Export'),
        h('p', { class: 'muted small' }, 'Die Datei wird nur auf diesem Gerät gespeichert. Ohne Export werden die Messwerte beim Verlassen verworfen.'),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => download(toCSV(records), exportFileName(date, 'csv'), 'text/csv;charset=utf-8') }, 'CSV exportieren'),
          h('button', { type: 'button', class: 'btn', onclick: () => download(toJSON(records, exportMeta()), exportFileName(date, 'json'), 'application/json') }, 'JSON exportieren'),
        ),
      ),
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => {
          if (confirm('Neuen Test starten? Nicht exportierte Werte gehen verloren.')) onNew();
        },
      }, 'Neuer Test'),
    ),
  );
  window.scrollTo(0, 0);
}
