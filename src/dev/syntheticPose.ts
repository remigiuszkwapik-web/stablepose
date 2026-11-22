import { L, SIDE } from '../analysis/landmarks';
import { swapLeftRight } from '../analysis/frame';
import type { PoseFrame, Pt, Side } from '../analysis/types';

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

/**
 * Drehbuch einer synthetischen Person für Entwicklung und Browser-Tests (nur mit ?synthetic im
 * Dev-Server). t = ms seit Start. Standbein links. Ablauf passt zum Einbeinstand-Ablauf:
 * 0–6,5 s normal stehen, dann Startposition; Fuß kurz ab bei 12–13 s; Hand weg bei 18–18,8 s.
 */
export function syntheticScript(t: number, stand: Side = 'left', still = false, view?: 'front' | 'side' | 'side2' | 'back'): PoseFrame {
  if (view === 'side2') return makeSidePose({ t, near: 'right', facing: 'imageLeft', headDeg: 8, trunkDeg: -2, legDeg: 2 });
  if (view === 'side') return makeSidePose({ t, headDeg: 12, trunkDeg: -2, legDeg: 1 });
  if (view === 'back') return makePose({ t, backToCamera: true, vis: { [L.nose]: 0.2, [L.leftEye]: 0.15, [L.rightEye]: 0.15, [L.leftEyeInner]: 0.1, [L.rightEyeInner]: 0.1 } });
  if (view === 'front') {
    const f = makePose({ t });
    f.image![L.leftShoulder] = { ...f.image![L.leftShoulder], y: f.image![L.leftShoulder].y - 8 };
    return f;
  }
  const s = (t % 32000) / 1000;
  const sway = Math.sin(t / 700) * 4;
  if (still || s < 6.5) return makePose({ t, hands: 'down', dx: sway });
  const footDown = s >= 12 && s < 13;
  const handOff = s >= 18 && s < 18.8;
  return makePose({ t, stand, lift: footDown ? 0 : 0.15, hands: handOff ? 'rightOff' : 'hips', flexDeg: 15, abdDeg: 5, dx: sway });
}

/**
 * Synthetische Person in Seitansicht (Hochformat 720 × 1280). Winkel in Grad, positiv = nach vorn.
 * facing: Blickrichtung im Bild. near: Körperseite zur Kamera (die andere ist schlecht sichtbar).
 */
export function makeSidePose(o: { facing?: 'imageLeft' | 'imageRight'; near?: Side; headDeg?: number; trunkDeg?: number; legDeg?: number; kneeDx?: number; t?: number } = {}): PoseFrame {
  const f = o.facing === 'imageLeft' ? -1 : 1;
  const near = o.near ?? 'left';
  const tan = (d = 0) => Math.tan((d * Math.PI) / 180);
  const ankle = { x: 360, y: 1080 };
  const hip = { x: ankle.x + f * tan(o.legDeg) * 520, y: 560 };
  const knee = { x: (hip.x + ankle.x) / 2 + f * (o.kneeDx ?? 0), y: 820 };
  const shoulder = { x: hip.x + f * tan(o.trunkDeg) * 260, y: 300 };
  const ear = { x: shoulder.x + f * tan(o.headDeg) * 105, y: 195 };
  const P = (x: number, y: number, v: number): Pt => ({ x, y, z: 0, v });
  const pts: Pt[] = Array.from({ length: 33 }, () => P(hip.x, hip.y, 0.3));
  const sides: [Side, number][] = [['left', 0], ['right', 0]];
  for (const [side] of sides) {
    const v = side === near ? 0.95 : 0.3;
    const s = SIDE[side];
    pts[s.shoulder] = P(shoulder.x, shoulder.y, v);
    pts[s.elbow] = P(shoulder.x, 430, v);
    pts[s.wrist] = P(shoulder.x + f * 10, 560, v);
    pts[s.hip] = P(hip.x, hip.y, v);
    pts[s.knee] = P(knee.x, knee.y, v);
    pts[s.ankle] = P(ankle.x, ankle.y, v);
    pts[s.heel] = P(ankle.x - f * 15, 1095, v);
    pts[s.footIndex] = P(ankle.x + f * 45, 1112, v);
  }
  pts[near === 'left' ? L.leftEar : L.rightEar] = P(ear.x, ear.y, 0.95);
  pts[near === 'left' ? L.rightEar : L.leftEar] = P(ear.x, ear.y, 0.2);
  pts[near === 'left' ? L.leftEye : L.rightEye] = P(ear.x + f * 30, 185, 0.95);
  pts[near === 'left' ? L.rightEye : L.leftEye] = P(ear.x + f * 30, 185, 0.4);
  pts[L.nose] = P(ear.x + f * 45, 200, 0.95);
  return { t: o.t ?? 0, width: W, height: H, image: pts, world: null };
}
