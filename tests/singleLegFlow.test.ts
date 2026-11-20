import { describe, it, expect } from 'vitest';
import { countdownLeft, initFlow, measureLeft, stepFlow, type FlowConfig, type FlowInput, type FlowState } from '../src/analysis/singleLegFlow';

const cfg: FlowConfig = { stableMs: 1000, countdownS: 5, durationS: 20, startPoseHoldMs: 500, lostGraceMs: 1000 };

/** Spielt eine Zeitreihe ab (33 ms pro Frame) und liefert alle Zustände. */
function run(series: (t: number) => Omit<FlowInput, 't'>, untilMs: number, s0 = initFlow(0)): FlowState[] {
  const out: FlowState[] = [];
  let s = s0;
  for (let t = 0; t <= untilMs; t += 33) {
    s = stepFlow(s, { t, ...series(t) }, cfg);
    out.push(s);
  }
  return out;
}
const phaseAt = (states: FlowState[], t: number) => states[Math.floor(t / 33)].phase;

describe('Ablauf Einbeinstand', () => {
  it('idealer Ablauf: Check → Countdown → Bereit → Messung → Ende', () => {
    // Position ab 0 ok, Startpose ab 7 s.
    const st = run((t) => ({ positionOk: true, startPose: t >= 7000 }), 30000);
    expect(phaseAt(st, 500)).toBe('check');
    expect(phaseAt(st, 1500)).toBe('countdown');
    expect(phaseAt(st, 6500)).toBe('ready');
    expect(phaseAt(st, 7400)).toBe('ready'); // Startpose noch nicht 500 ms gehalten
    expect(phaseAt(st, 8000)).toBe('measuring');
    expect(phaseAt(st, 27000)).toBe('measuring');
    expect(phaseAt(st, 28700)).toBe('done');
    expect(st.at(-1)!.elapsedMs).toBe(20000);
  });
  it('Position passt nicht → bleibt im Check', () => {
    const st = run(() => ({ positionOk: false, startPose: false }), 10000);
    expect(st.every((s) => s.phase === 'check')).toBe(true);
  });
  it('Position wackelt → Check startet die 1 s neu', () => {
    const st = run((t) => ({ positionOk: !(t > 800 && t < 900), startPose: false }), 1800);
    expect(phaseAt(st, 1700)).toBe('check');
    expect(phaseAt(st, 1800 + 0)).toBe('check');
    const st2 = run((t) => ({ positionOk: !(t > 800 && t < 900), startPose: false }), 2100);
    expect(st2.at(-1)!.phase).toBe('countdown');
  });
  it('Position im Countdown kurz weg (< 1 s) → Countdown läuft weiter', () => {
    const st = run((t) => ({ positionOk: !(t > 2000 && t < 2500), startPose: false }), 6500);
    expect(phaseAt(st, 2400)).toBe('countdown');
    expect(st.at(-1)!.phase).toBe('ready');
  });
  it('Position im Countdown länger weg → zurück zum Check', () => {
    const st = run((t) => ({ positionOk: !(t > 2000 && t < 4000), startPose: false }), 3500);
    expect(st.at(-1)!.phase).toBe('check');
  });
  it('ohne Startpose startet der Timer nicht', () => {
    const st = run(() => ({ positionOk: true, startPose: false }), 60000);
    expect(st.at(-1)!.phase).toBe('ready');
  });
  it('Startpose flackert → Timer startet erst bei 500 ms am Stück', () => {
    const st = run((t) => ({ positionOk: true, startPose: t >= 7000 && (t < 7300 || t > 7400) }), 7800);
    expect(st.at(-1)!.phase).toBe('ready');
    const st2 = run((t) => ({ positionOk: true, startPose: t >= 7000 && (t < 7300 || t > 7400) }), 8000);
    expect(st2.at(-1)!.phase).toBe('measuring');
  });
  it('Messung läuft weiter, auch wenn Position verloren geht (Fehler zählt M3)', () => {
    const st = run((t) => ({ positionOk: t < 10000, startPose: t >= 7000 && t < 10000 }), 30000);
    expect(st.at(-1)!.phase).toBe('done');
  });
  it('Countdown- und Timeranzeige in ganzen Sekunden', () => {
    const s = { ...initFlow(0), phase: 'countdown' as const, since: 1000 };
    expect(countdownLeft(s, 1000, cfg)).toBe(5);
    expect(countdownLeft(s, 1001, cfg)).toBe(5);
    expect(countdownLeft(s, 5100, cfg)).toBe(1);
    expect(measureLeft({ ...s, phase: 'measuring', elapsedMs: 0 }, cfg)).toBe(20);
    expect(measureLeft({ ...s, phase: 'measuring', elapsedMs: 19500 }, cfg)).toBe(1);
  });
});
