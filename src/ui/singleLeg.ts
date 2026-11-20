import { ERROR_LABELS, finishBess, frameConditions, highlightPoints, initBess, liveErrors, stepBess, type BessState, type ConditionType, type TrialErrors } from '../analysis/bess';
import { checkPosition } from '../analysis/position';
import { mean } from '../analysis/smoothing';
import { makeRecord, type TrialRecord } from '../analysis/results';
import { countdownLeft, defaultFlowConfig, initFlow, measureLeft, stepFlow, type FlowState } from '../analysis/singleLegFlow';
import { isStartPose, stanceMetrics, startPoseHint, type StanceMetrics } from '../analysis/stance';
import { otherSide, type PoseFrame, type Side } from '../analysis/types';
import { config } from '../config';
import type { Controller, SessionUI } from './session';
import { append, fmtDec, fmtInt, h } from './dom';

type Step = 'side' | 'intro' | 'run' | 'trialDone';

const sideLabel = (s: Side) => (s === 'left' ? 'Links' : 'Rechts');
const legName = (s: Side) => (s === 'left' ? 'linke' : 'rechte');

/** Einbeinstand: Standbein wählen → Anleitung → Positionscheck → Countdown → Messung. */
export function singleLegController(ui: SessionUI, onDone: (records: TrialRecord[]) => void): Controller {
  let step: Step = 'side';
  const records: TrialRecord[] = [];
  const perSide = config.singleLeg.trialsPerSide;
  const trialsDone = (s: Side) => records.filter((r) => r.stand === s).length;
  let firstSide: Side | null = null;
  let stand: Side = 'left';
  let flow: FlowState | null = null;
  const flowCfg = defaultFlowConfig();
  let lastBig = '';
  let bess: BessState | null = null;
  let baselineSamples: number[] = [];
  let baseline: { standHeelToe: number } | null = null;

  const setBig = (html: { number?: string; label?: string; sub?: string; tone?: 'signal' } | null) => {
    const key = JSON.stringify(html);
    if (key === lastBig) return;
    lastBig = key;
    ui.big.className = 'bigview' + (html?.tone ? ` ${html.tone}` : '');
    if (!html) return ui.big.replaceChildren();
    ui.big.replaceChildren(
      ...[
        html.number !== undefined ? h('div', { class: 'big-number' }, html.number) : null,
        html.label ? h('div', { class: 'big-label' }, html.label) : null,
        html.sub ? h('div', { class: 'big-sub' }, html.sub) : null,
      ].filter((x): x is HTMLDivElement => x !== null),
    );
  };

  function showSide() {
    step = 'side';
    flow = null;
    setBig(null);
    ui.setHint(null);
    ui.setHighlight(null);
    ui.panel.replaceChildren(
      h('h2', {}, 'Auf welchem Bein stehst du zuerst?'),
      h('p', { class: 'panel-text' }, `Das Standbein bleibt am Boden. Pro Seite ${perSide} Versuche, danach die andere Seite.`),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn big', onclick: () => showIntro('left') }, 'Links'),
        h('button', { type: 'button', class: 'btn big', onclick: () => showIntro('right') }, 'Rechts'),
      ),
    );
  }

  function showIntro(s: Side) {
    stand = s;
    if (import.meta.env.DEV) (window as unknown as { __standSide?: Side }).__standSide = s; // nur für die synthetische Testperson
    firstSide ??= s;
    step = 'intro';
    flow = null;
    setBig(null);
    ui.setHint(null);
    ui.panel.replaceChildren(
      h('h2', {}, `Standbein ${sideLabel(s)} · Versuch ${trialsDone(s) + 1} von ${perSide}`),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Stell dich frontal zur Kamera, 2 bis 3 m entfernt. Kopf bis Füße im Bild.'),
        h('li', {}, 'Hände an die Hüfte.'),
        h('li', {}, `Heb das ${legName(s === 'left' ? 'right' : 'left')} Bein an, Knie leicht gebeugt.`),
        h('li', {}, `Steh ruhig, Augen offen. ${config.singleLeg.durationS} Sekunden.`),
      ),
      h(
        'div',
        { class: 'row' },
        records.length === 0
          ? h('button', { type: 'button', class: 'btn ghost', onclick: showSide }, 'Zurück')
          : h('button', { type: 'button', class: 'btn ghost', onclick: () => onDone(records) }, 'Zum Ergebnis'),
        h('button', { type: 'button', class: 'btn primary big', onclick: startRun }, 'Los'),
      ),
    );
  }

  function startRun() {
    step = 'run';
    flow = null; // wird mit dem ersten Frame gestartet
    bess = null;
    baseline = null;
    baselineSamples = [];
    ui.setHighlight(null);
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, `Standbein ${sideLabel(stand)} · Versuch ${trialsDone(stand) + 1} von ${perSide} · Der Timer startet, sobald du richtig stehst.`),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => showIntro(stand) }, 'Abbrechen')),
    );
  }

  function showTrialDone() {
    step = 'trialDone';
    setBig(null);
    ui.setHighlight(null);
    const fps = ui.takeFpsAverage();
    const r = bess ? finishBess(bess) : null;
    if (r) {
      records.push(
        makeRecord(r, { date: new Date(), stand, trial: trialsDone(stand) + 1, durationMs: flow?.elapsedMs ?? 0, model: ui.modelName(), fpsAvg: fps }),
      );
    }
    const n = trialsDone(stand);
    const other = otherSide(stand);
    const sideComplete = n >= perSide;
    const otherOpen = trialsDone(other) < perSide;
    ui.setHint(`Versuch ${n} von ${perSide} · Standbein ${sideLabel(stand)}`, 'ok');

    const repeat = () => {
      // letzten Versuch verwerfen und neu messen
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i].stand === stand) { records.splice(i, 1); break; }
      }
      startRun();
    };
    let next: HTMLElement;
    if (!sideComplete) next = h('button', { type: 'button', class: 'btn primary big', onclick: () => showIntro(stand) }, 'Weiter');
    else if (otherOpen) next = h('button', { type: 'button', class: 'btn primary big', onclick: () => showIntro(other) }, `Weiter: Standbein ${sideLabel(other)}`);
    else next = h('button', { type: 'button', class: 'btn primary big', onclick: () => onDone(records) }, 'Ergebnis ansehen');

    ui.panel.replaceChildren();
    append(
      ui.panel,
      h('h2', {}, sideComplete && !otherOpen ? 'Alle Versuche fertig' : 'Kurze Pause'),
      r ? trialSummary(r) : h('p', { class: 'panel-text' }, 'Keine Messdaten.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: repeat }, 'Wiederholen'), next),
      sideComplete && otherOpen ? h('button', { type: 'button', class: 'link', onclick: () => onDone(records) }, 'Nur diese Seite – zum Ergebnis') : null,
    );
  }

  function debugRows(m: StanceMetrics, frame: PoseFrame): [string, string, boolean?][] {
    const pos = checkPosition(frame);
    const rows: [string, string, boolean?][] = [
      ['Phase', flow?.phase ?? step],
      ['Position', pos.ok ? 'ok' : pos.issues.join(', '), !pos.ok],
      ['Schulter/Rumpf', fmtDec(pos.metrics.shoulderRatio)],
      ['Körperhöhe', fmtDec(pos.metrics.bodyHeight)],
      ['Fuß gehoben (×Bein)', fmtDec(m.footLift)],
      ['Hand L→Beckenkamm (×Rumpf)', fmtDec(m.wristHip.left), m.wristHip.left > config.singleLeg.handsOnHipMax],
      ['Hand R→Beckenkamm (×Rumpf)', fmtDec(m.wristHip.right), m.wristHip.right > config.singleLeg.handsOnHipMax],
      ['Sichtbarkeit Handgelenk L / R', frame.image ? `${fmtDec(frame.image[15].v)} / ${fmtDec(frame.image[16].v)}` : '–'],
      ['Ellbogen L / R', `${fmtInt(m.elbow.left)}° / ${fmtInt(m.elbow.right)}°`, m.elbow.left > config.singleLeg.elbowBentMaxDeg || m.elbow.right > config.singleLeg.elbowBentMaxDeg],
      ['Hüfte Beugung', `${fmtInt(m.hipFlexionDeg)}°`, m.hipFlexionDeg > config.singleLeg.hipAngleMaxDeg],
      ['Hüfte Abspreizung', `${fmtInt(m.hipAbductionDeg)}°`, m.hipAbductionDeg > config.singleLeg.hipAngleMaxDeg],
      ['Ferse–Zehe Δ (×Bein)', baseline ? fmtDec(m.standHeelToe - baseline.standHeelToe, 3) : 'noch kein Start'],
      ['Startposition', isStartPose(m) ? 'ja' : 'nein'],
    ];
    if (bess) {
      const raw = bess.raw;
      const state = (k: ConditionType) => (bess!.active.includes(k) ? 'FEHLER' : raw[k] === true ? 'prüft …' : raw[k] === null ? 'nicht messbar' : '–');
      rows.push(
        ['Hände weg', state('handsOff'), raw.handsOff === true],
        ['Fuß abgesetzt', state('footDown'), raw.footDown === true],
        ['Hüfte > 30°', state('hipAngle'), raw.hipAngle === true],
        ['Ferse/Vorfuß (exp.)', state('standFootLift'), raw.standFootLift === true],
        ['Fehler laufend', bess.episode ? `seit ${fmtDec((bess.lastT! - bess.episode.start) / 1000, 1)} s` : 'nein', !!bess.episode],
        ['Fehler gezählt', `${bess.total} (exp. ${bess.experimental})`],
      );
    }
    return rows;
  }

  showSide();

  return {
    dispose() {
      // „Beenden“ nach mindestens einem Versuch: Ergebnis trotzdem zeigen.
      if (records.length) onDone(records);
    },
    onFrame(frame) {
      const m = stanceMetrics(frame, stand);
      ui.setDebugRows(debugRows(m, frame));
      if (step !== 'run') return;

      const pos = checkPosition(frame);
      const startPose = isStartPose(m);
      flow ??= initFlow(frame.t);
      flow = stepFlow(flow, { t: frame.t, positionOk: pos.ok, startPose }, flowCfg);

      switch (flow.phase) {
        case 'check':
          ui.setHint(pos.message ?? 'Gut so – kurz stillhalten', pos.ok ? 'ok' : 'warn');
          setBig(null);
          break;
        case 'countdown':
          ui.setHint(pos.ok ? 'Position passt' : pos.message, pos.ok ? 'ok' : 'warn');
          setBig({ number: String(countdownLeft(flow, frame.t, flowCfg)), label: 'Gleich geht’s los', sub: 'Hände an die Hüfte, Bein anheben' });
          break;
        case 'ready': {
          const hint = startPoseHint(m, stand);
          ui.setHint(hint ?? 'Gut – halten', hint ? 'warn' : 'ok');
          setBig({ label: hint ?? 'Halten …' });
          break;
        }
        case 'measuring': {
          if (!bess) {
            bess = initBess();
            ui.takeFpsAverage(); // fps-Mittel ab Messbeginn
          }
          // Ausgangswert Ferse/Zehe: Mittel der ersten 500 ms der Messung (experimentell).
          if (!baseline) {
            if (Number.isFinite(m.standHeelToe)) baselineSamples.push(m.standHeelToe);
            if (flow.elapsedMs >= 500) baseline = { standHeelToe: mean(baselineSamples) };
          }
          bess = stepBess(bess, frame.t, frameConditions(m, baseline));
          const active = bess.active.filter((k) => k !== 'standFootLift' || config.singleLeg.countExperimentalInTotal);
          ui.setHighlight(active.length ? highlightPoints(active, stand) : null);
          ui.setHint(active.length ? ERROR_LABELS[active[0]] : 'Messung läuft – ruhig stehen', active.length ? 'warn' : 'info');
          const n = liveErrors(bess);
          setBig({ number: String(measureLeft(flow, flowCfg)), label: 'Sekunden', sub: `Fehler ${n}` });
          break;
        }
        case 'done':
          showTrialDone();
          break;
      }
    },
  };
}

/** Kurze Zusammenfassung eines Versuchs: große Fehlerzahl, Details klein darunter. */
export function trialSummary(r: TrialErrors): HTMLElement {
  const details = (['handsOff', 'footDown', 'hipAngle', 'outOfPosition'] as const)
    .filter((k) => r.byType[k] > 0)
    .map((k) => h('li', {}, h('span', {}, ERROR_LABELS[k]), h('span', { class: 'num' }, String(r.byType[k]))));
  return h(
    'div',
    { class: 'trial-summary' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-value num' }, String(r.errors)), h('span', { class: 'stat-label' }, r.errors === 1 ? 'Fehler' : 'Fehler')),
    details.length ? h('ul', { class: 'kv' }, ...details) : h('p', { class: 'panel-text' }, 'Keine Fehler erkannt.'),
    h('ul', { class: 'kv muted small' },
      h('li', {}, h('span', {}, 'Ferse/Vorfuß angehoben (experimentell, nicht mitgezählt)'), h('span', { class: 'num' }, String(r.experimental))),
      h('li', {}, h('span', {}, 'Augen geöffnet'), h('span', {}, 'nicht gemessen')),
    ),
    r.failedToHold ? h('p', { class: 'notice warn' }, `Position kürzer als ${config.singleLeg.minInPositionS} s gehalten – nach BESS-Regel ${config.singleLeg.maxErrors} Fehler.`) : null,
    r.rawErrors > config.singleLeg.maxErrors && !r.failedToHold ? h('p', { class: 'muted small' }, `${r.rawErrors} erkannt, gezählt werden höchstens ${config.singleLeg.maxErrors}.`) : null,
    r.unmeasurableShare > 0.2 ? h('p', { class: 'notice warn' }, `Die Kamera konnte dich ${Math.round(r.unmeasurableShare * 100)} % der Zeit nicht sicher erkennen. Das Ergebnis ist unsicher.`) : null,
  );
}
