import { config } from '../config';
import { angle3, dist2, dot, mid, norm, RAD2DEG, scale, sub, type Vec } from './geometry';
import { SIDE } from './landmarks';
import { otherSide, type PoseFrame, type Pt, type Side } from './types';

export type SingleLegConfig = typeof config.singleLeg;

/** Messgrößen für den Einbeinstand in einem Frame. NaN = nicht messbar. */
export interface StanceMetrics {
  /** Standbein und Rumpf ausreichend sichtbar, so dass Längen stimmen. */
  valid: boolean;
  legLength: number;
  torsoLength: number;
  /** Höhe des Spielfußes über dem Standfuß, relativ zur Beinlänge (positiv = oben). */
  footLift: number;
  /** Abstand Handgelenk → gleichseitige Hüfte, relativ zur Rumpflänge. */
  wristHip: { left: number; right: number };
  /** Ellbogenwinkel je Seite in Grad (180 = gestreckt). */
  elbow: { left: number; right: number };
  /** Beugung (nach vorn) und Abspreizung (nach außen) der Spielbein-Hüfte in Grad, aus World Landmarks. */
  hipFlexionDeg: number;
  hipAbductionDeg: number;
  /** Höhenunterschied Ferse ↔ Zehenpunkt des Standfußes, relativ zur Beinlänge (experimentell). */
  standHeelToe: number;
}

const visible = (p: Pt, min: number) => p.v >= min;

/** Tiefster (größtes y) sichtbarer Punkt eines Fußes, oder NaN. */
function footLowestY(p: Pt[], side: Side, minV: number): number {
  const s = SIDE[side];
  const ys = [s.ankle, s.heel, s.footIndex].map((i) => p[i]).filter((q) => visible(q, minV)).map((q) => q.y);
  return ys.length ? Math.max(...ys) : NaN;
}

const unit = (v: Vec): Vec => {
  const n = norm(v);
  return n > 0 ? scale(v, 1 / n) : { x: NaN, y: NaN, z: NaN };
};
/** v ohne Anteil entlang der Einheitsrichtung u. */
const reject = (v: Vec, u: Vec): Vec => sub(v, scale(u, dot(v, u)));

/**
 * Hüftwinkel des Spielbeins im Körper-Koordinatensystem (World Landmarks, Meter).
 * - „unten“ = Richtung Schultermitte → Hüftmitte (Rumpfachse)
 * - „außen“ = von der Standbein-Hüfte zur Spielbein-Hüfte
 * - „vorn“  = zur Kamera hin (−z)
 * Beugung = Winkel des Oberschenkels nach vorn, Abspreizung = nach außen, jeweils gegen die Rumpfachse.
 */
export function hipAngles(world: Pt[], stand: Side, minV: number): { flexion: number; abduction: number } {
  const swing = otherSide(stand);
  const s = SIDE[swing];
  const t = SIDE[stand];
  const need = [s.hip, t.hip, s.knee, s.shoulder, t.shoulder];
  if (!need.every((i) => visible(world[i], minV))) return { flexion: NaN, abduction: NaN };

  const hipMid = mid(world[s.hip], world[t.hip]);
  const shoulderMid = mid(world[s.shoulder], world[t.shoulder]);
  const down = unit(sub(hipMid, shoulderMid));
  const out = unit(reject(sub(world[s.hip], world[t.hip]), down));
  const fwd = unit(reject(reject({ x: 0, y: 0, z: -1 }, down), out));
  const thigh = sub(world[s.knee], world[s.hip]);

  const d = dot(thigh, down);
  return {
    flexion: Math.atan2(dot(thigh, fwd), d) * RAD2DEG,
    abduction: Math.atan2(dot(thigh, out), d) * RAD2DEG,
  };
}

export function stanceMetrics(frame: PoseFrame, stand: Side, minV = config.position.minVisibility): StanceMetrics {
  const nan: StanceMetrics = {
    valid: false, legLength: NaN, torsoLength: NaN, footLift: NaN,
    wristHip: { left: NaN, right: NaN }, elbow: { left: NaN, right: NaN }, hipFlexionDeg: NaN, hipAbductionDeg: NaN, standHeelToe: NaN,
  };
  const p = frame.image;
  if (!p) return nan;
  const st = SIDE[stand];
  const sw = SIDE[otherSide(stand)];

  const coreOk = [st.hip, sw.hip, st.ankle, SIDE.left.shoulder, SIDE.right.shoulder].every((i) => visible(p[i], minV));
  const legLength = dist2(p[st.hip], p[st.ankle]);
  const torsoLength = dist2(mid(p[SIDE.left.shoulder], p[SIDE.right.shoulder]), mid(p[SIDE.left.hip], p[SIDE.right.hip]));

  const standLow = footLowestY(p, stand, minV);
  const swingLow = footLowestY(p, otherSide(stand), minV);
  const footLift = (standLow - swingLow) / legLength;

  const wh = (side: Side) => {
    const s = SIDE[side];
    if (!visible(p[s.wrist], minV) || !visible(p[s.hip], minV)) return NaN;
    return dist2(p[s.wrist], p[s.hip]) / torsoLength;
  };

  const elbow = (side: Side) => {
    const s = SIDE[side];
    if (![s.shoulder, s.elbow, s.wrist].every((i) => visible(p[i], minV))) return NaN;
    return angle3(p[s.shoulder], p[s.elbow], p[s.wrist]);
  };

  const heel = p[st.heel];
  const toe = p[st.footIndex];
  const standHeelToe = visible(heel, minV) && visible(toe, minV) ? (heel.y - toe.y) / legLength : NaN;

  const angles = frame.world ? hipAngles(frame.world, stand, minV) : { flexion: NaN, abduction: NaN };

  return {
    valid: coreOk && legLength > 0 && torsoLength > 0,
    legLength,
    torsoLength,
    footLift,
    wristHip: { left: wh('left'), right: wh('right') },
    elbow: { left: elbow('left'), right: elbow('right') },
    hipFlexionDeg: angles.flexion,
    hipAbductionDeg: angles.abduction,
    standHeelToe,
  };
}

/** Hand dieser Seite liegt an der Hüfte: Handgelenk nah am Hüftpunkt und Arm gebeugt. */
export function handOnHip(m: StanceMetrics, side: Side, cfg: SingleLegConfig = config.singleLeg): boolean {
  return m.wristHip[side] <= cfg.handsOnHipMax && m.elbow[side] <= cfg.elbowBentMaxDeg;
}

/** Hand dieser Seite ist deutlich von der Hüfte weg (für die Fehlerzählung, mit Hysterese). */
export function handOffHip(m: StanceMetrics, side: Side, cfg: SingleLegConfig = config.singleLeg): boolean {
  return m.wristHip[side] > cfg.handsOffHipMin || m.elbow[side] > cfg.elbowStraightMinDeg;
}

/** Beide Hände an der Hüfte. */
export function handsOnHips(m: StanceMetrics, cfg: SingleLegConfig = config.singleLeg): boolean {
  return handOnHip(m, 'left', cfg) && handOnHip(m, 'right', cfg);
}

/** Richtige Startposition: Spielbein angehoben und Hände an der Hüfte. */
export function isStartPose(m: StanceMetrics, cfg: SingleLegConfig = config.singleLeg): boolean {
  return m.valid && m.footLift >= cfg.footRaisedMin && handsOnHips(m, cfg);
}

/** Was fehlt noch zur Startposition? Für die Anweisung an die Person. */
export function startPoseHint(m: StanceMetrics, stand: Side, cfg: SingleLegConfig = config.singleLeg): string | null {
  if (!m.valid) return 'Bleib ganz im Bild';
  const lift = !(m.footLift >= cfg.footRaisedMin);
  const hands = !handsOnHips(m, cfg);
  const leg = stand === 'left' ? 'rechte' : 'linke';
  if (lift && hands) return `Hände an die Hüfte und das ${leg} Bein anheben`;
  if (lift) return `Heb das ${leg} Bein an`;
  if (hands) return 'Leg beide Hände an die Hüfte';
  return null;
}
