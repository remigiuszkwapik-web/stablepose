import { config } from '../config';
import { mid, RAD2DEG } from './geometry';
import { L } from './landmarks';
import { nearSide, type View } from './position';
import { lineTilt } from './posture';
import { swapLeftRight } from './frame';
import type { PoseFrame, Pt } from './types';

/**
 * Haltung in drei Ansichten. Reine Funktionen, nur Werte in ganzen Grad, keine Bewertung.
 *
 * Vorne und hinten (Vorzeichen: positiv = linke Körperseite aus Sicht der Person):
 *  - shoulder: Schulterlinie zur Waagerechten, + = links höher
 *  - pelvis:   Hüftlinie zur Waagerechten, + = links höher
 *  - head:     Ohrlinie zur Waagerechten, + = links höher (Kopf zur rechten Seite geneigt)
 *  - trunk:    Rumpfachse (Hüftmitte → Schultermitte) zur Senkrechten, + = Oberkörper nach links
 *
 * Seitlich (Vorzeichen: positiv = nach vorn, also in Blickrichtung):
 *  - head:  Linie Schulter → Ohr zur Senkrechten (+ = Ohr vor der Schulter)
 *  - trunk: Linie Hüfte → Schulter zur Senkrechten (+ = Schulter vor der Hüfte)
 *  - leg:   Linie Knöchel → Hüfte zur Senkrechten (+ = Hüfte vor dem Knöchel)
 *  - knee:  Abweichung des Knies von der Linie Hüfte–Knöchel in Grad (+ = Knie vor der Linie)
 *
 * Alle Werte beziehen sich auf die Bild-Senkrechte: Das Handy muss gerade stehen.
 */
export type FrontBackKey = 'shoulder' | 'pelvis' | 'head' | 'trunk';
export type SideKey = 'head' | 'trunk' | 'leg' | 'knee';
export type MetricKey = FrontBackKey | SideKey;

export type ViewSample = Partial<Record<MetricKey, number>>;

export interface ViewMeta {
  /** Rückansicht: MediaPipe hatte links/rechts vertauscht und wurde korrigiert. */
  swapped?: boolean;
  /** Seitansicht: welche Seite zur Kamera zeigt und wohin die Person schaut (im Bild). */
  near?: 'left' | 'right';
  facing?: 'imageLeft' | 'imageRight';
}

const deg = (rad: number) => rad * RAD2DEG;

/** Winkel der Strecke unten → oben zur Bild-Senkrechten. sign = Richtung, die positiv zählt (+1 = Bild rechts). */
function fromVertical(lower: Pt, upper: Pt, sign: number): number {
  const dx = (upper.x - lower.x) * sign;
  const dy = lower.y - upper.y; // nach oben positiv
  if (dy <= 0) return NaN;
  return deg(Math.atan2(dx, dy));
}

/**
 * Rückansicht: Von hinten liegt die linke Körperseite im Bild links (kleineres x). Liefert MediaPipe
 * das umgekehrt (es hält die Person dann für frontal), werden die Seiten getauscht.
 */
export function fixBackLabels(points: Pt[]): { points: Pt[]; swapped: boolean } {
  const lr = points[L.leftShoulder].x - points[L.rightShoulder].x + (points[L.leftHip].x - points[L.rightHip].x);
  return lr > 0 ? { points: swapLeftRight(points), swapped: true } : { points, swapped: false };
}

export function frontBackSample(p: Pt[], minV = config.position.minVisibility, earMinV = minV): ViewSample {
  const ls = p[L.leftShoulder], rs = p[L.rightShoulder], lh = p[L.leftHip], rh = p[L.rightHip];
  const body = [ls, rs, lh, rh].every((q) => q.v >= minV);
  // Richtung „linke Körperseite“ im Bild (vorne: rechts, hinten: links)
  const leftDir = Math.sign(lh.x - rh.x) || 1;
  return {
    shoulder: lineTilt(ls, rs, minV),
    pelvis: lineTilt(lh, rh, minV),
    head: lineTilt(p[L.leftEar], p[L.rightEar], earMinV),
    trunk: body ? fromVertical(mid(lh, rh), mid(ls, rs), leftDir) : NaN,
  };
}

export function sideSample(p: Pt[], minV = config.position.minVisibility): { sample: ViewSample; meta: ViewMeta } {
  const near = nearSide(p);
  const s = near === 'left'
    ? { ear: L.leftEar, shoulder: L.leftShoulder, hip: L.leftHip, knee: L.leftKnee, ankle: L.leftAnkle }
    : { ear: L.rightEar, shoulder: L.rightShoulder, hip: L.rightHip, knee: L.rightKnee, ankle: L.rightAnkle };
  const ok = (...idx: number[]) => idx.every((i) => p[i].v >= minV);
  // Blickrichtung: Nase liegt vor dem Ohr.
  const fwd = Math.sign(p[L.nose].x - p[s.ear].x) || 1;
  const kneeDev = () => {
    const hip = p[s.hip], knee = p[s.knee], ankle = p[s.ankle];
    // Winkel zwischen Hüfte→Knöchel und Hüfte→Knie, Vorzeichen: Knie vor der Linie = +
    const a = Math.atan2(ankle.x - hip.x, ankle.y - hip.y);
    const b = Math.atan2(knee.x - hip.x, knee.y - hip.y);
    return deg(b - a) * fwd;
  };
  return {
    sample: {
      head: ok(s.ear, s.shoulder) ? fromVertical(p[s.shoulder], p[s.ear], fwd) : NaN,
      trunk: ok(s.shoulder, s.hip) ? fromVertical(p[s.hip], p[s.shoulder], fwd) : NaN,
      leg: ok(s.hip, s.ankle) ? fromVertical(p[s.ankle], p[s.hip], fwd) : NaN,
      knee: ok(s.hip, s.knee, s.ankle) ? kneeDev() : NaN,
    },
    meta: { near, facing: fwd > 0 ? 'imageRight' : 'imageLeft' },
  };
}

/** Messgrößen eines Frames für die gewählte Ansicht. */
export function viewSample(frame: PoseFrame, view: View): { sample: ViewSample; meta: ViewMeta } {
  const p = frame.image;
  if (!p) return { sample: {}, meta: {} };
  if (view === 'side') return sideSample(p);
  if (view === 'back') {
    const fixed = fixBackLabels(p);
    return { sample: frontBackSample(fixed.points, config.position.minVisibility, config.posture.backHeadMinVisibility), meta: { swapped: fixed.swapped } };
  }
  return { sample: frontBackSample(p), meta: {} };
}

export const VIEW_KEYS: Record<View, MetricKey[]> = {
  front: ['shoulder', 'pelvis', 'head', 'trunk'],
  back: ['shoulder', 'pelvis', 'head', 'trunk'],
  side: ['head', 'trunk', 'leg', 'knee'],
};

/** Mittelwert je Größe in ganzen Grad; zu wenige messbare Frames (< minShare) → NaN. */
export function summarizeView(samples: ViewSample[], view: View, minShare = 0.5): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const k of VIEW_KEYS[view]) {
    const vals = samples.map((s) => s[k]).filter((v): v is number => Number.isFinite(v));
    if (!samples.length || vals.length / samples.length < minShare) { out[k] = NaN; continue; }
    const m = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    out[k] = m === 0 ? 0 : m;
  }
  return out;
}

export const METRIC_LABELS: Record<View, Partial<Record<MetricKey, string>>> = {
  front: { shoulder: 'Schulterlinie', pelvis: 'Beckenlinie', head: 'Kopf (Ohrlinie)', trunk: 'Rumpfachse' },
  back: { shoulder: 'Schulterlinie', pelvis: 'Beckenlinie', head: 'Kopf (Ohrlinie)', trunk: 'Rumpfachse' },
  side: { head: 'Ohr zur Schulter', trunk: 'Schulter zur Hüfte', leg: 'Hüfte zum Knöchel', knee: 'Knie zur Linie Hüfte–Knöchel' },
};

/** Richtungstext ohne Bewertung. */
export function directionText(view: View, key: MetricKey, value: number): string {
  if (!Number.isFinite(value)) return 'nicht gemessen';
  if (value === 0) return view === 'side' ? 'im Lot' : 'waagerecht';
  if (view === 'side') {
    if (key === 'knee') return value > 0 ? 'Knie davor' : 'Knie dahinter';
    return value > 0 ? 'nach vorn' : 'nach hinten';
  }
  if (key === 'trunk') return value > 0 ? 'nach links geneigt' : 'nach rechts geneigt';
  return value > 0 ? 'links höher' : 'rechts höher';
}

export interface AsymmetryItem { view: View; label: string; deg: number; text: string }

/** Übersicht der Abweichungen ab minDeg, größte zuerst. Nur Beschreibung, keine Bewertung. */
export function asymmetries(results: Partial<Record<View, Partial<Record<MetricKey, number>>>>, minDeg = config.posture.asymmetryListMinDeg): AsymmetryItem[] {
  const items: AsymmetryItem[] = [];
  for (const view of ['front', 'side', 'back'] as View[]) {
    const r = results[view];
    if (!r) continue;
    for (const k of VIEW_KEYS[view]) {
      const v = r[k];
      if (v === undefined || !Number.isFinite(v) || Math.abs(v) < minDeg) continue;
      items.push({ view, label: METRIC_LABELS[view][k]!, deg: Math.abs(v), text: directionText(view, k, v) });
    }
  }
  return items.sort((a, b) => b.deg - a.deg);
}
