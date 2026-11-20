import { describe, it, expect } from 'vitest';
import { PointSmoother, WindowAverage, mean } from '../src/analysis/smoothing';
import { swapLeftRight, toImagePoints, countVisible } from '../src/analysis/frame';
import { L } from '../src/analysis/landmarks';

const pt = (x: number) => [{ x, y: 0, z: 0, v: 1 }];

describe('PointSmoother', () => {
  it('erster Wert unverändert, danach EMA', () => {
    const s = new PointSmoother(0.5);
    expect(s.push(pt(0), 0)![0].x).toBe(0);
    expect(s.push(pt(10), 33)![0].x).toBe(5);
    expect(s.push(pt(10), 66)![0].x).toBe(7.5);
  });
  it('alpha 1 = keine Glättung', () => {
    const s = new PointSmoother(1);
    s.push(pt(0), 0);
    expect(s.push(pt(10), 33)![0].x).toBe(10);
  });
  it('Neustart nach Lücke', () => {
    const s = new PointSmoother(0.5, 500);
    s.push(pt(0), 0);
    expect(s.push(pt(10), 2000)![0].x).toBe(10);
  });
  it('Neustart wenn Zeit rückwärts läuft (Video neu gestartet)', () => {
    const s = new PointSmoother(0.5, 500);
    s.push(pt(0), 1000);
    expect(s.push(pt(10), 0)![0].x).toBe(10);
  });
  it('rauschende Werte werden ruhiger', () => {
    const s = new PointSmoother(0.3);
    let maxDev = 0;
    for (let i = 0; i < 100; i++) {
      const out = s.push(pt(i % 2 ? 1 : -1), i * 33)![0].x;
      if (i > 10) maxDev = Math.max(maxDev, Math.abs(out));
    }
    expect(maxDev).toBeLessThan(0.5);
  });
});

describe('WindowAverage / mean', () => {
  it('mittelt nur im Fenster', () => {
    const w = new WindowAverage(1000);
    w.push(10, 0);
    w.push(20, 500);
    expect(w.value()).toBe(15);
    expect(w.push(30, 1600)).toBe(30);
  });
  it('mean ignoriert NaN', () => {
    expect(mean([1, NaN, 3])).toBe(2);
    expect(Number.isNaN(mean([]))).toBe(true);
  });
});

describe('Frame-Hilfen', () => {
  it('toImagePoints skaliert auf Pixel', () => {
    const p = toImagePoints([{ x: 0.5, y: 0.25, z: 0.1, visibility: 0.8 }], 640, 480)[0];
    expect(p).toEqual({ x: 320, y: 120, z: 64, v: 0.8 });
  });
  it('swapLeftRight tauscht Seiten, Nase bleibt', () => {
    const pts = Array.from({ length: 33 }, (_, i) => i);
    const s = swapLeftRight(pts);
    expect(s[L.nose]).toBe(L.nose);
    expect(s[L.leftWrist]).toBe(L.rightWrist);
    expect(s[L.rightAnkle]).toBe(L.leftAnkle);
    expect(swapLeftRight(s)).toEqual(pts);
  });
  it('countVisible', () => {
    const pts = [0.9, 0.2, 0.7].map((v) => ({ x: 0, y: 0, z: 0, v }));
    expect(countVisible(pts, 0.65)).toBe(2);
    expect(countVisible(null, 0.5)).toBe(0);
  });
});
