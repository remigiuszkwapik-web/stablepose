import { checkPosition } from '../analysis/position';
import { postureSample, summarizePosture, tiltSideText, type PostureSample } from '../analysis/posture';
import { countdownLeft, initFlow, measureLeft, stepFlow, type FlowConfig, type FlowState } from '../analysis/singleLegFlow';
import { mean } from '../analysis/smoothing';
import { config } from '../config';
import { DeviceTiltWatcher } from './deviceOrientation';
import { fmtDec, fmtInt, h } from './dom';
import type { Controller, SessionUI } from './session';

type Step = 'intro' | 'run' | 'done';

const TILT_WARNING = 'Schon eine kleine Neigung des Handys verfälscht das Ergebnis um genau diesen Winkel. Stell das Handy senkrecht und gerade auf (Stativ, Wasserwaage).';

/** Haltung frontal: ruhig stehen, 3 s messen, Schulter- und Beckenlinie zur Horizontalen. */
export function postureController(ui: SessionUI): Controller {
  let step: Step = 'intro';
  let flow: FlowState | null = null;
  let samples: PostureSample[] = [];
  let rolls: number[] = [];
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

  const updateTiltLine = () => {
    const t = tilt.latest;
    if (!tiltOn) tiltLine.textContent = '';
    else if (!t) tiltLine.textContent = 'Geräteneigung: keine Daten';
    else {
      const roll = Math.abs(Math.round(t.roll));
      const ok = roll <= config.posture.deviceTiltHintDeg;
      tiltLine.textContent = `Gerät seitlich geneigt: ${roll}° · nach vorn/hinten: ${Math.abs(Math.round(t.pitch))}°${ok ? '' : ' – bitte gerade stellen'}`;
      tiltLine.dataset.tone = ok ? 'ok' : 'warn';
    }
  };

  function setBig(number?: string, label?: string) {
    if (number === undefined && label === undefined) return ui.big.replaceChildren();
    ui.big.className = 'bigview';
    ui.big.replaceChildren(
      ...[number !== undefined ? h('div', { class: 'big-number' }, number) : null, label ? h('div', { class: 'big-label' }, label) : null].filter(
        (x): x is HTMLDivElement => x !== null,
      ),
    );
  }

  function showIntro() {
    step = 'intro';
    flow = null;
    setBig();
    ui.setHint(null);
    const tiltBtn = DeviceTiltWatcher.supported && !tiltOn
      ? h('button', {
          type: 'button',
          class: 'btn',
          onclick: async () => {
            tiltOn = await tilt.start();
            if (!tiltOn) tiltLine.textContent = 'Geräteneigung nicht verfügbar oder nicht erlaubt.';
            tiltBtn?.remove();
          },
        }, 'Geräteneigung anzeigen')
      : null;
    ui.panel.replaceChildren(
      h('h2', {}, 'Haltung frontal'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Stell dich frontal zur Kamera, Kopf bis Füße im Bild.'),
        h('li', {}, 'Arme locker hängen lassen, Füße hüftbreit.'),
        h('li', {}, `Ruhig stehen, geradeaus schauen. ${config.posture.durationS} Sekunden.`),
      ),
      h('p', { class: 'notice warn small' }, TILT_WARNING),
      tiltLine,
      ...(tiltBtn ? [tiltBtn] : []),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary big', onclick: startRun }, 'Los')),
    );
  }

  function startRun() {
    step = 'run';
    flow = null;
    samples = [];
    rolls = [];
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, 'Ruhig stehen. Die Messung startet automatisch.'),
      tiltLine,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: showIntro }, 'Abbrechen')),
    );
  }

  function showDone() {
    step = 'done';
    setBig();
    const r = summarizePosture(samples);
    const roll = mean(rolls);
    ui.setHint('Messung beendet', 'ok');
    const row = (label: string, deg: number) =>
      h('div', { class: 'stat' }, h('span', { class: 'stat-value num' }, Number.isFinite(deg) ? `${Math.abs(deg)}°` : '–'), h('span', { class: 'stat-label' }, `${label} · ${tiltSideText(deg)}`));
    ui.panel.replaceChildren(
      h('h2', {}, 'Ergebnis'),
      h('p', { class: 'panel-text' }, 'Neigung zur Waagerechten, Mittelwert über die Messung. Nur Werte, keine Bewertung.'),
      row('Schultern', r.shoulderDeg),
      row('Becken', r.pelvisDeg),
      Number.isFinite(roll)
        ? h('p', { class: 'panel-text num' }, `Gerät war während der Messung ${Math.abs(Math.round(roll))}° seitlich geneigt.`)
        : h('p', { class: 'panel-text' }, 'Geräteneigung nicht gemessen.'),
      h('p', { class: 'notice warn small' }, TILT_WARNING),
      h('p', { class: 'muted small' }, 'Kein medizinischer Test. Die Werte dienen nur zur Orientierung fürs Training.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: startRun }, 'Noch einmal')),
    );
  }

  showIntro();

  return {
    dispose() {
      tilt.stop();
    },
    onFrame(frame) {
      const s = postureSample(frame);
      updateTiltLine();
      ui.setDebugRows([
        ['Phase', flow?.phase ?? step],
        ['Schulterlinie', `${fmtDec(s.shoulder, 1)}°`],
        ['Beckenlinie', `${fmtDec(s.pelvis, 1)}°`],
        ['Gerät roll / pitch', tilt.latest ? `${fmtInt(tilt.latest.roll)}° / ${fmtInt(tilt.latest.pitch)}°` : '–'],
        ['Frames gemessen', String(samples.length)],
      ]);
      if (step !== 'run') return;
      const pos = checkPosition(frame);
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
          // Nur Frames mit passender Position zählen; sonst als nicht messbar.
          samples.push(pos.ok ? s : { shoulder: NaN, pelvis: NaN });
          if (tilt.latest) rolls.push(tilt.latest.roll);
          ui.setHint(pos.ok ? 'Messung läuft' : pos.message, pos.ok ? 'info' : 'warn');
          setBig(String(measureLeft(flow, flowCfg)), 'Sekunden');
          break;
        case 'done':
          showDone();
          break;
      }
    },
  };
}
