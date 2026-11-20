import { describe, it, expect } from 'vitest';
import { finishBess, frameConditions, initBess, stepBess, highlightPoints, type BessState, type Conditions } from '../src/analysis/bess';
import { stanceMetrics } from '../src/analysis/stance';
import { config } from '../src/config';
import { L } from '../src/analysis/landmarks';
import { makePose, type PoseOpts } from '../src/dev/syntheticPose';

const cfg = { ...config.singleLeg, errorMinDurationMs: 250, errorReleaseMs: 400, outOfPositionS: 5, maxErrors: 10, minInPositionS: 5, countExperimentalInTotal: false };
const GOOD: PoseOpts = { stand: 'left', lift: 0.15, hands: 'hips', flexDeg: 15, abdDeg: 5 };
const conds = (o: PoseOpts, baseline = { standHeelToe: stanceMetrics(makePose(GOOD), 'left').standHeelToe }) =>
  frameConditions(stanceMetrics(makePose({ ...GOOD, ...o }), 'left'), baseline, cfg);

describe('Fehlerbedingungen pro Frame (synthetische Körperpunkte)', () => {
  it('korrekte Testposition → keine Bedingung aktiv', () => {
    expect(conds({})).toEqual({ handsOff: false, footDown: false, hipAngle: false, standFootLift: false });
  });
  it('Hände: eine Hand weg → Fehler', () => {
    expect(conds({ hands: 'rightOff' }).handsOff).toBe(true);
    expect(conds({ hands: 'down' }).handsOff).toBe(true);
  });
  it('Fuß: abgesetzt → Fehler, leicht wackelnd über Boden → kein Fehler', () => {
    expect(conds({ lift: 0.0 }).footDown).toBe(true);
    expect(conds({ lift: 0.02 }).footDown).toBe(true);
    expect(conds({ lift: 0.07 }).footDown).toBe(false);
  });
  it('Hüfte: 40° gebeugt → Fehler, 25° → kein Fehler', () => {
    expect(conds({ flexDeg: 40 }).hipAngle).toBe(true);
    expect(conds({ flexDeg: 25 }).hipAngle).toBe(false);
  });
  it('Hüfte: 35° abgespreizt → Fehler, 20° → kein Fehler', () => {
    expect(conds({ abdDeg: 35 }).hipAngle).toBe(true);
    expect(conds({ abdDeg: 20 }).hipAngle).toBe(false);
  });
  it('Ferse Standbein angehoben → experimenteller Fehler, kleine Änderung → keiner', () => {
    expect(conds({ heelLift: 0.06 }).standFootLift).toBe(true);
    expect(conds({ heelLift: 0.01 }).standFootLift).toBe(false);
  });
  it('ohne Ausgangswert: Ferse/Vorfuß nicht messbar (null)', () => {
    const c = frameConditions(stanceMetrics(makePose(GOOD), 'left'), null, cfg);
    expect(c.standFootLift).toBeNull();
  });
  it('Person nicht erkannt → alles „nicht messbar“, nicht „Fehler“', () => {
    const c = frameConditions(stanceMetrics(makePose({ noPerson: true }), 'left'), null, cfg);
    expect(c).toEqual({ handsOff: null, footDown: null, hipAngle: null, standFootLift: null });
  });
  it('Knie unsichtbar → Hüftwinkel nicht messbar', () => {
    expect(conds({ flexDeg: 40, vis: { [L.rightKnee]: 0.1 } }).hipAngle).toBeNull();
  });
});

const OK: Conditions = { handsOff: false, footDown: false, hipAngle: false, standFootLift: false };

/** Simuliert 20 s mit 30 fps; f(t) liefert Bedingungen. */
function simulate(f: (t: number) => Partial<Conditions>, ms = 20000): BessState {
  let s = initBess();
  for (let t = 0; t <= ms; t += 33) s = stepBess(s, t, { ...OK, ...f(t) }, cfg);
  return s;
}
const within = (t: number, a: number, b: number) => t >= a && t < b;

describe('Fehlerzählung', () => {
  it('keine Fehler', () => {
    const r = finishBess(simulate(() => ({})), cfg);
    expect(r.errors).toBe(0);
    expect(r.inPositionS).toBe(20);
  });
  it.each(['handsOff', 'footDown', 'hipAngle'] as const)('ein Fehler %s von 1 s → 1', (k) => {
    const r = finishBess(simulate((t) => ({ [k]: within(t, 5000, 6000) })), cfg);
    expect(r.errors).toBe(1);
    expect(r.byType[k]).toBe(1);
  });
  it('Entprellung: Blip von 150 ms zählt nicht', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 5000, 5150) })), cfg);
    expect(r.errors).toBe(0);
  });
  it('Entprellung: genau über der Mindestdauer zählt', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 5000, 5400) })), cfg);
    expect(r.errors).toBe(1);
  });
  it('gleichzeitige Fehler zählen einmal', () => {
    const r = finishBess(simulate((t) => ({ handsOff: within(t, 5000, 6000), footDown: within(t, 5000, 6000), hipAngle: within(t, 5100, 5900) })), cfg);
    expect(r.errors).toBe(1);
  });
  it('überlappende Fehler (Hand weg, dann Fuß ab, ohne Pause) zählen einmal', () => {
    const r = finishBess(simulate((t) => ({ handsOff: within(t, 5000, 6000), footDown: within(t, 5800, 7000) })), cfg);
    expect(r.errors).toBe(1);
  });
  it('zwei getrennte Fehler zählen zweimal', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 3000, 4000) || within(t, 8000, 9000) })), cfg);
    expect(r.errors).toBe(2);
  });
  it('kurze Lücke (< Freigabezeit) innerhalb eines Fehlers zählt nicht doppelt', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 3000, 4000) || within(t, 4200, 5000) })), cfg);
    expect(r.errors).toBe(1);
  });
  it('länger als 5 s aus der Position → zusätzlicher Fehler', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 2000, 9000) })), cfg);
    expect(r.errors).toBe(2);
    expect(r.byType.outOfPosition).toBe(1);
  });
  it('genau 4 s aus der Position → kein Zusatzfehler', () => {
    const r = finishBess(simulate((t) => ({ footDown: within(t, 2000, 6000) })), cfg);
    expect(r.errors).toBe(1);
  });
  it('höchstens 10 Fehler', () => {
    // alle 1,5 s ein Fehler von 500 ms → 13 Fehler roh
    const r = finishBess(simulate((t) => ({ handsOff: t % 1500 < 500 })), cfg);
    expect(r.rawErrors).toBeGreaterThan(10);
    expect(r.errors).toBe(10);
  });
  it('Position insgesamt unter 5 s gehalten → 10', () => {
    const r = finishBess(simulate((t) => ({ footDown: t > 3000 })), cfg);
    expect(r.failedToHold).toBe(true);
    expect(r.errors).toBe(10);
  });
  it('nicht messbare Frames zählen nicht als Fehler, aber als Anteil', () => {
    const r = finishBess(simulate((t) => (within(t, 5000, 10000) ? { handsOff: null, footDown: null, hipAngle: null, standFootLift: null } : {})), cfg);
    expect(r.errors).toBe(0);
    expect(r.unmeasurableShare).toBeCloseTo(0.25, 1);
  });
  it('experimenteller Fehler wird getrennt gezählt, nicht in der Summe', () => {
    const r = finishBess(simulate((t) => ({ standFootLift: within(t, 5000, 6000) })), cfg);
    expect(r.errors).toBe(0);
    expect(r.experimental).toBe(1);
  });
  it('experimentell per config in die Summe einrechenbar', () => {
    const c2 = { ...cfg, countExperimentalInTotal: true };
    let s = initBess();
    for (let t = 0; t <= 20000; t += 33) s = stepBess(s, t, { ...OK, standFootLift: within(t, 5000, 6000) }, c2);
    expect(finishBess(s, c2).errors).toBe(1);
  });
  it('Ende-zu-Ende: synthetische Frames mit abgesetztem Fuß', () => {
    const baseline = { standHeelToe: stanceMetrics(makePose(GOOD), 'left').standHeelToe };
    let s = initBess();
    for (let t = 0; t <= 20000; t += 33) {
      const f = makePose({ ...GOOD, t, lift: within(t, 6000, 7000) ? 0 : 0.15 });
      s = stepBess(s, t, frameConditions(stanceMetrics(f, 'left'), baseline, cfg), cfg);
    }
    const r = finishBess(s, cfg);
    expect(r.errors).toBe(1);
    expect(r.byType.footDown).toBe(1);
  });
  it('Hervorhebung: Fuß-Fehler markiert Spielbein', () => {
    const hl = highlightPoints(['footDown'], 'left');
    expect(hl.has(L.rightAnkle)).toBe(true);
    expect(hl.has(L.leftAnkle)).toBe(false);
  });
});
