import {
  CALIBRATION_MESSAGES, calibrate, estimateUncertainty, focalFromFov, measureHeight, median,
  type Calibration, type CameraInfo, type HeightSample, type P2, type Plate,
} from '../analysis/height';
import { checkPosition } from '../analysis/position';
import { countdownLeft, initFlow, measureLeft, stepFlow, type FlowConfig, type FlowState } from '../analysis/singleLegFlow';
import { config } from '../config';
import { DeviceTiltWatcher } from './deviceOrientation';
import { fmtDec, fmtInt, h, nodes } from './dom';
import type { Controller, SessionUI } from './session';

type Step = 'setup' | 'corners' | 'ready' | 'run' | 'done';

const PLATE_KEY = 'stand.plate'; // nur Plattenmaße (Einstellung, keine Messdaten)
const STEEL = '#9DA2A6';
const SIGNAL = '#F0684C';
const OK = '#5CC9A8';

function loadPlate(): Plate {
  try {
    const v = JSON.parse(localStorage.getItem(PLATE_KEY) ?? 'null');
    if (v && v.widthCm > 0 && v.depthCm > 0) return v;
  } catch { /* privat/blockiert */ }
  return { widthCm: 0, depthCm: 0 };
}
function savePlate(p: Plate) {
  try { localStorage.setItem(PLATE_KEY, JSON.stringify(p)); } catch { /* egal */ }
}

/** Körpergröße mit Referenzplatte: Plattenmaße → Ecken antippen → draufstellen → messen. */
export function heightController(ui: SessionUI): Controller {
  let step: Step = 'setup';
  const plate = loadPlate();
  let taps: P2[] = [];
  let cal: Calibration | null = null;
  let flow: FlowState | null = null;
  let samples: HeightSample[] = [];
  let pitchSamples: number[] = [];
  let lastSample: HeightSample | null = null;
  const tilt = new DeviceTiltWatcher();
  let tiltOn = false;
  const flowCfg: FlowConfig = {
    stableMs: config.position.stableMs,
    countdownS: config.height.countdownS,
    durationS: config.height.durationS,
    startPoseHoldMs: 0,
    lostGraceMs: 1000,
  };
  const tiltLine = h('p', { class: 'panel-text num' });

  /** Neigung der Kamera nach unten (Rückkamera schaut nach unten, wenn der Bildschirm nach oben kippt). */
  const pitchDown = () => {
    const t = tilt.latest;
    if (!tiltOn || !t) return null;
    return ui.facing === 'user' ? -t.pitch : t.pitch;
  };

  const updateTiltLine = () => {
    const t = tilt.latest;
    if (!tiltOn) { tiltLine.textContent = 'Neigung unbekannt – Handy möglichst senkrecht und gerade.'; tiltLine.dataset.tone = 'warn'; return; }
    if (!t) { tiltLine.textContent = 'Neigung: keine Daten'; return; }
    const roll = Math.abs(Math.round(t.roll));
    const pitch = Math.abs(Math.round(t.pitch));
    const ok = roll <= 2 && pitch <= 3;
    tiltLine.textContent = `Handy seitlich ${roll}° · nach vorn/hinten ${pitch}°${ok ? '' : ' – bitte gerader stellen'}`;
    tiltLine.dataset.tone = ok ? 'ok' : 'warn';
  };

  const camInfo = (): CameraInfo => {
    const { width, height } = ui.sourceSize();
    const fov = ui.facing === 'user' ? config.height.fovFrontDeg : config.height.fovBackDeg;
    const p = pitchDown();
    return { f: focalFromFov(fov, width, height), pitchDownDeg: p ?? 0, rollDeg: 0, fromSensor: p !== null };
  };

  // Overlay: Platte, Ecken, Fußpunkt, Scheitel
  ui.setOverlay((ctx, frame) => {
    const unit = Math.max(ctx.canvas.width, ctx.canvas.height) / 640;
    const pts = cal ? cal.corners : taps;
    ctx.save();
    if (pts.length) {
      ctx.strokeStyle = step === 'corners' ? SIGNAL : STEEL;
      ctx.lineWidth = 2 * unit;
      if (pts.length > 1) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (pts.length === 4) ctx.closePath();
        ctx.stroke();
      }
      ctx.fillStyle = step === 'corners' ? SIGNAL : STEEL;
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 4 * unit, 0, Math.PI * 2); ctx.fill(); }
    }
    const s = lastSample;
    if (frame && s?.feetImage && s.head && (step === 'run' || step === 'done')) {
      ctx.strokeStyle = s.onPlate ? OK : SIGNAL;
      ctx.lineWidth = 2 * unit;
      ctx.setLineDash([6 * unit, 4 * unit]);
      ctx.beginPath();
      ctx.moveTo(s.feetImage.x, s.feetImage.y);
      ctx.lineTo(s.feetImage.x, s.head.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(s.head.x - 40 * unit, s.head.y);
      ctx.lineTo(s.head.x + 40 * unit, s.head.y);
      ctx.stroke();
    }
    ctx.restore();
  });

  function setBig(number?: string, label?: string, sub?: string) {
    if (number === undefined && label === undefined) return ui.big.replaceChildren();
    ui.big.className = 'bigview';
    ui.big.replaceChildren(
      ...[
        number !== undefined ? h('div', { class: 'big-number' }, number) : null,
        label ? h('div', { class: 'big-label' }, label) : null,
        sub ? h('div', { class: 'big-sub' }, sub) : null,
      ].filter((x): x is HTMLDivElement => x !== null),
    );
  }

  function numberInput(label: string, value: number, onChange: (v: number) => void) {
    const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '1', step: '0.1', value: value > 0 ? String(value) : '', placeholder: 'cm' });
    input.addEventListener('input', () => onChange(parseFloat(input.value.replace(',', '.'))));
    return h('label', { class: 'input-label' }, h('span', { class: 'label' }, label), input);
  }

  function showSetup(error?: string) {
    step = 'setup';
    ui.onTap(null);
    ui.setMask(false);
    setBig();
    ui.setHint(null);
    const tiltBtn = DeviceTiltWatcher.supported && !tiltOn
      ? h('button', {
          type: 'button',
          class: 'btn',
          onclick: async () => {
            tiltOn = await tilt.start();
            showSetup();
          },
        }, 'Neigung messen (empfohlen)')
      : null;
    updateTiltLine();
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, 'Körpergröße'),
        error ? h('p', { class: 'notice warn' }, error) : null,
        h(
          'ol',
          { class: 'steps' },
          h('li', {}, 'Handy aufs Stativ, ca. 2–3 m vor der Waage, etwa auf Hüfthöhe. Nicht mehr bewegen.'),
          h('li', {}, 'Waage gerade zur Kamera legen. Die ganze Platte muss im Bild sein.'),
          h('li', {}, 'Maße der Platte eingeben (nur die Fläche, auf der man steht).'),
        ),
        h(
          'div',
          { class: 'field-row' },
          numberInput('Breite quer zur Kamera', plate.widthCm, (v) => (plate.widthCm = v)),
          numberInput('Tiefe', plate.depthCm, (v) => (plate.depthCm = v)),
        ),
        tiltLine,
        tiltBtn,
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary big', onclick: () => {
          if (!(plate.widthCm > 0 && plate.depthCm > 0)) return showSetup(CALIBRATION_MESSAGES.plateSize);
          savePlate(plate);
          showCorners();
        } }, 'Weiter: Ecken antippen')),
      ),
    );
  }

  function showCorners(error?: string) {
    step = 'corners';
    ui.setZoom(null);
    taps = [];
    cal = null;
    lastSample = null;
    setBig();
    const counter = h('p', { class: 'lead num' }, '0 von 4 Ecken');
    const done = h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Fertig') as HTMLButtonElement;
    // Zwei Schritte pro Ecke: 1. Tipp vergrößert (Lupe), 2. Tipp setzt die Ecke genau.
    let zoomAt: P2 | null = null;
    const hintText = () => (zoomAt ? 'Jetzt genau auf die Ecke tippen' : 'Tippe in die Nähe einer Ecke – das Bild wird vergrößert');
    ui.setHint(hintText(), 'info');
    ui.onTap((p) => {
      if (taps.length >= 4) return;
      if (!zoomAt) {
        zoomAt = p;
        ui.setZoom(p);
      } else {
        taps.push(p);
        zoomAt = null;
        ui.setZoom(null);
        counter.textContent = `${taps.length} von 4 Ecken`;
        done.disabled = taps.length !== 4;
      }
      ui.setHint(taps.length === 4 ? 'Alle Ecken gesetzt – prüfen und „Fertig“' : hintText(), taps.length === 4 ? 'ok' : 'info');
      ui.redraw();
    });
    done.addEventListener('click', () => {
      ui.setZoom(null);
      const { width, height } = ui.sourceSize();
      const c = calibrate(taps, plate, width, height);
      if (typeof c === 'string') return showCorners(CALIBRATION_MESSAGES[c]);
      cal = c;
      ui.onTap(null);
      showReady();
    });
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, 'Platte einmessen'),
        error ? h('p', { class: 'notice warn' }, error) : null,
        h('p', { class: 'panel-text' }, 'Noch niemand auf der Waage. Für jede der vier Ecken: erst grob hintippen (Bild wird vergrößert), dann genau auf die Ecke. Reihenfolge egal.'),
        counter,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => showCorners() }, 'Zurücksetzen'),
          done),
        h('button', { type: 'button', class: 'link', onclick: () => showSetup() }, 'Plattenmaße ändern'),
      ),
    );
    ui.redraw();
  }

  function showReady() {
    step = 'ready';
    ui.setMask(false);
    setBig();
    ui.setHint('Platte eingemessen', 'ok');
    ui.panel.replaceChildren(
      h('h2', {}, 'Bereit'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Schuhe aus, auf die Mitte der Platte stellen.'),
        h('li', {}, 'Gerade stehen, Fersen zusammen, Blick geradeaus.'),
        h('li', {}, 'Ganz im Bild bleiben, Kopf bis Füße.')),
      tiltLine,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => showCorners() }, 'Neu einmessen'),
        h('button', { type: 'button', class: 'btn primary big', onclick: startRun }, 'Los')),
    );
  }

  function startRun() {
    step = 'run';
    flow = null;
    samples = [];
    pitchSamples = [];
    ui.setMask(true);
    if (ui.isFile) ui.restartVideo();
    ui.panel.replaceChildren(
      h('p', { class: 'panel-text' }, 'Gerade stehen. Die Messung startet automatisch.'),
      tiltLine,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn ghost', onclick: showReady }, 'Abbrechen')),
    );
  }

  function showDone() {
    step = 'done';
    setBig();
    ui.setMask(false);
    const valid = samples.filter((s) => Number.isFinite(s.cm) && s.onPlate);
    const cm = median(valid.map((s) => s.cm));
    const maskShare = valid.length ? valid.filter((s) => s.headMethod === 'mask').length / valid.length : 0;
    const cam = camInfo();
    const pitchMed = median(pitchSamples);
    if (Number.isFinite(pitchMed)) cam.pitchDownDeg = pitchMed;
    // Spanne an einem repräsentativen Frame (dem, der dem Median am nächsten liegt)
    const rep = valid.reduce<HeightSample | null>((best, s) => (!best || Math.abs(s.cm - cm) < Math.abs(best.cm - cm) ? s : best), null);
    const span = rep && cal ? estimateUncertainty(cal, rep, cam) : NaN;
    const enough = valid.length >= 5;
    ui.setHint(enough ? 'Messung beendet' : 'Zu wenige gültige Bilder', enough ? 'ok' : 'warn');
    ui.panel.replaceChildren(
      ...nodes(
        h('h2', {}, 'Ergebnis'),
        enough
          ? h('div', { class: 'stat' }, h('span', { class: 'stat-value num' }, `${fmtInt(cm)} cm`), h('span', { class: 'stat-label num' }, `± ${fmtInt(span)} cm (geschätzt)`))
          : h('p', { class: 'notice warn' }, 'Nicht gemessen: Die Person war nicht lange genug ganz im Bild und auf der Platte.'),
        h('ul', { class: 'kv muted small' },
          h('li', {}, h('span', {}, 'Scheitel'), h('span', {}, maskShare >= 0.5 ? 'aus Körperumriss' : 'aus Gesichtspunkten geschätzt')),
          h('li', {}, h('span', {}, 'Handyneigung'), h('span', {}, cam.fromSensor ? `${fmtInt(cam.pitchDownDeg)}° berücksichtigt` : 'unbekannt (waagerecht angenommen)')),
          h('li', {}, h('span', {}, 'Gültige Bilder'), h('span', { class: 'num' }, `${valid.length} von ${samples.length}`))),
        !cam.fromSensor ? h('p', { class: 'notice warn small' }, 'Ohne Neigungsmessung ist das Ergebnis deutlich unsicherer: jedes Grad Neigung verschiebt es um etwa 1 cm.') : null,
        h('p', { class: 'muted small' }, 'Kein medizinischer Messwert. Haare, Haltung und Socken beeinflussen das Ergebnis. Nur zur Orientierung.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => showCorners() }, 'Neu einmessen'),
          h('button', { type: 'button', class: 'btn primary', onclick: startRun }, 'Noch einmal')),
      ),
    );
  }

  showSetup();

  return {
    dispose() {
      ui.setZoom(null);
      tilt.stop();
      ui.onTap(null);
      ui.setOverlay(null);
      ui.setMask(false);
    },
    onFrame(frame) {
      updateTiltLine();
      const cam = camInfo();
      const s = cal ? measureHeight(frame, cal, cam) : null;
      if (s) lastSample = s;
      ui.setDebugRows([
        ['Phase', flow?.phase ?? step],
        ['Ecken', cal ? '4 (eingemessen)' : `${taps.length}`],
        ['Maßstab am Fuß', s ? `${fmtDec(s.scale, 2)} px/cm` : '–'],
        ['Fuß auf Platte (X, Y)', s?.feetPlate ? `${fmtInt(s.feetPlate.x)} / ${fmtInt(s.feetPlate.y)} cm` : '–', s ? !s.onPlate : false],
        ['Scheitel', s ? (s.headMethod === 'mask' ? 'Umriss' : 'geschätzt') : '–'],
        ['Größe (Frame)', s ? `${fmtDec(s.cm, 1)} cm` : '–'],
        ['Neigung (Kamera unten)', cam.fromSensor ? `${fmtDec(cam.pitchDownDeg, 1)}°` : 'kein Sensor'],
        ['Brennweite (angenommen)', `${fmtInt(cam.f)} px`],
      ]);
      if (step !== 'run' || !cal || !s) return;

      const pos = checkPosition(frame);
      const ok = pos.ok && s.onPlate;
      flow ??= initFlow(frame.t);
      flow = stepFlow(flow, { t: frame.t, positionOk: ok, startPose: true }, flowCfg);
      const msg = !pos.ok ? pos.message : !s.onPlate ? 'Stell dich auf die Platte' : null;
      switch (flow.phase) {
        case 'check':
          ui.setHint(msg ?? 'Gut so – gerade stehen', ok ? 'ok' : 'warn');
          setBig();
          break;
        case 'countdown':
          ui.setHint(msg ?? 'Position passt', ok ? 'ok' : 'warn');
          setBig(String(countdownLeft(flow, frame.t, flowCfg)), 'Gerade stehen');
          break;
        case 'ready':
          break;
        case 'measuring':
          samples.push(ok ? s : { ...s, cm: NaN });
          if (cam.fromSensor) pitchSamples.push(cam.pitchDownDeg);
          ui.setHint(msg ?? 'Messung läuft', ok ? 'info' : 'warn');
          setBig(String(measureLeft(flow, flowCfg)), 'Sekunden');
          break;
        case 'done':
          showDone();
          break;
      }
    },
  };
}
