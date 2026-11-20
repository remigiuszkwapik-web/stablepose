import { describe, it, expect } from 'vitest';
import { angle3, angleBetween, dist2, dist3, mid, roundInt, tiltToHorizontal } from '../src/analysis/geometry';

const p = (x: number, y: number, z = 0) => ({ x, y, z, v: 1 });

describe('angle3', () => {
  it('rechter Winkel', () => {
    expect(angle3(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90);
  });
  it('gestreckt = 180°', () => {
    expect(angle3(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180);
  });
  it('45°', () => {
    expect(angle3(p(1, 0), p(0, 0), p(1, 1))).toBeCloseTo(45);
  });
  it('2d ignoriert z, 3d nicht', () => {
    const a = p(1, 0, 0), b = p(0, 0, 0), c = p(0, 0, 1);
    expect(Number.isNaN(angle3(a, b, c, '2d'))).toBe(true); // c liegt in 2D auf b
    expect(angle3(a, b, c, '3d')).toBeCloseTo(90);
  });
  it('Nullvektor → NaN', () => {
    expect(Number.isNaN(angleBetween({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }))).toBe(true);
  });
});

describe('Abstände', () => {
  it('dist2 / dist3', () => {
    expect(dist2(p(0, 0), p(3, 4))).toBe(5);
    expect(dist3(p(0, 0, 0), p(1, 2, 2))).toBe(3);
  });
  it('mid nimmt kleinste Sichtbarkeit', () => {
    const m = mid({ x: 0, y: 0, z: 0, v: 0.9 }, { x: 2, y: 4, z: 0, v: 0.3 });
    expect(m).toEqual({ x: 1, y: 2, z: 0, v: 0.3 });
  });
});

describe('tiltToHorizontal', () => {
  it('waagerecht = 0', () => {
    expect(tiltToHorizontal(p(0, 10), p(10, 10))).toBeCloseTo(0);
  });
  it('rechter Punkt höher (y kleiner) → positiv', () => {
    expect(tiltToHorizontal(p(0, 10), p(10, 0))).toBeCloseTo(45);
  });
  it('Reihenfolge der Punkte egal', () => {
    expect(tiltToHorizontal(p(10, 0), p(0, 10))).toBeCloseTo(45);
  });
});

describe('roundInt', () => {
  it('ganze Zahlen, kein -0', () => {
    expect(roundInt(2.6)).toBe(3);
    expect(Object.is(roundInt(-0.2), 0)).toBe(true);
  });
});
