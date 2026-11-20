import { config } from '../config';
import { L } from './landmarks';
import type { PoseFrame } from './types';

/**
 * Körpergröße mit einer Referenzplatte bekannter Größe (z. B. Glasplatte einer Waage).
 * Reine Funktionen, kein DOM.
 *
 * Vorgehen:
 *  1. Vier Ecken der Platte im Bild + bekannte Maße → Homographie Platte ↔ Bild. Damit lässt sich
 *     für jede Stelle auf der Platte sagen, wie viele Pixel 1 cm quer zur Kamera hat (Maßstab s).
 *  2. Wo steht die Person? Mitte aus Fersen und Zehenpunkten, auf die Plattenoberfläche
 *     heruntergerechnet → Fußpunkt im Bild und auf der Platte.
 *  3. Körpergröße = Pixelabstand Fußpunkt → Scheitel / s. Bei waagerechter Kamera ist das exakt,
 *     unabhängig von Brennweite und Kamerahöhe. Ist die Kamera geneigt (Lagesensor), wird mit den
 *     Sehstrahl-Winkeln korrigiert; dafür wird ein Bildwinkel angenommen (wirkt nur schwach).
 *
 * Bewusst NICHT: die komplette Kameralage aus der Platte berechnen. Getestet: Bei ±2 px
 * Tippfehler und einer Platte von ~160 × 40 px im Bild liegt die Höhe dann 10–40 cm daneben.
 *
 * Plattenkoordinaten in cm: X entlang der vorderen (kameranahen) Kante von links nach rechts,
 * Y von der vorderen Kante nach hinten, Z nach oben.
 */

export interface P2 { x: number; y: number }
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Sortiert vier angetippte Punkte: [vorne links, vorne rechts, hinten rechts, hinten links] (im Bild). */
export function orderCorners(pts: P2[]): [P2, P2, P2, P2] {
  if (pts.length !== 4) throw new Error('Genau vier Ecken nötig');
  const byY = [...pts].sort((a, b) => b.y - a.y); // vorne = unten im Bild = großes y
  const [n1, n2] = [byY[0], byY[1]].sort((a, b) => a.x - b.x);
  const [f1, f2] = [byY[2], byY[3]].sort((a, b) => a.x - b.x);
  return [n1, n2, f2, f1];
}

/** Löst A·x = b (n×n) mit Gauß-Elimination und Pivotsuche. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homographie von Plattenkoordinaten (cm) auf Bildpunkte (px). */
export function homography(plane: P2[], image: P2[]): Mat3 | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = plane[i];
    const { x: u, y: v } = image[i];
    A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
    A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
  }
  const h = solve(A, b);
  return h ? ([...h, 1] as Mat3) : null;
}

export function applyH(H: Mat3, p: P2): P2 {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

export interface Plate {
  /** Kante quer zur Kamera (links–rechts), cm. */
  widthCm: number;
  /** Kante von vorn nach hinten, cm. */
  depthCm: number;
}

export interface Calibration {
  corners: [P2, P2, P2, P2];
  H: Mat3;
  Hinv: Mat3;
  plate: Plate;
  width: number;
  height: number;
}

/** Kameraannahmen für die Neigungskorrektur. */
export interface CameraInfo {
  /** Brennweite in Pixeln (aus angenommenem Bildwinkel). */
  f: number;
  /** Neigung nach unten in Grad (positiv = Kamera schaut nach unten), 0 wenn unbekannt. */
  pitchDownDeg: number;
  /** Drehung der Kamera um die Blickachse in Grad (positiv = Kamera im Uhrzeigersinn, Bildinhalt dadurch gegen den Uhrzeigersinn), 0 wenn unbekannt. */
  rollDeg: number;
  /** Stammen pitch/roll vom Lagesensor? */
  fromSensor: boolean;
}

export function focalFromFov(fovDeg: number, width: number, height: number): number {
  return Math.max(width, height) / 2 / Math.tan((fovDeg * Math.PI) / 360);
}

export type CalibrationError = 'notFour' | 'notConvex' | 'degenerate' | 'plateSize';

export const CALIBRATION_MESSAGES: Record<CalibrationError, string> = {
  notFour: 'Tippe genau vier Ecken an.',
  notConvex: 'Die Ecken ergeben kein Viereck. Tippe sie noch einmal an.',
  degenerate: 'Aus diesen Ecken lässt sich nichts berechnen. Ist die ganze Platte im Bild?',
  plateSize: 'Bitte gib Breite und Tiefe der Platte ein.',
};

function isConvex(q: P2[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

export function calibrate(points: P2[], plate: Plate, width: number, height: number): Calibration | CalibrationError {
  if (!(plate.widthCm > 0 && plate.depthCm > 0)) return 'plateSize';
  if (points.length !== 4) return 'notFour';
  const corners = orderCorners(points);
  if (!isConvex(corners)) return 'notConvex';
  const planePts: P2[] = [{ x: 0, y: 0 }, { x: plate.widthCm, y: 0 }, { x: plate.widthCm, y: plate.depthCm }, { x: 0, y: plate.depthCm }];
  const H = homography(planePts, corners);
  const Hinv = H && invert3(H);
  if (!H || !Hinv) return 'degenerate';
  return { corners, H, Hinv, plate, width, height };
}

/** Pixel pro cm entlang der Plattenbreite (quer zur Kamera) an der Plattenstelle p. */
export function scaleAt(cal: Calibration, p: P2): number {
  const a = applyH(cal.H, { x: p.x - 0.5, y: p.y });
  const b = applyH(cal.H, { x: p.x + 0.5, y: p.y });
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Fußpunkt auf der Plattenoberfläche: Bildpunkt (Mitte der Fußpunkte, die footHeightCm über der
 * Platte liegen) um die Bildhöhe dieser Strecke nach unten schieben, dann auf die Platte abbilden.
 */
export function groundPoint(cal: Calibration, img: P2, footHeightCm: number, rollDeg = 0): { image: P2; plate: P2; scale: number } {
  let ground = img;
  let plate = applyH(cal.Hinv, ground);
  let s = scaleAt(cal, plate);
  const r = (rollDeg * Math.PI) / 180;
  for (let i = 0; i < 3; i++) {
    // „unten“ im Bild ist bei gedrehtem Handy schräg
    ground = { x: img.x - Math.sin(r) * footHeightCm * s, y: img.y + Math.cos(r) * footHeightCm * s };
    plate = applyH(cal.Hinv, ground);
    s = scaleAt(cal, plate);
  }
  return { image: ground, plate, scale: s };
}

/**
 * Höhe zwischen Fußpunkt und Scheitel in cm.
 * Ohne Neigung: (Δy in px) / s. Mit Neigung θ: über Sehstrahl-Winkel φ = atan((cy − y)/f) − θ,
 * Entfernung entlang der optischen Achse z = f/s, waagerechte Entfernung D = z / (cos θ − tan φ_Fuß · sin θ),
 * Höhe = D · (tan φ_Kopf − tan φ_Fuß).
 */
export function heightFromPoints(feet: P2, head: P2, s: number, cam: CameraInfo, width: number, height: number): number {
  const cx = width / 2, cy = height / 2;
  const r = (cam.rollDeg * Math.PI) / 180; // Bildinhalt zurückdrehen
  const rot = (p: P2): P2 => ({
    x: cx + (p.x - cx) * Math.cos(r) - (p.y - cy) * Math.sin(r),
    y: cy + (p.x - cx) * Math.sin(r) + (p.y - cy) * Math.cos(r),
  });
  const f = rot(feet), h = rot(head);
  const th = (cam.pitchDownDeg * Math.PI) / 180;
  const phiF = Math.atan((cy - f.y) / cam.f) - th;
  const phiH = Math.atan((cy - h.y) / cam.f) - th;
  const z = cam.f / s;
  const D = z / (Math.cos(th) - Math.tan(phiF) * Math.sin(th));
  return D * (Math.tan(phiH) - Math.tan(phiF));
}

/** Oberster Bildpunkt der Person in einem senkrechten Streifen der Segmentierungsmaske (Quellbild-Pixel). */
export function headTopFromMask(
  mask: { data: Float32Array; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  xCenter: number,
  halfWidth: number,
  threshold = config.height.maskThreshold,
  minRun = 3,
): number {
  const sx = mask.width / frameWidth;
  const sy = mask.height / frameHeight;
  const x0 = Math.max(0, Math.floor((xCenter - halfWidth) * sx));
  const x1 = Math.min(mask.width - 1, Math.ceil((xCenter + halfWidth) * sx));
  let run = 0;
  for (let y = 0; y < mask.height; y++) {
    let hit = false;
    for (let x = x0; x <= x1; x++) {
      if (mask.data[y * mask.width + x] > threshold) { hit = true; break; }
    }
    run = hit ? run + 1 : 0;
    if (run >= minRun) return (y - minRun + 1) / sy;
  }
  return NaN;
}

export interface HeightSample {
  /** Körpergröße über der Plattenoberfläche in cm (ungerundet), NaN = nicht messbar. */
  cm: number;
  headMethod: 'mask' | 'landmarks';
  /** Fußpunkt im Bild und auf der Platte, Maßstab dort (px/cm). */
  feetImage: P2 | null;
  feetPlate: P2 | null;
  scale: number;
  head: P2 | null;
  /** Steht die Person auf der Platte? */
  onPlate: boolean;
}

/** Eine Messung aus einem Frame. */
export function measureHeight(frame: PoseFrame, cal: Calibration, cam: CameraInfo, cfg = config.height, minV = config.position.minVisibility): HeightSample {
  const none: HeightSample = { cm: NaN, headMethod: 'landmarks', feetImage: null, feetPlate: null, scale: NaN, head: null, onPlate: false };
  const p = frame.image;
  if (!p) return none;

  // Körperachse: Mittel aus Ferse und Zehenpunkt beider Füße.
  const footIdx = [L.leftHeel, L.rightHeel, L.leftFootIndex, L.rightFootIndex].filter((i) => p[i].v >= minV);
  if (footIdx.length < 3) return none;
  const mean = { x: footIdx.reduce((a, i) => a + p[i].x, 0) / footIdx.length, y: footIdx.reduce((a, i) => a + p[i].y, 0) / footIdx.length };
  const g = groundPoint(cal, mean, cfg.footPointHeightCm, cam.rollDeg);
  const onPlate = g.plate.x >= 0 && g.plate.x <= cal.plate.widthCm && g.plate.y >= 0 && g.plate.y <= cal.plate.depthCm;

  // Scheitel: aus der Maske, wenn vorhanden; sonst aus den Gesichtspunkten geschätzt.
  const nose = p[L.nose];
  const earDist = Math.abs(p[L.leftEar].x - p[L.rightEar].x);
  const shoulderMidY = (p[L.leftShoulder].y + p[L.rightShoulder].y) / 2;
  let headY = NaN;
  let headMethod: HeightSample['headMethod'] = 'landmarks';
  if (frame.mask) {
    headY = headTopFromMask(frame.mask, frame.width, frame.height, nose.x, Math.max(earDist * 0.6, 8));
    if (Number.isFinite(headY) && headY < nose.y) headMethod = 'mask';
    else headY = NaN;
  }
  if (!Number.isFinite(headY)) headY = nose.y - 0.6 * Math.max(0, shoulderMidY - nose.y);
  const head = { x: nose.x, y: headY };

  const cm = heightFromPoints(g.image, head, g.scale, cam, frame.width, frame.height);
  return {
    cm: cm >= cfg.minCm && cm <= cfg.maxCm ? cm : NaN,
    headMethod, feetImage: g.image, feetPlate: g.plate, scale: g.scale, head, onPlate,
  };
}

/** Median einer Zahlenliste (NaN ignoriert). */
export function median(values: number[]): number {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Geschätzte Spanne (± cm), quadratisch addiert und aufgerundet aus:
 *  - Ecken einzeln um tapErrorPx verschoben (Wirkung der Kalibrierung, jeweils ungünstigste Richtung)
 *  - Neigung ± tiltError (mit/ohne Sensor), Bildwinkel ± fovUncertainty
 *  - Scheitel (Umriss/Gesicht) und Körperachse
 */
export function estimateUncertainty(cal: Calibration, sample: HeightSample, cam: CameraInfo, cfg = config.height): number {
  if (!sample.feetImage || !sample.head || !Number.isFinite(sample.cm)) return NaN;

  const calc = (c: Calibration, k: CameraInfo) => {
    const g = groundPoint(c, { x: sample.feetImage!.x, y: sample.feetImage!.y }, 0, k.rollDeg);
    return heightFromPoints(g.image, sample.head!, g.scale, k, cal.width, cal.height);
  };
  const ref = calc(cal, cam);
  let e2 = 0;
  for (let i = 0; i < 4; i++) {
    let worst = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const moved = cal.corners.map((c, j) => (j === i ? { x: c.x + dx * cfg.tapErrorPx, y: c.y + dy * cfg.tapErrorPx } : c));
      const c2 = calibrate(moved, cal.plate, cal.width, cal.height);
      if (typeof c2 === 'string') continue;
      const h = calc(c2, cam);
      if (Number.isFinite(h)) worst = Math.max(worst, Math.abs(h - ref));
    }
    e2 += worst * worst;
  }
  const tiltErr = cam.fromSensor ? cfg.tiltErrorWithSensorDeg : cfg.tiltErrorWithoutSensorDeg;
  const dTilt = Math.max(
    Math.abs(calc(cal, { ...cam, pitchDownDeg: cam.pitchDownDeg + tiltErr }) - ref),
    Math.abs(calc(cal, { ...cam, pitchDownDeg: cam.pitchDownDeg - tiltErr }) - ref),
  );
  const dF = Math.max(
    Math.abs(calc(cal, { ...cam, f: cam.f * (1 + cfg.fovUncertainty) }) - ref),
    Math.abs(calc(cal, { ...cam, f: cam.f * (1 - cfg.fovUncertainty) }) - ref),
  );
  const head = sample.headMethod === 'mask' ? cfg.headMaskErrorCm : cfg.headLandmarkErrorCm;
  return Math.ceil(Math.sqrt(e2 + dTilt * dTilt + dF * dF + head * head + cfg.feetAxisErrorCm * cfg.feetAxisErrorCm));
}
