import { config } from '../config';
import { handOffHip, type SingleLegConfig, type StanceMetrics } from './stance';
import { SIDE } from './landmarks';
import { otherSide, type Side } from './types';

/**
 * Fehlerzählung nach den BESS-Fehlerkriterien, soweit sie mit Körperpunkten erkennbar sind.
 * Reine Funktionen, kein DOM.
 *
 * BESS-Fehler (Riemann & Guskiewicz) und wie wir sie behandeln:
 *  1. Hände von den Beckenkämmen genommen      → handsOff       (gemessen)
 *  2. Augen geöffnet                            → entfällt (Test mit offenen Augen, nicht gemessen)
 *  3. Schritt, Stolpern, Fallen                 → footDown       (gemessen: Spielfuß setzt auf)
 *  4. Hüfte > 30° gebeugt oder abgespreizt      → hipAngle       (gemessen, World Landmarks)
 *  5. Vorfuß oder Ferse angehoben               → standFootLift  (experimentell, getrennt ausgewiesen)
 *  6. Länger als 5 s aus der Testposition       → outOfPosition  (gemessen über die Dauer)
 * Regeln: gleichzeitige Fehler zählen einmal; höchstens 10 pro Versuch; wer die Position nicht
 * mindestens 5 s halten kann, bekommt 10.
 */
export type ConditionType = 'handsOff' | 'footDown' | 'hipAngle' | 'standFootLift';
export type ErrorType = ConditionType | 'outOfPosition';

export const ERROR_TYPES: ErrorType[] = ['handsOff', 'footDown', 'hipAngle', 'outOfPosition', 'standFootLift'];

export const ERROR_LABELS: Record<ErrorType, string> = {
  handsOff: 'Hände von der Hüfte',
  footDown: 'Fuß abgesetzt / Schritt',
  hipAngle: 'Hüfte über 30° gebeugt/abgespreizt',
  outOfPosition: 'Länger als 5 s aus der Position',
  standFootLift: 'Ferse/Vorfuß angehoben (experimentell)',
};

/** true = Fehlerbedingung erfüllt, false = nicht, null = in diesem Frame nicht messbar. */
export type Conditions = Record<ConditionType, boolean | null>;

/** Ausgangswert für die experimentelle Fersen-/Vorfuß-Erkennung (zu Beginn der Messung). */
export interface Baseline { standHeelToe: number }

/** Fehlerbedingungen eines Frames aus den Messgrößen. */
export function frameConditions(m: StanceMetrics, baseline: Baseline | null, cfg: SingleLegConfig = config.singleLeg): Conditions {
  if (!m.valid) return { handsOff: null, footDown: null, hipAngle: null, standFootLift: null };

  const side = (s: Side): boolean | null =>
    Number.isFinite(m.wristHip[s]) || Number.isFinite(m.elbow[s]) ? handOffHip(m, s, cfg) : null;
  const l = side('left');
  const r = side('right');
  const handsOff = l === true || r === true ? true : l === null && r === null ? null : false;

  const footDown = Number.isFinite(m.footLift) ? m.footLift < cfg.footDownMax : null;

  const angles = [m.hipFlexionDeg, m.hipAbductionDeg].filter(Number.isFinite);
  const hipAngle = angles.length === 2 ? angles.some((a) => a > cfg.hipAngleMaxDeg) : null;

  const standFootLift =
    baseline && Number.isFinite(baseline.standHeelToe) && Number.isFinite(m.standHeelToe)
      ? Math.abs(m.standHeelToe - baseline.standHeelToe) > cfg.standFootLiftMax
      : null;

  return { handsOff, footDown, hipAngle, standFootLift };
}

interface Episode {
  start: number;
  lastActive: number;
  outCounted: boolean;
}

export interface BessState {
  lastT: number | null;
  /** Seit wann ist eine Bedingung ununterbrochen erfüllt (Entprellung). */
  pending: Record<ConditionType, number | null>;
  /** Laufender Fehler (eine oder mehrere Bedingungen, zählt einmal). */
  episode: Episode | null;
  /** Laufender experimenteller Fehler (getrennte Zählung). */
  expEpisode: Episode | null;
  total: number;
  byType: Record<ErrorType, number>;
  /** Experimentelle Fehler, die nicht in total eingehen. */
  experimental: number;
  inPositionMs: number;
  unmeasurableMs: number;
  measuredMs: number;
  /** Bestätigte (entprellte) Bedingungen im aktuellen Frame. */
  active: ConditionType[];
  /** Rohe Bedingungen im aktuellen Frame. */
  raw: Conditions;
}

const zeroTypes = (): Record<ErrorType, number> => ({ handsOff: 0, footDown: 0, hipAngle: 0, outOfPosition: 0, standFootLift: 0 });

export function initBess(): BessState {
  return {
    lastT: null,
    pending: { handsOff: null, footDown: null, hipAngle: null, standFootLift: null },
    episode: null,
    expEpisode: null,
    total: 0,
    byType: zeroTypes(),
    experimental: 0,
    inPositionMs: 0,
    unmeasurableMs: 0,
    measuredMs: 0,
    active: [],
    raw: { handsOff: null, footDown: null, hipAngle: null, standFootLift: null },
  };
}

const MAIN: ConditionType[] = ['handsOff', 'footDown', 'hipAngle'];

export function stepBess(s: BessState, t: number, c: Conditions, cfg: SingleLegConfig = config.singleLeg): BessState {
  const dt = s.lastT === null ? 0 : Math.max(0, Math.min(250, t - s.lastT));
  const mainTypes = cfg.countExperimentalInTotal ? [...MAIN, 'standFootLift' as const] : MAIN;

  // Entprellung: Bedingung muss errorMinDurationMs am Stück bestehen.
  const pending = { ...s.pending };
  const active: ConditionType[] = [];
  for (const k of Object.keys(pending) as ConditionType[]) {
    if (c[k] === true) {
      pending[k] ??= t;
      if (t - pending[k]! >= cfg.errorMinDurationMs) active.push(k);
    } else {
      pending[k] = null;
    }
  }

  let { total, experimental, inPositionMs, unmeasurableMs, episode, expEpisode } = s;
  const byType = { ...s.byType };
  const mainActive = active.filter((k) => mainTypes.includes(k));

  // Hauptfehler: ein Episode = ein Fehler, egal wie viele Bedingungen gleichzeitig.
  // Ein laufender Fehler bleibt bestehen, solange eine Bedingung roh erfüllt ist (auch während der Entprellung).
  const mainRaw = mainTypes.some((k) => c[k] === true);
  if (mainActive.length) {
    if (!episode) {
      const first = [...mainActive].sort((a, b) => pending[a]! - pending[b]!)[0];
      episode = { start: Math.min(...mainActive.map((k) => pending[k]!)), lastActive: t, outCounted: false };
      total += 1;
      byType[first] += 1;
    } else {
      episode = { ...episode, lastActive: t };
    }
  } else if (episode && mainRaw) {
    episode = { ...episode, lastActive: t };
  }
  if (episode && !episode.outCounted && episode.lastActive - episode.start > cfg.outOfPositionS * 1000) {
    total += 1;
    byType.outOfPosition += 1;
    episode = { ...episode, outCounted: true };
  }
  if (episode && !mainRaw && t - episode.lastActive >= cfg.errorReleaseMs) episode = null;

  // Experimentell, getrennt gezählt.
  if (!cfg.countExperimentalInTotal) {
    if (active.includes('standFootLift')) {
      if (!expEpisode) {
        experimental += 1;
        byType.standFootLift += 1;
        expEpisode = { start: pending.standFootLift!, lastActive: t, outCounted: false };
      } else expEpisode = { ...expEpisode, lastActive: t };
    } else if (expEpisode && c.standFootLift === true) expEpisode = { ...expEpisode, lastActive: t };
    else if (expEpisode && t - expEpisode.lastActive >= cfg.errorReleaseMs) expEpisode = null;
  }

  const unmeasurable = MAIN.every((k) => c[k] === null);
  if (unmeasurable) unmeasurableMs += dt;
  else if (!episode) inPositionMs += dt;

  return {
    lastT: t,
    pending,
    episode,
    expEpisode,
    total,
    byType,
    experimental,
    inPositionMs,
    unmeasurableMs,
    measuredMs: s.measuredMs + dt,
    active,
    raw: c,
  };
}

export interface TrialErrors {
  /** Fehlerzahl nach BESS-Regeln (max. 10). */
  errors: number;
  /** Gezählte Fehler vor Deckelung. */
  rawErrors: number;
  byType: Record<ErrorType, number>;
  /** Experimentelle Fehler (Ferse/Vorfuß), nicht in errors enthalten (außer per config). */
  experimental: number;
  /** Zeit in korrekter Position in Sekunden. */
  inPositionS: number;
  /** Anteil der Messzeit, in dem die Kamera die Person nicht auswerten konnte (0..1). */
  unmeasurableShare: number;
  /** Position insgesamt kürzer als minInPositionS gehalten → Höchstwert. */
  failedToHold: boolean;
}

export function finishBess(s: BessState, cfg: SingleLegConfig = config.singleLeg): TrialErrors {
  const failedToHold = s.inPositionMs < cfg.minInPositionS * 1000;
  return {
    errors: failedToHold ? cfg.maxErrors : Math.min(s.total, cfg.maxErrors),
    rawErrors: s.total,
    byType: { ...s.byType },
    experimental: s.experimental,
    inPositionS: Math.round(s.inPositionMs / 1000),
    unmeasurableShare: s.measuredMs > 0 ? s.unmeasurableMs / s.measuredMs : 0,
    failedToHold,
  };
}

/** Laufende Fehlerzahl für die Live-Anzeige (gedeckelt). */
export const liveErrors = (s: BessState, cfg: SingleLegConfig = config.singleLeg) => Math.min(s.total, cfg.maxErrors);

/** Punkte, die bei aktiven Fehlern im Overlay hervorgehoben werden. */
export function highlightPoints(active: ConditionType[], stand: Side): Set<number> {
  const out = new Set<number>();
  const st = SIDE[stand];
  const sw = SIDE[otherSide(stand)];
  for (const a of active) {
    if (a === 'handsOff') [SIDE.left.wrist, SIDE.left.elbow, SIDE.right.wrist, SIDE.right.elbow, SIDE.left.shoulder, SIDE.right.shoulder].forEach((i) => out.add(i));
    if (a === 'footDown') [sw.knee, sw.ankle, sw.heel, sw.footIndex].forEach((i) => out.add(i));
    if (a === 'hipAngle') [sw.hip, sw.knee].forEach((i) => out.add(i));
    if (a === 'standFootLift') [st.ankle, st.heel, st.footIndex].forEach((i) => out.add(i));
  }
  return out;
}
