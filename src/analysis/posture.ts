import { config } from '../config';
import { RAD2DEG } from './geometry';
import { L } from './landmarks';
import type { PoseFrame, Pt } from './types';

/**
 * Haltung frontal: Neigung der Schulter- und der Hüftlinie zur Bildhorizontalen.
 * Vorzeichen: positiv = linke Körperseite (aus Sicht der Person) höher. Unabhängig davon, ob die
 * Anzeige gespiegelt ist. Nur Werte, keine Bewertung.
 */
export interface LineTilt {
  /** Grad, positiv = links höher. NaN = nicht messbar. */
  deg: number;
}

export function lineTilt(left: Pt, right: Pt, minV: number): number {
  if (left.v < minV || right.v < minV) return NaN;
  const dx = Math.abs(left.x - right.x);
  const dy = right.y - left.y; // y nach unten: rechts tiefer → links höher → positiv
  if (dx === 0 && dy === 0) return NaN;
  return Math.atan2(dy, dx) * RAD2DEG;
}

export interface PostureSample { shoulder: number; pelvis: number }

export function postureSample(frame: PoseFrame, minV = config.position.minVisibility): PostureSample {
  const p = frame.image;
  if (!p) return { shoulder: NaN, pelvis: NaN };
  return {
    shoulder: lineTilt(p[L.leftShoulder], p[L.rightShoulder], minV),
    pelvis: lineTilt(p[L.leftHip], p[L.rightHip], minV),
  };
}

export interface PostureResult {
  /** Gerundet auf ganze Grad, NaN = nicht gemessen. */
  shoulderDeg: number;
  pelvisDeg: number;
  /** Anzahl ausgewerteter Frames je Größe. */
  shoulderFrames: number;
  pelvisFrames: number;
  totalFrames: number;
}

/**
 * Mittelwert über alle Frames. Ist weniger als minShare der Frames messbar, gilt der Wert als
 * „nicht gemessen“ (ehrlich statt geraten).
 */
export function summarizePosture(samples: PostureSample[], minShare = 0.5): PostureResult {
  const avg = (vals: number[]) => {
    const f = vals.filter(Number.isFinite);
    if (!samples.length || f.length / samples.length < minShare) return { v: NaN, n: f.length };
    const m = Math.round(f.reduce((a, b) => a + b, 0) / f.length);
    return { v: m === 0 ? 0 : m, n: f.length };
  };
  const s = avg(samples.map((x) => x.shoulder));
  const p = avg(samples.map((x) => x.pelvis));
  return { shoulderDeg: s.v, pelvisDeg: p.v, shoulderFrames: s.n, pelvisFrames: p.n, totalFrames: samples.length };
}

/** Text für die Anzeige, z. B. „links höher“. Keine Bewertung. */
export function tiltSideText(deg: number): string {
  if (!Number.isFinite(deg)) return 'nicht gemessen';
  if (deg === 0) return 'waagerecht';
  return deg > 0 ? 'links höher' : 'rechts höher';
}

/**
 * Neigung des Geräts aus DeviceOrientation (beta, gamma in Grad) und der Bildschirmdrehung
 * (screen.orientation.angle: 0, 90, 180, 270).
 * - roll: Drehung in der Bildschirmebene gegenüber der Senkrechten (verfälscht die gemessene Linienneigung direkt)
 * - pitch: wie weit der Bildschirm von der Senkrechten nach vorn/hinten gekippt ist
 * Herleitung: „oben“ der Welt im Gerätesystem = (−sin γ·cos β, sin β, cos γ·cos β).
 */
export function deviceTilt(beta: number, gamma: number, screenAngle = 0): { roll: number; pitch: number } {
  const b = beta / RAD2DEG;
  const g = gamma / RAD2DEG;
  const up = { x: -Math.sin(g) * Math.cos(b), y: Math.sin(b), z: Math.cos(g) * Math.cos(b) };
  const a = screenAngle / RAD2DEG;
  // Achsen des Bildschirminhalts im Gerätesystem (Winkel 90 = Gerät gegen den Uhrzeigersinn gedreht,
  // dann zeigt Geräte-x nach oben).
  const screenUp = { x: Math.sin(a), y: Math.cos(a) };
  const screenRight = { x: Math.cos(a), y: -Math.sin(a) };
  const u = up.x * screenUp.x + up.y * screenUp.y;
  const r = up.x * screenRight.x + up.y * screenRight.y;
  // Für die Neigung einer Linie zählt nur der Winkel modulo 180° → auf (−90, 90] bringen.
  let roll = Math.atan2(r, u) * RAD2DEG;
  if (roll > 90) roll -= 180;
  if (roll <= -90) roll += 180;
  return {
    roll: roll === 0 ? 0 : roll,
    pitch: Math.asin(Math.max(-1, Math.min(1, up.z))) * RAD2DEG,
  };
}
