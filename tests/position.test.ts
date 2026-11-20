import { describe, it, expect } from 'vitest';
import { checkPosition } from '../src/analysis/position';
import { L } from '../src/analysis/landmarks';
import { makePose } from './fixtures/pose';

describe('Positionscheck', () => {
  it('frontal, ganz im Bild → ok', () => {
    const r = checkPosition(makePose());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });
  it('keine Person', () => {
    const r = checkPosition(makePose({ noPerson: true }));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toBe('noPerson');
  });
  it('Füße unten abgeschnitten → „Deine Füße sind nicht im Bild“', () => {
    const r = checkPosition(makePose({ dy: 200 }));
    expect(r.issues[0]).toBe('feetMissing');
    expect(r.message).toBe('Deine Füße sind nicht im Bild');
  });
  it('Füße unsichtbar (visibility niedrig) → Füße fehlen', () => {
    const vis = { [L.leftHeel]: 0.1, [L.rightHeel]: 0.1, [L.leftFootIndex]: 0.1, [L.rightFootIndex]: 0.1 };
    expect(checkPosition(makePose({ vis })).issues[0]).toBe('feetMissing');
  });
  it('Kopf und Füße abgeschnitten → „Geh einen Schritt zurück“', () => {
    const r = checkPosition(makePose({ scale: 1.5 }));
    expect(r.issues[0]).toBe('stepBack');
    expect(r.message).toBe('Geh einen Schritt zurück');
  });
  it('Kopf oben abgeschnitten', () => {
    expect(checkPosition(makePose({ dy: -180 })).issues[0]).toBe('headMissing');
  });
  it('zu klein (weit weg) → näher kommen', () => {
    expect(checkPosition(makePose({ scale: 0.5 })).issues[0]).toBe('moveCloser');
  });
  it('nicht mittig → zur Mitte', () => {
    expect(checkPosition(makePose({ dx: 300 })).issues).toContain('center');
  });
  it('seitlich gedreht → frontal drehen', () => {
    expect(checkPosition(makePose({ turnDeg: 65 })).issues).toContain('turnFrontal');
  });
  it('Rücken zur Kamera (links/rechts vertauscht) → frontal drehen', () => {
    expect(checkPosition(makePose({ backToCamera: true })).issues).toContain('turnFrontal');
  });
  it('leicht gedreht (20°) ist noch ok', () => {
    expect(checkPosition(makePose({ turnDeg: 20 })).ok).toBe(true);
  });
  it('gespiegeltes Selfie-Video ist nicht automatisch erkennbar (darum Schalter „Gespiegelt“)', () => {
    expect(checkPosition(makePose({ mirrored: true })).ok).toBe(true);
  });
  it('Knie schlecht sichtbar → lowVisibility', () => {
    expect(checkPosition(makePose({ vis: { [L.leftKnee]: 0.2 } })).issues).toContain('lowVisibility');
  });
  it('angehobenes Bein stört den Check nicht', () => {
    expect(checkPosition(makePose({ stand: 'left', lift: 0.2, hands: 'hips' })).ok).toBe(true);
  });
});
