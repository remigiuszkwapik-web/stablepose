import { describe, it, expect } from 'vitest';
import { deviceTilt, lineTilt, postureSample, summarizePosture, tiltSideText } from '../src/analysis/posture';
import { L } from '../src/analysis/landmarks';
import { makePose } from '../src/dev/syntheticPose';

const pt = (x: number, y: number, v = 1) => ({ x, y, z: 0, v });

/** Person mit gekippter Schulter-/Hüftlinie: linke Seite (im Bild rechts) um dy Pixel höher. */
function tilted(shoulderDy: number, pelvisDy: number) {
  const f = makePose();
  const p = f.image!;
  p[L.leftShoulder] = { ...p[L.leftShoulder], y: p[L.leftShoulder].y - shoulderDy };
  p[L.leftHip] = { ...p[L.leftHip], y: p[L.leftHip].y - pelvisDy };
  return f;
}

describe('Haltung frontal', () => {
  it('waagerecht = 0°', () => {
    const s = postureSample(makePose());
    expect(s.shoulder).toBeCloseTo(0);
    expect(s.pelvis).toBeCloseTo(0);
  });
  it('linke Schulter höher → positiv, rechte höher → negativ', () => {
    // Schulterbreite 160 px, 160·tan(5°) ≈ 14 px
    expect(postureSample(tilted(14, 0)).shoulder).toBeCloseTo(5, 0);
    expect(postureSample(tilted(-14, 0)).shoulder).toBeCloseTo(-5, 0);
  });
  it('Becken unabhängig von den Schultern', () => {
    const s = postureSample(tilted(0, 100 * Math.tan((3 * Math.PI) / 180)));
    expect(s.pelvis).toBeCloseTo(3, 0);
    expect(s.shoulder).toBeCloseTo(0);
  });
  it('lineTilt unabhängig von der Spiegelung (x gespiegelt, Seiten getauscht)', () => {
    const a = lineTilt(pt(400, 290), pt(300, 300), 0.5); // links (im Bild rechts) höher
    const b = lineTilt(pt(320, 290), pt(420, 300), 0.5); // gespiegeltes Bild, gleiche Person
    expect(a).toBeCloseTo(b);
    expect(a).toBeGreaterThan(0);
  });
  it('schlecht sichtbar → NaN', () => {
    expect(Number.isNaN(lineTilt(pt(0, 0, 0.2), pt(10, 0), 0.5))).toBe(true);
  });
  it('Mittelwert über Frames, ganze Grad', () => {
    const r = summarizePosture([{ shoulder: 2.2, pelvis: -1 }, { shoulder: 2.8, pelvis: -1.4 }, { shoulder: 3.1, pelvis: -1.2 }]);
    expect(r.shoulderDeg).toBe(3);
    expect(r.pelvisDeg).toBe(-1);
    expect(r.totalFrames).toBe(3);
  });
  it('zu wenige messbare Frames → nicht gemessen', () => {
    const r = summarizePosture([{ shoulder: 2, pelvis: NaN }, { shoulder: NaN, pelvis: NaN }, { shoulder: NaN, pelvis: 1 }]);
    expect(Number.isNaN(r.shoulderDeg)).toBe(true);
    expect(Number.isNaN(r.pelvisDeg)).toBe(true);
  });
  it('keine -0', () => {
    expect(Object.is(summarizePosture([{ shoulder: -0.3, pelvis: 0.2 }]).shoulderDeg, 0)).toBe(true);
  });
  it('Texte ohne Bewertung', () => {
    expect(tiltSideText(0)).toBe('waagerecht');
    expect(tiltSideText(2)).toBe('links höher');
    expect(tiltSideText(-1)).toBe('rechts höher');
    expect(tiltSideText(NaN)).toBe('nicht gemessen');
  });
});

describe('Geräteneigung (DeviceOrientation)', () => {
  it('Hochformat senkrecht: roll 0, pitch 0', () => {
    const t = deviceTilt(90, 0, 0);
    expect(t.roll).toBeCloseTo(0);
    expect(t.pitch).toBeCloseTo(0);
  });
  it('Hochformat, im Uhrzeigersinn um 5° gedreht', () => {
    // Gerät steht (β=90), Drehung in der Bildschirmebene erscheint als γ-Komponente
    const t = deviceTilt(90, 0, 0);
    expect(Math.abs(t.roll)).toBeLessThan(0.5);
    const r = deviceTilt(85, 0, 0);
    expect(r.pitch).toBeCloseTo(5, 0); // nach hinten gekippt
    expect(Math.abs(r.roll)).toBeLessThan(0.5);
  });
  it('Hochformat in der Bildschirmebene um 3° gedreht → |roll| = 3', () => {
    // Welt-oben im Gerät: (sin 3°, cos 3°, 0) → β = 87°…: konstruiere über γ bei β≈90 nicht möglich,
    // daher direkt: β = asin(cos 3°) = 87°, γ so dass −sin γ·cos β = sin 3° und cos γ·cos β = 0 → γ = −90
    const t = deviceTilt(87, -90, 0);
    expect(Math.abs(t.roll)).toBeCloseTo(3, 0);
    expect(Math.abs(t.pitch)).toBeLessThan(0.5);
  });
  it('falsche Drehrichtungs-Konvention (270 statt 90) ändert den Betrag nicht', () => {
    expect(Math.abs(deviceTilt(4, -90, 270).roll)).toBeCloseTo(4, 0);
  });
  it('flach auf dem Tisch: pitch 90', () => {
    expect(deviceTilt(0, 0, 0).pitch).toBeCloseTo(90);
  });
  it('Querformat (90°), senkrecht: roll 0', () => {
    // Gerät um 90° gegen den Uhrzeigersinn gedreht und aufrecht: Welt-oben = Geräte +x
    // −sin γ·cos β = 1 → γ = −90, β = 0
    const t = deviceTilt(0, -90, 90);
    expect(t.roll).toBeCloseTo(0);
    expect(t.pitch).toBeCloseTo(0);
  });
  it('Querformat, leicht gekippt in der Bildschirmebene → roll ≠ 0', () => {
    expect(Math.abs(deviceTilt(4, -90, 90).roll)).toBeCloseTo(4, 0);
  });
});
