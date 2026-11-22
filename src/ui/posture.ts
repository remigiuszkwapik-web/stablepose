import { checkPosition, type View } from '../analysis/position';
import {
  asymmetries, directionText, meanPoints, METRIC_LABELS, overlayLines, summarizeView, VIEW_KEYS, viewSample,
  type MetricKey, type ViewSample,
} from '../analysis/postureViews';
import type { Pt } from '../analysis/types';
import { countdownLeft, initFlow, measureLeft, stepFlow, type FlowConfig, type FlowState } from '../analysis/singleLegFlow';
import { mean } from '../analysis/smoothing';
import { config } from '../config';
import { DeviceTiltWatcher } from './deviceOrientation';
import { fmtDec, fmtInt, h, nodes } from './dom';
import type { Controller, SessionUI } from './session';

type Step = 'intro' | 'run' | 'viewDone' | 'summary';

/**
 * Schritte: vorne und seitlich (Standard), optional die andere Seite (Seitenvergleich).
 * Die Rückansicht ist bewusst nicht mehr im Ablauf: Sie liefert mit Gelenkpunkten dieselben Werte
 * wie vorne, wird schlechter erkannt und kann links/rechts vertauschen (siehe DECISIONS.md).
 */
type StepKey = 'front' | 'side' | 'side2';
const VIEW_OF: Record<StepKey, View> = { front: 'front', side: 'side', side2: 'side' };
const BASE_STEPS: StepKey[] = ['front', 'side'];
const SIDE_NAME = { left: 'linke Seite', right: 'rechte Seite' } as const;
const VIEW_INSTRUCTION: Record<StepKey, string[]> = {
  front: ['Stell dich frontal zur Kamera, Kopf bis Füße im Bild.', 'Arme locker hängen lassen, Füße hüftbreit.', 'Geradeaus schauen.'],
  side: ['Dreh dich um 90° zur Seite – egal ob nach links oder rechts.', 'Arme locker hängen lassen.', 'Geradeaus schauen, nicht zur Kamera.'],
  side2: ['Dreh dich um 180°, sodass jetzt die andere Körperseite zur Kamera zeigt.', 'Arme locker hängen lassen.', 'Geradeaus schauen, nicht zur Kamera.'],
};

const TILT_WARNING = 'Alle Winkel beziehen sich auf das Kamerabild. Steht das Handy schief, verschiebt sich jeder Wert um genau diesen Winkel. Stell das Handy senkrecht und gerade auf.';

type Results = Partial<Record<StepKey, Partial<Record<MetricKey, number>>>>;

/** Wert rechts: Gradzahl in Mono, Richtung in Geist darunter. */
function valueCell(deg: number, text: string) {
  if (!Number.isFinite(deg)) return h('span', { class: 'kv-val muted' }, 'nicht gemessen');
  return h('span', { class: 'kv-val' }, h('span', { class: 'num kv-deg' }, `${Math.abs(deg)}°`), h('span', { class: 'kv-dir' }, text));
}

/** Vergleich der beiden Seitansichten: Werte je Körperseite und Unterschied. Keine Bewertung. */
function sideCompare(a: Partial<Record<MetricKey, number>>, b: Partial<Record<MetricKey, number>>, aNear: 'left' | 'right') {
  const left = aNear === 'left' ? a : b;
  const right = aNear === 'left' ? b : a;
  const cell = (v: number | undefined) => h('td', { class: 'num' }, v !== undefined && Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v}°` : '–');
  return h(
    'div',
    { class: 'table-wrap' },
    h('p', { class: 'label' }, 'Seitenvergleich (+ = nach vorn)'),
    h(
      'table',
      { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Links'), h('th', {}, 'Rechts'), h('th', {}, 'Unterschied'))),
      h('tbody', {}, ...VIEW_KEYS.side.map((k) => {
        const l = left[k], r = right[k];
        const d = l !== undefined && r !== undefined && Number.isFinite(l) && Number.isFinite(r) ? Math.abs(l - r) : NaN;
        return h('tr', {}, h('td', {}, METRIC_LABELS.side[k]!), cell(l), cell(r), h('td', { class: 'num' }, Number.isFinite(d) ? `${d}°` : '–'));
      })),
    ),
  );
}

/** Haltung: vorne und seitlich (optional andere Seite), je 3 s; danach Übersicht. Nur Werte, keine Bewertung. */
export function postureController(ui: SessionUI): Controller {
  let step: Step = 'intro';
  let steps: StepKey[] = [...BASE_STEPS];
  let viewIdx = 0;
  let flow: FlowState | null = null;
  let samples: ViewSample[] = [];
  let rolls: number[] = [];
  let swappedFrames = 0;
  let measuredPts: Pt[][] = [];
  /** Notlösung: Positionscheck übergehen (nur Person muss erkannt sein). */
  let override = false;
  const overrideUsed: Partial<Record<StepKey, boolean>> = {};
  const overrideBtn = h('button', { type: 'button', class: 'btn', hidden: true, onclick: () => { override = true; overrideBtn.hidden = true; } }, 'Trotzdem messen');
  let nearVotes = { left: 0, right: 0 };
  /** Gemittelte Punkte der letzten Messung je Ansicht, für die Linien im Bild. */
  const shown: Partial<Record<StepKey, { pts: Pt[]; near: 'left' | 'right' }>> = {};
  const results: Results = {};

  // Nach der Messung: gemessene Linien (grün) und Bezugslinien (gestrichelt) ins Bild zeichnen.
  ui.setOverlay((ctx) => {
    if (step !== 'viewDone') return;
    const d = shown[key()];
    if (!d) return;
    const unit = Math.max(ctx.canvas.width, ctx.canvas.height) / 640;
    ctx.save();
    ctx.lineCap = 'round';
    for (const ln of overlayLines(view(), d.pts, d.near)) {
      ctx.strokeStyle = ln.kind === 'measured' ? '#5CC9A8' : 'rgba(232, 233, 232, 0.8)';
      ctx.lineWidth = (ln.kind === 'measured' ? 3 : 1.5) * unit;
      ctx.setLineDash(ln.kind === 'measured' ? [] : [6 * unit, 5 * unit]);
      ctx.beginPath();
      ctx.moveTo(ln.a.x, ln.a.y);
      ctx.lineTo(ln.b.x, ln.b.y);
      ctx.stroke();
      if (ln.kind === 'measured') {
        ctx.fillStyle = '#5CC9A8';
        for (const q of [ln.a, ln.b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 4 * unit, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  });
  const rollByView: Partial<Record<StepKey, number>> = {};
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
  const key = () => steps[viewIdx];
  const view = () => VIEW_OF[key()];
  const isLast = () => viewIdx >= steps.length - 1;
  /** Name eines Schritts; seitlich mit der gemessenen Körperseite, sobald bekannt. */
  const stepName = (k: StepKey) => {
    if (k === 'front') return 'Vorne';
    const near = shown[k]?.near;
    return near ? `Seitlich (${SIDE_NAME[near]})` : k === 'side2' ? 'Seitlich (andere Seite)' : 'Seitlich';
  };

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
    if (import.meta.env.DEV) (window as unknown as { __syntheticView?: StepKey }).__syntheticView = key(); // nur synthetische Testperson
    flow = null;
    setBig();
    ui.setHint(null);
    const k = key();
    const tiltBtn = DeviceTiltWatcher.supported && !tiltOn
      ? h('button', { type: 'button', class: 'btn', onclick: async () => { tiltOn = await tilt.start(); showIntro(); } }, 'Geräteneigung anzeigen')
      : null;
    updateTiltLine();
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, `Haltung · ${stepName(k)} · ${viewIdx + 1} von ${steps.length}`),
        h('ol', { class: 'steps' }, ...VIEW_INSTRUCTION[k].map((t) => h('li', {}, t)), h('li', {}, `Ruhig stehen. ${config.posture.durationS} Sekunden.`)),
        viewIdx === 0 ? h('p', { class: 'notice warn small' }, TILT_WARNING) : null,
        tiltLine,
        tiltBtn,
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: nextView }, isLast() ? 'Zur Übersicht' : 'Überspringen'),
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
    measuredPts = [];
    nearVotes = { left: 0, right: 0 };
    override = false;
    delete overrideUsed[key()];
    overrideBtn.hidden = true;
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, `${stepName(key())}: ruhig stehen. Die Messung startet automatisch.`),
      tiltLine,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: showIntro }, 'Abbrechen'), overrideBtn),
    );
  }

  function addOtherSide() {
    if (!steps.includes('side2')) steps = [...steps, 'side2'];
    viewIdx = steps.indexOf('side2');
    showIntro();
  }

  function nextView() {
    if (!isLast()) {
      viewIdx += 1;
      showIntro();
    } else showSummary();
  }

  function showViewDone() {
    step = 'viewDone';
    setBig();
    const k = key();
    const v = view();
    const r = summarizeView(samples, v);
    results[k] = r;
    const mp = meanPoints(measuredPts);
    if (mp) shown[k] = { pts: mp, near: nearVotes.left >= nearVotes.right ? 'left' : 'right' };
    const roll = mean(rolls);
    if (Number.isFinite(roll)) rollByView[k] = roll;
    const sameSide = k === 'side2' && shown.side && shown.side2 && shown.side.near === shown.side2.near;
    ui.setHint(`${stepName(k)} gemessen`, 'ok');
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, stepName(k)),
        valueRows(v, r),
        h('p', { class: 'muted small' }, 'Im Bild: grün = gemessene Linien, gestrichelt = Lot bzw. Waagerechte. Sitzen die grünen Punkte nicht auf Ohr, Schulter, Hüfte, Knie und Knöchel, ist der Wert unsicher.'),
        Number.isFinite(roll) ? h('p', { class: 'panel-text num' }, `Handy war ${Math.abs(Math.round(roll))}° seitlich geneigt.`) : null,
        overrideUsed[k] ? h('p', { class: 'notice warn small' }, 'Ohne Positionscheck gemessen – die Werte sind unsicherer.') : null,
        sameSide ? h('p', { class: 'notice warn small' }, 'Es wurde wieder dieselbe Körperseite gemessen. Für den Seitenvergleich bitte umdrehen und wiederholen.') : null,
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: startRun }, 'Wiederholen'),
          h('button', { type: 'button', class: 'btn primary big', onclick: nextView }, isLast() ? 'Zur Übersicht' : `Weiter: ${stepName(steps[viewIdx + 1])}`),
        ),
        k === 'side' && !steps.includes('side2')
          ? h('button', { type: 'button', class: 'link', onclick: addOtherSide }, 'Optional: andere Seite messen (Seitenvergleich)')
          : null,
      ),
    );
  }

  function showSummary() {
    step = 'summary';
    setBig();
    ui.setHint('Haltung – Übersicht', 'ok');
    const measured = steps.filter((k) => results[k]);
    // Abweichungen aller gemessenen Schritte, größte zuerst
    const list = measured
      .flatMap((k) => asymmetries({ [VIEW_OF[k]]: results[k] }).map((i) => ({ ...i, name: stepName(k) })))
      .sort((a, b) => b.deg - a.deg);
    const compare = results.side && results.side2 && shown.side && shown.side2 && shown.side.near !== shown.side2.near
      ? sideCompare(results.side, results.side2, shown.side.near)
      : null;
    const rolls = Object.values(rollByView).filter((x): x is number => x !== undefined);
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, 'Übersicht Haltung'),
        h('p', { class: 'panel-text' }, 'Abweichungen von der Waagerechten bzw. vom Lot, größte zuerst. Nur Werte, keine Bewertung.'),
        list.length
          ? h('ul', { class: 'kv' }, ...list.map((i) => h('li', {}, h('span', {}, `${i.name} · ${i.label}`), valueCell(i.deg, i.text))))
          : h('p', { class: 'panel-text' }, measured.length ? 'Keine Abweichung ab 1°.' : 'Keine Ansicht gemessen.'),
        compare,
        ...measured.map((k) => h('details', {}, h('summary', {}, `${stepName(k)} – alle Werte`), valueRows(VIEW_OF[k], results[k]!))),
        !steps.includes('side2') ? h('button', { type: 'button', class: 'link', onclick: addOtherSide }, 'Andere Seite zusätzlich messen (Seitenvergleich)') : null,
        rolls.length ? h('p', { class: 'panel-text num' }, `Handy seitlich geneigt: ${rolls.map((r) => `${Math.abs(Math.round(r))}°`).join(' / ')}`) : null,
        h('p', { class: 'notice warn small' }, TILT_WARNING),
        h('p', { class: 'muted small' }, 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training. Kleidung und Haare beeinflussen die erkannten Punkte.'),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => {
            viewIdx = 0;
            steps = [...BASE_STEPS];
            for (const k of ['front', 'side', 'side2'] as StepKey[]) { delete results[k]; delete shown[k]; delete rollByView[k]; }
            showIntro();
          } }, 'Noch einmal von vorn'),
        ),
      ),
    );
  }

  showIntro();

  return {
    dispose() {
      ui.setOverlay(null);
      tilt.stop();
    },
    onFrame(frame) {
      updateTiltLine();
      const v = view();
      const { sample, meta } = viewSample(frame, v);
      const pos = checkPosition(frame, undefined, v);
      ui.setDebugRows([
        ['Ansicht', stepName(key())],
        ['Phase', flow?.phase ?? step],
        ['Position', pos.ok ? 'ok' : pos.issues.join(', '), !pos.ok],
        ['Schulter/Rumpf', fmtDec(pos.metrics.shoulderRatio)],
        ...VIEW_KEYS[v].map((k): [string, string] => [METRIC_LABELS[v][k]!, `${fmtDec(sample[k] ?? NaN, 1)}°`]),
        ...(v === 'side' ? [['Seite zur Kamera / Blick', `${meta.near ?? '–'} / ${meta.facing ?? '–'}`] as [string, string]] : []),
        ['Gerät roll / pitch', tilt.latest ? `${fmtInt(tilt.latest.roll)}° / ${fmtInt(tilt.latest.pitch)}°` : '–'],
        ['Frames gemessen', String(samples.length)],
      ]);
      if (step !== 'run') return;
      flow ??= initFlow(frame.t);
      // Hängt der Positionscheck länger als 8 s, „Trotzdem messen“ anbieten (Person muss erkannt sein).
      if (flow.phase === 'check' && !override && frame.t - flow.since > 8000) overrideBtn.hidden = false;
      const posOk = pos.ok || (override && !!frame.image);
      if (override) overrideUsed[key()] = true;
      flow = stepFlow(flow, { t: frame.t, positionOk: posOk, startPose: true }, flowCfg);
      switch (flow.phase) {
        case 'check':
          ui.setHint(pos.message ?? 'Gut so – kurz stillhalten', posOk ? 'ok' : 'warn');
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
          samples.push(posOk ? sample : {});
          if (posOk && frame.image) {
            measuredPts.push(frame.image);
            if (meta.near) nearVotes[meta.near] += 1;
          }
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
