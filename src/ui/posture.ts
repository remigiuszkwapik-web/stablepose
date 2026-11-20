import { checkPosition, type View } from '../analysis/position';
import {
  asymmetries, directionText, METRIC_LABELS, summarizeView, VIEW_KEYS, viewSample,
  type MetricKey, type ViewSample,
} from '../analysis/postureViews';
import { countdownLeft, initFlow, measureLeft, stepFlow, type FlowConfig, type FlowState } from '../analysis/singleLegFlow';
import { mean } from '../analysis/smoothing';
import { config } from '../config';
import { DeviceTiltWatcher } from './deviceOrientation';
import { fmtDec, fmtInt, h, nodes } from './dom';
import type { Controller, SessionUI } from './session';

type Step = 'intro' | 'run' | 'viewDone' | 'summary';

const VIEWS: View[] = ['front', 'side', 'back'];
const VIEW_NAME: Record<View, string> = { front: 'Vorne', side: 'Seitlich', back: 'Hinten' };
const VIEW_INSTRUCTION: Record<View, string[]> = {
  front: ['Stell dich frontal zur Kamera, Kopf bis Füße im Bild.', 'Arme locker hängen lassen, Füße hüftbreit.', 'Geradeaus schauen.'],
  side: ['Dreh dich um 90° zur Seite – egal ob nach links oder rechts.', 'Arme locker hängen lassen.', 'Geradeaus schauen, nicht zur Kamera.'],
  back: ['Dreh der Kamera den Rücken zu.', 'Arme locker hängen lassen, Füße hüftbreit.', 'Haare möglichst aus dem Nacken.'],
};

const TILT_WARNING = 'Alle Winkel beziehen sich auf das Kamerabild. Steht das Handy schief, verschiebt sich jeder Wert um genau diesen Winkel. Stell das Handy senkrecht und gerade auf.';

type Results = Partial<Record<View, Partial<Record<MetricKey, number>>>>;

/** Wert rechts: Gradzahl in Mono, Richtung in Geist darunter. */
function valueCell(deg: number, text: string) {
  if (!Number.isFinite(deg)) return h('span', { class: 'kv-val muted' }, 'nicht gemessen');
  return h('span', { class: 'kv-val' }, h('span', { class: 'num kv-deg' }, `${Math.abs(deg)}°`), h('span', { class: 'kv-dir' }, text));
}

/** Haltung: vorne, seitlich, hinten nacheinander, je 3 s; danach Übersicht. Nur Werte, keine Bewertung. */
export function postureController(ui: SessionUI): Controller {
  let step: Step = 'intro';
  let viewIdx = 0;
  let flow: FlowState | null = null;
  let samples: ViewSample[] = [];
  let rolls: number[] = [];
  let swappedFrames = 0;
  const results: Results = {};
  const rollByView: Partial<Record<View, number>> = {};
  const tilt = new DeviceTiltWatcher();
  let tiltOn = false;
  const flowCfg: FlowConfig = {
    stableMs: config.position.stableMs,
    countdownS: config.posture.countdownS,
    durationS: config.posture.durationS,
    startPoseHoldMs: 0,
    lostGraceMs: 1000,
  };
  const tiltLine = h('p', { class: 'panel-text num' });
  const view = () => VIEWS[viewIdx];

  const updateTiltLine = () => {
    const t = tilt.latest;
    if (!tiltOn) tiltLine.textContent = '';
    else if (!t) tiltLine.textContent = 'Geräteneigung: keine Daten';
    else {
      const roll = Math.abs(Math.round(t.roll));
      const ok = roll <= config.posture.deviceTiltHintDeg;
      tiltLine.textContent = `Handy seitlich geneigt: ${roll}°${ok ? '' : ' – bitte gerade stellen'}`;
      tiltLine.dataset.tone = ok ? 'ok' : 'warn';
    }
  };

  function setBig(number?: string, label?: string) {
    if (number === undefined && label === undefined) return ui.big.replaceChildren();
    ui.big.className = 'bigview';
    ui.big.replaceChildren(...nodes(number !== undefined ? h('div', { class: 'big-number' }, number) : null, label ? h('div', { class: 'big-label' }, label) : null));
  }

  function valueRows(v: View, r: Partial<Record<MetricKey, number>>) {
    return h(
      'ul',
      { class: 'kv' },
      ...VIEW_KEYS[v].map((k) => {
        const val = r[k] ?? NaN;
        return h('li', {}, h('span', {}, METRIC_LABELS[v][k]!), valueCell(val, directionText(v, k, val)));
      }),
    );
  }

  function showIntro() {
    step = 'intro';
    if (import.meta.env.DEV) (window as unknown as { __syntheticView?: View }).__syntheticView = view(); // nur synthetische Testperson
    flow = null;
    setBig();
    ui.setHint(null);
    const v = view();
    const tiltBtn = DeviceTiltWatcher.supported && !tiltOn
      ? h('button', { type: 'button', class: 'btn', onclick: async () => { tiltOn = await tilt.start(); showIntro(); } }, 'Geräteneigung anzeigen')
      : null;
    updateTiltLine();
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, `Haltung · ${VIEW_NAME[v]} (${viewIdx + 1} von 3)`),
        h('ol', { class: 'steps' }, ...VIEW_INSTRUCTION[v].map((t) => h('li', {}, t)), h('li', {}, `Ruhig stehen. ${config.posture.durationS} Sekunden.`)),
        viewIdx === 0 ? h('p', { class: 'notice warn small' }, TILT_WARNING) : null,
        tiltLine,
        tiltBtn,
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: nextView }, viewIdx < 2 ? 'Überspringen' : 'Zur Übersicht'),
          h('button', { type: 'button', class: 'btn primary big', onclick: startRun }, 'Los'),
        ),
      ),
    );
  }

  function startRun() {
    step = 'run';
    flow = null;
    samples = [];
    rolls = [];
    swappedFrames = 0;
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, `${VIEW_NAME[view()]}: ruhig stehen. Die Messung startet automatisch.`),
      tiltLine,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: showIntro }, 'Abbrechen')),
    );
  }

  function nextView() {
    if (viewIdx < VIEWS.length - 1) {
      viewIdx += 1;
      showIntro();
    } else showSummary();
  }

  function showViewDone() {
    step = 'viewDone';
    setBig();
    const v = view();
    const r = summarizeView(samples, v);
    results[v] = r;
    const roll = mean(rolls);
    if (Number.isFinite(roll)) rollByView[v] = roll;
    ui.setHint(`${VIEW_NAME[v]} gemessen`, 'ok');
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, `${VIEW_NAME[v]}`),
        valueRows(v, r),
        Number.isFinite(roll) ? h('p', { class: 'panel-text num' }, `Handy war ${Math.abs(Math.round(roll))}° seitlich geneigt.`) : null,
        v === 'back' && swappedFrames > samples.length / 2
          ? h('p', { class: 'muted small' }, 'Hinweis: Die Körperseiten wurden von hinten automatisch richtig zugeordnet.')
          : null,
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: startRun }, 'Wiederholen'),
          h('button', { type: 'button', class: 'btn primary big', onclick: nextView }, viewIdx < 2 ? `Weiter: ${VIEW_NAME[VIEWS[viewIdx + 1]]}` : 'Zur Übersicht'),
        ),
      ),
    );
  }

  function showSummary() {
    step = 'summary';
    setBig();
    ui.setHint('Haltung – Übersicht', 'ok');
    const measured = VIEWS.filter((v) => results[v]);
    const list = asymmetries(results);
    const rolls = Object.values(rollByView).filter((x): x is number => x !== undefined);
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, 'Übersicht Haltung'),
        h('p', { class: 'panel-text' }, 'Abweichungen von der Waagerechten bzw. vom Lot, größte zuerst. Nur Werte, keine Bewertung.'),
        list.length
          ? h('ul', { class: 'kv' }, ...list.map((i) => h('li', {}, h('span', {}, `${VIEW_NAME[i.view]} · ${i.label}`), valueCell(i.deg, i.text))))
          : h('p', { class: 'panel-text' }, measured.length ? 'Keine Abweichung ab 1°.' : 'Keine Ansicht gemessen.'),
        ...measured.map((v) => h('details', {}, h('summary', {}, `${VIEW_NAME[v]} – alle Werte`), valueRows(v, results[v]!))),
        rolls.length ? h('p', { class: 'panel-text num' }, `Handy seitlich geneigt: ${rolls.map((r) => `${Math.abs(Math.round(r))}°`).join(' / ')}`) : null,
        h('p', { class: 'notice warn small' }, TILT_WARNING),
        h('p', { class: 'muted small' }, 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training. Kleidung und Haare beeinflussen die erkannten Punkte.'),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => { viewIdx = 0; for (const v of VIEWS) delete results[v]; showIntro(); } }, 'Noch einmal von vorn'),
        ),
      ),
    );
  }

  showIntro();

  return {
    dispose() {
      tilt.stop();
    },
    onFrame(frame) {
      updateTiltLine();
      const v = view();
      const { sample, meta } = viewSample(frame, v);
      const pos = checkPosition(frame, undefined, v);
      ui.setDebugRows([
        ['Ansicht', VIEW_NAME[v]],
        ['Phase', flow?.phase ?? step],
        ['Position', pos.ok ? 'ok' : pos.issues.join(', '), !pos.ok],
        ['Schulter/Rumpf', fmtDec(pos.metrics.shoulderRatio)],
        ...VIEW_KEYS[v].map((k): [string, string] => [METRIC_LABELS[v][k]!, `${fmtDec(sample[k] ?? NaN, 1)}°`]),
        ...(v === 'side' ? [['Seite zur Kamera / Blick', `${meta.near ?? '–'} / ${meta.facing ?? '–'}`] as [string, string]] : []),
        ...(v === 'back' ? [['Links/rechts getauscht', meta.swapped ? 'ja' : 'nein'] as [string, string]] : []),
        ['Gerät roll / pitch', tilt.latest ? `${fmtInt(tilt.latest.roll)}° / ${fmtInt(tilt.latest.pitch)}°` : '–'],
        ['Frames gemessen', String(samples.length)],
      ]);
      if (step !== 'run') return;
      flow ??= initFlow(frame.t);
      flow = stepFlow(flow, { t: frame.t, positionOk: pos.ok, startPose: true }, flowCfg);
      switch (flow.phase) {
        case 'check':
          ui.setHint(pos.message ?? 'Gut so – kurz stillhalten', pos.ok ? 'ok' : 'warn');
          setBig();
          break;
        case 'countdown':
          ui.setHint(pos.ok ? 'Position passt' : pos.message, pos.ok ? 'ok' : 'warn');
          setBig(String(countdownLeft(flow, frame.t, flowCfg)), 'Ruhig stehen');
          break;
        case 'ready':
          break;
        case 'measuring':
          // Nur Frames mit passender Position zählen; sonst „nicht messbar“.
          samples.push(pos.ok ? sample : {});
          if (meta.swapped) swappedFrames += 1;
          if (tilt.latest) rolls.push(tilt.latest.roll);
          ui.setHint(pos.ok ? 'Messung läuft' : pos.message, pos.ok ? 'info' : 'warn');
          setBig(String(measureLeft(flow, flowCfg)), 'Sekunden');
          break;
        case 'done':
          showViewDone();
          break;
      }
    },
  };
}
