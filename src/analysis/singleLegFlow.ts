import { config } from '../config';

/**
 * Zustandsautomat für einen Versuch Einbeinstand. Reine Funktion: neuer Zustand aus altem
 * Zustand und Eingabe. Phasen:
 *  check     → Positionscheck, bis er stableMs lang ohne Unterbrechung passt
 *  countdown → countdownS Sekunden; geht die Position länger als lostGraceMs verloren → check
 *  ready     → wartet auf Startposition (Bein oben, Hände an Hüfte), gehalten startPoseHoldMs
 *  measuring → durationS Sekunden, Timer läuft
 *  done      → fertig
 */
export type FlowPhase = 'check' | 'countdown' | 'ready' | 'measuring' | 'done';

export interface FlowState {
  phase: FlowPhase;
  /** Zeitpunkt (ms), seit dem die aktuelle Phase läuft. */
  since: number;
  /** Seit wann passt die Position ununterbrochen (check) bzw. seit wann ist sie verloren (countdown). */
  okSince: number | null;
  lostSince: number | null;
  startPoseSince: number | null;
  /** Nur in measuring/done: vergangene Messzeit in ms. */
  elapsedMs: number;
}

export interface FlowInput {
  t: number;
  positionOk: boolean;
  startPose: boolean;
}

export interface FlowConfig {
  stableMs: number;
  countdownS: number;
  durationS: number;
  startPoseHoldMs: number;
  lostGraceMs: number;
}

export const defaultFlowConfig = (): FlowConfig => ({
  stableMs: config.position.stableMs,
  countdownS: config.singleLeg.countdownS,
  durationS: config.singleLeg.durationS,
  startPoseHoldMs: config.singleLeg.startPoseHoldMs,
  lostGraceMs: 1000,
});

export function initFlow(t: number): FlowState {
  return { phase: 'check', since: t, okSince: null, lostSince: null, startPoseSince: null, elapsedMs: 0 };
}

const enter = (phase: FlowPhase, t: number): FlowState => ({
  phase, since: t, okSince: null, lostSince: null, startPoseSince: null, elapsedMs: 0,
});

export function stepFlow(s: FlowState, i: FlowInput, cfg: FlowConfig = defaultFlowConfig()): FlowState {
  switch (s.phase) {
    case 'check': {
      if (!i.positionOk) return { ...s, okSince: null };
      const okSince = s.okSince ?? i.t;
      if (i.t - okSince >= cfg.stableMs) return enter('countdown', i.t);
      return { ...s, okSince };
    }
    case 'countdown': {
      if (!i.positionOk) {
        const lostSince = s.lostSince ?? i.t;
        if (i.t - lostSince > cfg.lostGraceMs) return enter('check', i.t);
        return { ...s, lostSince };
      }
      if (i.t - s.since >= cfg.countdownS * 1000) return enter('ready', i.t);
      return { ...s, lostSince: null };
    }
    case 'ready': {
      if (!i.startPose) return { ...s, startPoseSince: null };
      const since = s.startPoseSince ?? i.t;
      if (i.t - since >= cfg.startPoseHoldMs) return enter('measuring', i.t);
      return { ...s, startPoseSince: since };
    }
    case 'measuring': {
      const elapsedMs = Math.min(i.t - s.since, cfg.durationS * 1000);
      if (elapsedMs >= cfg.durationS * 1000) return { ...enter('done', i.t), elapsedMs };
      return { ...s, elapsedMs };
    }
    case 'done':
      return s;
  }
}

/** Ganze Sekunden, die im Countdown noch bleiben (5, 4, … 1). */
export function countdownLeft(s: FlowState, t: number, cfg: FlowConfig = defaultFlowConfig()): number {
  return Math.max(0, Math.ceil(cfg.countdownS - (t - s.since) / 1000));
}

/** Ganze Sekunden, die in der Messung noch bleiben. */
export function measureLeft(s: FlowState, cfg: FlowConfig = defaultFlowConfig()): number {
  return Math.max(0, Math.ceil(cfg.durationS - s.elapsedMs / 1000));
}
