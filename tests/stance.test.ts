import { describe, it, expect } from 'vitest';
import { hipAngles, isStartPose, stanceMetrics, startPoseHint, handOffHip } from '../src/analysis/stance';
import { swapLeftRight } from '../src/analysis/frame';
import { makePose } from '../src/dev/syntheticPose';
import { L } from '../src/analysis/landmarks';

describe('Startposition Einbeinstand', () => {
  it('Bein oben + Hände an Hüfte → Startposition', () => {
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'hips' }), 'left');
    expect(m.valid).toBe(true);
    expect(m.footLift).toBeCloseTo(0.15, 2);
    expect(isStartPose(m)).toBe(true);
    expect(startPoseHint(m, 'left')).toBeNull();
  });
  it('beide Füße unten → keine Startposition', () => {
    const m = stanceMetrics(makePose({ hands: 'hips' }), 'left');
    expect(isStartPose(m)).toBe(false);
    expect(startPoseHint(m, 'left')).toBe('Heb das rechte Bein an');
  });
  it('Hände hängen → keine Startposition, obwohl Handgelenk nah an der Hüfte', () => {
    const m = stanceMetrics(makePose({ stand: 'right', lift: 0.15, hands: 'down' }), 'right');
    expect(isStartPose(m)).toBe(false);
    expect(startPoseHint(m, 'right')).toBe('Leg beide Hände an die Hüfte');
  });
  it('falsches Bein angehoben → keine Startposition', () => {
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'hips' }), 'right');
    expect(m.footLift).toBeLessThan(0);
    expect(isStartPose(m)).toBe(false);
  });
  it('Hände an der Hüfte, Handgelenke teils verdeckt (visibility 0,4) → trotzdem Startposition', () => {
    const vis = { [L.leftWrist]: 0.4, [L.rightWrist]: 0.4, [L.leftElbow]: 0.5, [L.rightElbow]: 0.5 };
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'hips', vis }), 'left');
    expect(isStartPose(m)).toBe(true);
  });
  it('Handgelenk praktisch unsichtbar (0,1) → nicht messbar statt „an der Hüfte“', () => {
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'hips', vis: { [L.leftWrist]: 0.1 } }), 'left');
    expect(Number.isNaN(m.wristHip.left)).toBe(true);
    expect(isStartPose(m)).toBe(false);
  });
  it('Hand etwas höher am Beckenkamm (statt am Hüftgelenk) zählt als an der Hüfte', () => {
    const f = makePose({ stand: 'left', lift: 0.15, hands: 'hips' });
    for (const i of [L.leftWrist, L.rightWrist]) f.image![i] = { ...f.image![i], y: f.image![i].y - 30 };
    expect(isStartPose(stanceMetrics(f, 'left'))).toBe(true);
  });
  it('hängende Arme: Abstand zum Beckenkamm klar über der Schwelle', () => {
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'down' }), 'left');
    expect(m.wristHip.left).toBeGreaterThan(0.5);
    expect(m.wristHip.right).toBeGreaterThan(0.5);
  });
  it('Hand weg wird erkannt', () => {
    const m = stanceMetrics(makePose({ stand: 'left', lift: 0.15, hands: 'leftOff' }), 'left');
    expect(handOffHip(m, 'left')).toBe(true);
    expect(handOffHip(m, 'right')).toBe(false);
  });
  it('gespiegeltes Video + links/rechts tauschen ergibt dasselbe wie normal', () => {
    const f = makePose({ stand: 'left', lift: 0.15, hands: 'hips', mirrored: true });
    const fixed = { ...f, image: swapLeftRight(f.image!), world: swapLeftRight(f.world!) };
    const m = stanceMetrics(fixed, 'left');
    expect(m.footLift).toBeCloseTo(0.15, 2);
    expect(isStartPose(m)).toBe(true);
  });
});

describe('Hüftwinkel (World Landmarks)', () => {
  it('Oberschenkel senkrecht → 0°/0°', () => {
    const a = hipAngles(makePose({ stand: 'left' }).world!, 'left', 0.5);
    expect(a.flexion).toBeCloseTo(0, 0);
    expect(a.abduction).toBeCloseTo(0, 0);
  });
  it.each([
    ['left' as const, 40, 0],
    ['right' as const, 40, 0],
    ['left' as const, 0, 35],
    ['right' as const, 0, 35],
    ['left' as const, 25, 10],
  ])('Standbein %s: Beugung %i°, Abspreizung %i°', (stand, flex, abd) => {
    const a = hipAngles(makePose({ stand, flexDeg: flex, abdDeg: abd }).world!, stand, 0.5);
    expect(a.flexion).toBeCloseTo(flex, 0);
    expect(a.abduction).toBeCloseTo(abd, 0);
  });
  it('schlecht sichtbares Knie → nicht gemessen (NaN)', () => {
    const f = makePose({ stand: 'left', flexDeg: 40, vis: { 26: 0.1 } });
    expect(Number.isNaN(hipAngles(f.world!, 'left', 0.5).flexion)).toBe(true);
  });
});
