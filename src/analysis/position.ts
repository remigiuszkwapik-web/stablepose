import { config } from '../config';
import { mid, dist2 } from './geometry';
import { L } from './landmarks';
import type { PoseFrame, Pt } from './types';

export type PositionIssue =
  | 'noPerson' | 'stepBack' | 'headMissing' | 'feetMissing'
  | 'moveCloser' | 'center' | 'turnFrontal' | 'lowVisibility';

export const POSITION_MESSAGES: Record<PositionIssue, string> = {
  noPerson: 'Stell dich vor die Kamera',
  stepBack: 'Geh einen Schritt zurück',
  headMissing: 'Dein Kopf ist nicht im Bild',
  feetMissing: 'Deine Füße sind nicht im Bild',
  moveCloser: 'Komm einen Schritt näher',
  center: 'Stell dich in die Bildmitte',
  turnFrontal: 'Dreh dich frontal zur Kamera',
  lowVisibility: 'Ich sehe dich nicht deutlich. Mehr Licht hilft.',
};

export interface PositionResult {
  ok: boolean;
  /** Alle gefundenen Probleme, wichtigstes zuerst. */
  issues: PositionIssue[];
  /** Anweisung für das wichtigste Problem, sonst null. */
  message: string | null;
  metrics: {
    bodyHeight: number;
    centerOffset: number;
    shoulderRatio: number;
    hipRatio: number;
  };
}

export type PositionConfig = typeof config.position;

const HEAD = [L.nose, L.leftEye, L.rightEye, L.leftEar, L.rightEar];
const FEET = [L.leftAnkle, L.rightAnkle, L.leftHeel, L.rightHeel, L.leftFootIndex, L.rightFootIndex];
const BODY = [L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip, L.leftKnee, L.rightKnee];

const ORDER: PositionIssue[] = ['noPerson', 'stepBack', 'headMissing', 'feetMissing', 'moveCloser', 'center', 'turnFrontal', 'lowVisibility'];

/**
 * Prüft, ob die ganze Person (Kopf bis Füße) gut sichtbar und frontal im Bild steht.
 * Reine Funktion.
 */
export function checkPosition(frame: PoseFrame, cfg: PositionConfig = config.position): PositionResult {
  const empty = { bodyHeight: NaN, centerOffset: NaN, shoulderRatio: NaN, hipRatio: NaN };
  const p = frame.image;
  if (!p) return result(['noPerson'], empty);

  const { width: w, height: h } = frame;
  const minV = cfg.minVisibility;
  const issues = new Set<PositionIssue>();
  const vis = (i: number) => p[i].v >= minV;

  const shoulderMid = mid(p[L.leftShoulder], p[L.rightShoulder]);
  const hipMid = mid(p[L.leftHip], p[L.rightHip]);
  const torso = dist2(shoulderMid, hipMid);

  // Kopf: Augen/Nase sichtbar? Scheitel liegt grob 0,6 × (Schulter–Nase) über der Nase (geschätzt).
  const headVisible = HEAD.filter(vis).length >= 3;
  const nose = p[L.nose];
  const headTop = nose.y - 0.6 * Math.max(0, shoulderMid.y - nose.y);
  const headOut = !headVisible || headTop < cfg.edgeMargin * h;

  // Füße: mindestens Knöchel und ein weiterer Fußpunkt je Seite sichtbar und nicht am unteren Rand.
  const feetVisible = FEET.filter(vis).length >= 4;
  const feetBottom = Math.max(...FEET.map((i) => p[i].y));
  const feetOut = !feetVisible || feetBottom > (1 - cfg.edgeMargin) * h;

  if (headOut && feetOut) issues.add('stepBack');
  else if (headOut) issues.add('headMissing');
  else if (feetOut) issues.add('feetMissing');

  const bodyHeight = (feetBottom - headTop) / h;
  if (!headOut && !feetOut && bodyHeight < cfg.minBodyHeight) issues.add('moveCloser');

  const xs = [...HEAD, ...BODY, ...FEET].map((i) => p[i].x);
  const sideOut = Math.min(...xs) < cfg.edgeMargin * w || Math.max(...xs) > (1 - cfg.edgeMargin) * w;
  const centerOffset = Math.abs(hipMid.x / w - 0.5);
  if (sideOut || centerOffset > cfg.maxCenterOffset) issues.add('center');

  const shoulderRatio = torso > 0 ? dist2(p[L.leftShoulder], p[L.rightShoulder]) / torso : 0;
  const hipRatio = torso > 0 ? dist2(p[L.leftHip], p[L.rightHip]) / torso : 0;
  // Frontal: Schultern und Hüfte breit genug und linke Seite liegt im Bild rechts (Person schaut zur Kamera).
  const facingCamera = p[L.leftShoulder].x > p[L.rightShoulder].x && p[L.leftHip].x > p[L.rightHip].x;
  if (shoulderRatio < cfg.minShoulderToTorsoRatio || hipRatio < cfg.minHipToTorsoRatio || !facingCamera) {
    issues.add('turnFrontal');
  }

  if (!BODY.every(vis)) issues.add('lowVisibility');

  return result([...issues], { bodyHeight, centerOffset, shoulderRatio, hipRatio });
}

function result(issues: PositionIssue[], metrics: PositionResult['metrics']): PositionResult {
  const sorted = ORDER.filter((i) => issues.includes(i));
  return { ok: sorted.length === 0, issues: sorted, message: sorted.length ? POSITION_MESSAGES[sorted[0]] : null, metrics };
}

/** Hilfsfunktion für Tests und Debug: Punkt sichtbar? */
export const isVisible = (pt: Pt, min: number) => pt.v >= min;
