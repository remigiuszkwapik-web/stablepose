import { checkPosition } from '../analysis/position';
import { countdownLeft, defaultFlowConfig, initFlow, measureLeft, stepFlow, type FlowState } from '../analysis/singleLegFlow';
import { isStartPose, stanceMetrics, startPoseHint, type StanceMetrics } from '../analysis/stance';
import type { PoseFrame, Side } from '../analysis/types';
import { config } from '../config';
import type { Controller, SessionUI } from './session';
import { fmtDec, fmtInt, h } from './dom';

type Step = 'side' | 'intro' | 'run' | 'trialDone';

const sideLabel = (s: Side) => (s === 'left' ? 'Links' : 'Rechts');
const legName = (s: Side) => (s === 'left' ? 'linke' : 'rechte');

/** Einbeinstand: Standbein wählen → Anleitung → Positionscheck → Countdown → Messung. */
export function singleLegController(ui: SessionUI): Controller {
  let step: Step = 'side';
  let stand: Side = 'left';
  let flow: FlowState | null = null;
  const flowCfg = defaultFlowConfig();
  let lastBig = '';

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
    ui.panel.replaceChildren(
      h('h2', {}, 'Auf welchem Bein stehst du?'),
      h('p', { class: 'panel-text' }, 'Das Standbein ist das Bein, das am Boden bleibt.'),
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
    step = 'intro';
    flow = null;
    setBig(null);
    ui.setHint(null);
    ui.panel.replaceChildren(
      h('h2', {}, `Standbein ${sideLabel(s)}`),
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
        h('button', { type: 'button', class: 'btn ghost', onclick: showSide }, 'Zurück'),
        h('button', { type: 'button', class: 'btn primary big', onclick: startRun }, 'Los'),
      ),
    );
  }

  function startRun() {
    step = 'run';
    flow = null; // wird mit dem ersten Frame gestartet
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, `Standbein ${sideLabel(stand)} · Der Timer startet, sobald du richtig stehst.`),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => showIntro(stand) }, 'Abbrechen')),
    );
  }

  function showTrialDone() {
    step = 'trialDone';
    setBig(null);
    ui.setHint('Versuch beendet', 'ok');
    ui.panel.replaceChildren(
      h('h2', {}, 'Fertig'),
      h('p', { class: 'panel-text' }, `Standbein ${sideLabel(stand)} · ${config.singleLeg.durationS} s gemessen.`),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: showSide }, 'Anderes Bein'),
        h('button', { type: 'button', class: 'btn primary', onclick: startRun }, 'Noch einmal'),
      ),
    );
  }

  function debugRows(m: StanceMetrics, frame: PoseFrame): [string, string, boolean?][] {
    const pos = checkPosition(frame);
    return [
      ['Phase', flow?.phase ?? step],
      ['Position', pos.ok ? 'ok' : pos.issues.join(', '), !pos.ok],
      ['Schulter/Rumpf', fmtDec(pos.metrics.shoulderRatio)],
      ['Körperhöhe', fmtDec(pos.metrics.bodyHeight)],
      ['Fuß gehoben (×Bein)', fmtDec(m.footLift)],
      ['Hand L→Hüfte (×Rumpf)', fmtDec(m.wristHip.left)],
      ['Hand R→Hüfte (×Rumpf)', fmtDec(m.wristHip.right)],
      ['Ellbogen L / R', `${fmtInt(m.elbow.left)}° / ${fmtInt(m.elbow.right)}°`],
      ['Startposition', isStartPose(m) ? 'ja' : 'nein'],
    ];
  }

  showSide();

  return {
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
        case 'measuring':
          ui.setHint('Messung läuft – ruhig stehen', 'info');
          setBig({ number: String(measureLeft(flow, flowCfg)), label: 'Sekunden' });
          break;
        case 'done':
          showTrialDone();
          break;
      }
    },
  };
}
