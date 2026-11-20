import { L, SIDE } from '../../src/analysis/landmarks';
import { swapLeftRight } from '../../src/analysis/frame';
import type { PoseFrame, Pt, Side } from '../../src/analysis/types';

/**
 * Synthetische Person, frontal zur Kamera, im Hochformat 720 × 1280.
 * Links (aus Sicht der Person) liegt im ungespiegelten Kamerabild rechts (größeres x).
 */
export interface PoseOpts {
  t?: number;
  /** Standbein; ohne Angabe stehen beide Füße am Boden. */
  stand?: Side;
  /** Höhe des Spielfußes in Beinlängen. */
  lift?: number;
  hands?: 'hips' | 'down' | 'leftOff' | 'rightOff';
  /** Hüftwinkel des Spielbeins (World). */
  flexDeg?: number;
  abdDeg?: number;
  /** Ferse des Standfußes um so viele Beinlängen anheben. */
  heelLift?: number;
  /** Drehung um die Hochachse in Grad (0 = frontal). */
  turnDeg?: number;
  /** Skalierung um die Bildmitte (kleiner = weiter weg). */
  scale?: number;
  /** Verschiebung in Pixeln. */
  dx?: number;
  dy?: number;
  /** Sichtbarkeit einzelner Punkte überschreiben. */
  vis?: Partial<Record<number, number>>;
  /**
   * Gespiegelt gespeichertes Selfie-Video: Bild ist gespiegelt, und MediaPipe beschriftet deshalb
   * die linke Körperseite als rechte (x gespiegelt UND Beschriftung vertauscht).
   */
  mirrored?: boolean;
  /** Person steht mit dem Rücken zur Kamera (x gespiegelt, Beschriftung korrekt). */
  backToCamera?: boolean;
  noPerson?: boolean;
}

export const W = 720;
export const H = 1280;
const CX = 360;
const LEG = 520; // Hüfte → Knöchel in Pixeln
const TORSO = 260;

export function makePose(o: PoseOpts = {}): PoseFrame {
  const t = o.t ?? 0;
  if (o.noPerson) return { t, width: W, height: H, image: null, world: null };

  // [dx relativ zur Mitte, y] – dx positiv = linke Körperseite (im Bild rechts)
  const base: [number, number][] = Array.from({ length: 33 }, () => [0, 0]);
  const set = (i: number, dx: number, y: number) => { base[i] = [dx, y]; };
  set(L.nose, 0, 200);
  set(L.leftEyeInner, 8, 186); set(L.leftEye, 15, 185); set(L.leftEyeOuter, 22, 186);
  set(L.rightEyeInner, -8, 186); set(L.rightEye, -15, 185); set(L.rightEyeOuter, -22, 186);
  set(L.leftEar, 35, 195); set(L.rightEar, -35, 195);
  set(L.mouthLeft, 10, 225); set(L.mouthRight, -10, 225);
  set(L.leftShoulder, 80, 300); set(L.rightShoulder, -80, 300);
  set(L.leftHip, 50, 560); set(L.rightHip, -50, 560);
  set(L.leftKnee, 55, 820); set(L.rightKnee, -55, 820);
  set(L.leftAnkle, 55, 1080); set(L.rightAnkle, -55, 1080);
  set(L.leftHeel, 52, 1095); set(L.rightHeel, -52, 1095);
  set(L.leftFootIndex, 65, 1112); set(L.rightFootIndex, -65, 1112);

  const armsHips = (side: Side) => {
    const k = side === 'left' ? 1 : -1;
    const s = SIDE[side];
    set(s.elbow, k * 160, 430);
    set(s.wrist, k * 70, 535);
  };
  const armsDown = (side: Side) => {
    const k = side === 'left' ? 1 : -1;
    const s = SIDE[side];
    set(s.elbow, k * 95, 440);
    set(s.wrist, k * 100, 600 + 80);
  };
  const hands = o.hands ?? 'down';
  (['left', 'right'] as Side[]).forEach((side) => {
    const off = (hands === 'leftOff' && side === 'left') || (hands === 'rightOff' && side === 'right') || hands === 'down';
    (off ? armsDown : armsHips)(side);
  });
  // Hand-Nebenpunkte am Handgelenk
  for (const [w, ...fingers] of [[L.leftWrist, L.leftPinky, L.leftIndex, L.leftThumb], [L.rightWrist, L.rightPinky, L.rightIndex, L.rightThumb]]) {
    for (const f of fingers) base[f] = [base[w][0], base[w][1] + 15];
  }

  if (o.stand) {
    const sw = SIDE[o.stand === 'left' ? 'right' : 'left'];
    const up = (o.lift ?? 0) * LEG;
    for (const i of [sw.ankle, sw.heel, sw.footIndex]) base[i] = [base[i][0], base[i][1] - up];
    base[sw.knee] = [base[sw.knee][0], base[sw.knee][1] - up / 2];
  }
  if (o.stand && o.heelLift) {
    const st = SIDE[o.stand];
    base[st.heel] = [base[st.heel][0], base[st.heel][1] - o.heelLift * LEG];
  }

  const cos = Math.cos(((o.turnDeg ?? 0) * Math.PI) / 180);
  const sc = o.scale ?? 1;
  const image: Pt[] = base.map(([dx, y], i) => ({
    x: CX + dx * cos * sc + (o.dx ?? 0),
    y: H / 2 + (y - H / 2) * sc + (o.dy ?? 0),
    z: 0,
    v: o.vis?.[i] ?? 0.95,
  }));

  // World: Meter, Ursprung Hüftmitte, y nach unten. Aus dem Bild abgeleitet (0,9 m Beinlänge).
  const m = 0.9 / LEG;
  const world: Pt[] = base.map(([dx, y], i) => ({ x: dx * m * cos, y: (y - 560) * m, z: dx * m * Math.sin(((o.turnDeg ?? 0) * Math.PI) / 180), v: o.vis?.[i] ?? 0.95 }));
  if (o.stand) {
    const swingSide: Side = o.stand === 'left' ? 'right' : 'left';
    const sw = SIDE[swingSide];
    const outSign = swingSide === 'left' ? 1 : -1;
    const f = Math.tan(((o.flexDeg ?? 0) * Math.PI) / 180);
    const a = Math.tan(((o.abdDeg ?? 0) * Math.PI) / 180);
    const len = 0.45;
    const n = Math.hypot(1, f, a);
    const hip = world[sw.hip];
    world[sw.knee] = { x: hip.x + (outSign * a * len) / n, y: hip.y + len / n, z: hip.z - (f * len) / n, v: world[sw.knee].v };
  }

  let img = image;
  let wld = world;
  if (o.mirrored || o.backToCamera) {
    img = img.map((p) => ({ ...p, x: W - p.x }));
    wld = wld.map((p) => ({ ...p, x: -p.x }));
  }
  if (o.mirrored) {
    img = swapLeftRight(img);
    wld = swapLeftRight(wld);
  }
  return { t, width: W, height: H, image: img, world: wld };
}

export { TORSO, LEG };
