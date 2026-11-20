import { describe, it, expect } from 'vitest';
import {
  calibrate, estimateUncertainty, headTopFromMask, measureHeight, median, orderCorners,
  type Calibration, type CameraInfo, type P2,
} from '../src/analysis/height';
import { L } from '../src/analysis/landmarks';
import type { PoseFrame, Pt } from '../src/analysis/types';
import { config } from '../src/config';

const W = 720, Hpx = 1280;
const PLATE = { widthCm: 40, depthCm: 30 };
const F_TRUE = 640 / Math.tan((31.5 * Math.PI) / 180); // ≈ 1044 px

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V): V => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };
const dt = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Synthetische Lochkamera vor der Platte. Winkel in Grad. */
function makeCam(o: { dist?: number; camHeight?: number; pitch?: number; yaw?: number; roll?: number } = {}) {
  const C: V = [PLATE.widthCm / 2, -(o.dist ?? 250), o.camHeight ?? 100];
  const yaw = ((o.yaw ?? 0) * Math.PI) / 180, pitch = ((o.pitch ?? 0) * Math.PI) / 180, roll = ((o.roll ?? 0) * Math.PI) / 180;
  const fwd = nrm([Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), -Math.sin(pitch)]);
  let x = nrm(crs(fwd, [0, 0, 1]));
  let y = crs(fwd, x);
  [x, y] = [
    [x[0] * Math.cos(roll) + y[0] * Math.sin(roll), x[1] * Math.cos(roll) + y[1] * Math.sin(roll), x[2] * Math.cos(roll) + y[2] * Math.sin(roll)],
    [y[0] * Math.cos(roll) - x[0] * Math.sin(roll), y[1] * Math.cos(roll) - x[1] * Math.sin(roll), y[2] * Math.cos(roll) - x[2] * Math.sin(roll)],
  ];
  return (P: V): P2 => {
    const d = sub(P, C);
    const z = dt(d, fwd);
    return { x: W / 2 + (F_TRUE * dt(d, x)) / z, y: Hpx / 2 + (F_TRUE * dt(d, y)) / z };
  };
}

function corners(proj: (P: V) => P2): P2[] {
  return [proj([0, 0, 0]), proj([PLATE.widthCm, 0, 0]), proj([PLATE.widthCm, PLATE.depthCm, 0]), proj([0, PLATE.depthCm, 0])];
}

/** Person mit Körperachse (X0, Y0), Größe h cm; Maske mit Scheitel an der projizierten Höhe. */
function personFrame(proj: (P: V) => P2, h: number, X0 = 20, Y0 = 15, withMask = true): PoseFrame {
  const pt = (P: V, v = 0.95): Pt => ({ ...proj(P), z: 0, v });
  const image: Pt[] = Array.from({ length: 33 }, () => pt([X0, Y0, h / 2]));
  const fh = config.height.footPointHeightCm;
  image[L.leftHeel] = pt([X0 + 8, Y0 - 11, fh]);
  image[L.rightHeel] = pt([X0 - 8, Y0 - 11, fh]);
  image[L.leftFootIndex] = pt([X0 + 8, Y0 + 11, fh]);
  image[L.rightFootIndex] = pt([X0 - 8, Y0 + 11, fh]);
  image[L.nose] = pt([X0, Y0 - 9, h - 12]);
  image[L.leftEar] = pt([X0 + 7, Y0, h - 11]);
  image[L.rightEar] = pt([X0 - 7, Y0, h - 11]);
  image[L.leftShoulder] = pt([X0 + 20, Y0, h - 30]);
  image[L.rightShoulder] = pt([X0 - 20, Y0, h - 30]);
  const frame: PoseFrame = { t: 0, width: W, height: Hpx, image, world: null };
  if (withMask) {
    const top = proj([X0, Y0, h]);
    const data = new Float32Array(W * Hpx);
    for (let y = Math.round(top.y); y < Hpx; y++) for (let x = Math.round(top.x) - 30; x < Math.round(top.x) + 30; x++) data[y * W + x] = 1;
    frame.mask = { data, width: W, height: Hpx };
  }
  return frame;
}

const cal = (pts: P2[]) => calibrate(pts, PLATE, W, Hpx) as Calibration;
const camInfo = (pitch = 0, roll = 0, fFactor = 1, fromSensor = true): CameraInfo => ({ f: F_TRUE * fFactor, pitchDownDeg: pitch, rollDeg: roll, fromSensor });

describe('Körpergröße mit Referenzplatte', () => {
  it('Ecken werden sortiert (vorn links, vorn rechts, hinten rechts, hinten links)', () => {
    const c = orderCorners([{ x: 300, y: 900 }, { x: 100, y: 1000 }, { x: 120, y: 900 }, { x: 320, y: 1000 }]);
    expect(c).toEqual([{ x: 100, y: 1000 }, { x: 320, y: 1000 }, { x: 300, y: 900 }, { x: 120, y: 900 }]);
  });
  it('Fehler: Plattenmaße fehlen, keine vier Ecken, kein Viereck', () => {
    const proj = makeCam();
    expect(calibrate(corners(proj), { widthCm: 0, depthCm: 30 }, W, Hpx)).toBe('plateSize');
    expect(calibrate(corners(proj).slice(0, 3), PLATE, W, Hpx)).toBe('notFour');
    expect(calibrate([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }], PLATE, W, Hpx)).toBe('notConvex');
  });
  it.each([
    ['Kamera waagerecht, Hüfthöhe', {}],
    ['Kamera 10° nach unten geneigt (Sensor bekannt)', { pitch: 10 }],
    ['Kamera 6° geneigt (Sensor bekannt)', { pitch: 6 }],
    ['Kamera tief (50 cm), 3 m entfernt, 5° nach oben', { camHeight: 50, dist: 300, pitch: -5 }],
  ])('%s: 176 cm auf ±0,5 cm (ideale Punkte)', (_n, o: { pitch?: number; roll?: number; camHeight?: number; dist?: number }) => {
    const proj = makeCam(o);
    const c = cal(corners(proj));
    const m = measureHeight(personFrame(proj, 176), c, camInfo(o.pitch ?? 0, o.roll ?? 0));
    expect(m.headMethod).toBe('mask');
    expect(m.onPlate).toBe(true);
    expect(Math.abs(m.cm - 176)).toBeLessThan(0.5);
  });
  it('verschiedene Größen (120, 160, 200 cm)', () => {
    const proj = makeCam({ pitch: 8 });
    const c = cal(corners(proj));
    for (const h of [120, 160, 200]) expect(Math.abs(measureHeight(personFrame(proj, h), c, camInfo(8)).cm - h)).toBeLessThan(0.6);
  });
  it('waagerechte Kamera: falscher Bildwinkel (±15 %) spielt keine Rolle', () => {
    const proj = makeCam();
    const c = cal(corners(proj));
    for (const k of [0.85, 1.15]) expect(Math.abs(measureHeight(personFrame(proj, 176), c, camInfo(0, 0, k)).cm - 176)).toBeLessThan(0.5);
  });
  it('Neigung wirkt etwa 1 cm pro Grad: 8° unbekannt → deutlicher Fehler, aber innerhalb der Spanne', () => {
    const proj = makeCam({ pitch: 5 });
    const c = cal(corners(proj));
    const cam = camInfo(0, 0, 1, false);
    const m = measureHeight(personFrame(proj, 176), c, cam);
    const err = Math.abs(m.cm - 176);
    expect(err).toBeGreaterThan(3);
    expect(err).toBeLessThan(estimateUncertainty(c, m, cam));
  });
  it('Drehung in der Bildebene: Vorzeichen stimmt (falsches Vorzeichen wäre schlechter)', () => {
    const proj = makeCam({ roll: 4 });
    const c = cal(corners(proj));
    const right = Math.abs(measureHeight(personFrame(proj, 176), c, camInfo(0, 4)).cm - 176);
    const wrong = Math.abs(measureHeight(personFrame(proj, 176), c, camInfo(0, -4)).cm - 176);
    expect(right).toBeLessThan(wrong);
    expect(right).toBeLessThan(1);
  });
  it('Waage 5° schräg zur Kamera: Fehler < 1 %', () => {
    const proj = makeCam({ yaw: 5 });
    const c = cal(corners(proj));
    expect(Math.abs(measureHeight(personFrame(proj, 176), c, camInfo()).cm - 176)).toBeLessThan(1.8);
  });
  it('ungenau angetippte Ecken (±2 px): Fehler bleibt innerhalb der geschätzten Spanne', () => {
    const proj = makeCam({ pitch: 8 });
    const noise = [[2, -2], [-2, 2], [2, 2], [-2, -2]];
    const c = cal(corners(proj).map((p, i) => ({ x: p.x + noise[i][0], y: p.y + noise[i][1] })));
    const cam = camInfo(8);
    const m = measureHeight(personFrame(proj, 176), c, cam);
    const err = Math.abs(m.cm - 176);
    const span = estimateUncertainty(c, m, cam);
    expect(err).toBeLessThan(span);
    expect(err).toBeLessThan(5);
    expect(span).toBeLessThan(10);
  });
  it('ohne Maske: Scheitel aus Gesichtspunkten, größere Spanne', () => {
    const proj = makeCam();
    const c = cal(corners(proj));
    const m = measureHeight(personFrame(proj, 176, 20, 15, false), c, camInfo());
    expect(m.headMethod).toBe('landmarks');
    expect(estimateUncertainty(c, m, camInfo())).toBeGreaterThanOrEqual(config.height.headLandmarkErrorCm);
  });
  it('Person neben der Platte → onPlate false', () => {
    const proj = makeCam();
    const c = cal(corners(proj));
    expect(measureHeight(personFrame(proj, 176, 80, 15), c, camInfo()).onPlate).toBe(false);
  });
  it('unplausible Werte werden verworfen', () => {
    const proj = makeCam();
    const c = cal(corners(proj));
    expect(Number.isNaN(measureHeight(personFrame(proj, 60), c, camInfo()).cm)).toBe(true);
  });
});

describe('Hilfsfunktionen', () => {
  it('Scheitel aus Maske ignoriert einzelne Störpixel', () => {
    const w = 100, h = 200;
    const data = new Float32Array(w * h);
    data[10 * w + 50] = 1; // Störpixel
    for (let y = 40; y < h; y++) for (let x = 40; x < 60; x++) data[y * w + x] = 0.9;
    expect(headTopFromMask({ data, width: w, height: h }, w, h, 50, 15)).toBe(40);
  });
  it('Maske in anderer Auflösung wird umgerechnet', () => {
    const data = new Float32Array(50 * 100);
    for (let y = 20; y < 100; y++) for (let x = 20; x < 30; x++) data[y * 50 + x] = 1;
    expect(headTopFromMask({ data, width: 50, height: 100 }, 100, 200, 50, 10)).toBe(40);
  });
  it('Median', () => {
    expect(median([3, 1, NaN, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});
