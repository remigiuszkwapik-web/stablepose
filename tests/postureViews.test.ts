import { describe, it, expect } from 'vitest';
import { asymmetries, directionText, fixBackLabels, meanPoints, overlayLines, summarizeView, viewSample } from '../src/analysis/postureViews';
import { checkPosition } from '../src/analysis/position';
import { L } from '../src/analysis/landmarks';
import { makePose, makeSidePose } from '../src/dev/syntheticPose';
import type { PoseFrame } from '../src/analysis/types';

/** Rückansicht: x gespiegelt (Rücken zur Kamera), Gesicht kaum sichtbar. */
function backPose(mutate?: (f: PoseFrame) => void, mpSwapped = false): PoseFrame {
  const vis = { [L.nose]: 0.2, [L.leftEye]: 0.15, [L.rightEye]: 0.15, [L.leftEyeInner]: 0.1, [L.rightEyeInner]: 0.1, [L.leftEar]: 0.6, [L.rightEar]: 0.6 };
  const f = mpSwapped ? makePose({ mirrored: true, vis }) : makePose({ backToCamera: true, vis });
  // mirrored = x gespiegelt UND Beschriftung getauscht → so sähe es aus, wenn MediaPipe die Person für frontal hält
  mutate?.(f);
  return f;
}

describe('Positionscheck je Ansicht', () => {
  it('frontal: Seitansicht wird abgelehnt, Seitansicht im Seitmodus ok', () => {
    expect(checkPosition(makeSidePose()).issues).toContain('turnFrontal');
    expect(checkPosition(makeSidePose(), undefined, 'side').ok).toBe(true);
  });
  it('seitlich: frontale Person → „Dreh dich seitlich zur Kamera“', () => {
    expect(checkPosition(makePose(), undefined, 'side').issues).toContain('turnSide');
  });
  it('hinten: Rückansicht ok – auch wenn MediaPipe die Nase als gut sichtbar meldet (Fall aus dem Studio)', () => {
    expect(checkPosition(backPose(), undefined, 'back').ok).toBe(true);
    const f = backPose((fr) => { for (const i of [L.nose, L.leftEye, L.rightEye]) fr.image![i] = { ...fr.image![i], v: 0.95 }; }, true);
    expect(checkPosition(f, undefined, 'back').ok).toBe(true);
  });
  it('hinten: Zehen verdeckt (nur Knöchel und Fersen sichtbar) → trotzdem ok', () => {
    const f = backPose((fr) => { for (const i of [L.leftFootIndex, L.rightFootIndex]) fr.image![i] = { ...fr.image![i], v: 0.2 }; });
    expect(checkPosition(f, undefined, 'back').ok).toBe(true);
  });
  it('hinten: seitlich gedreht → „Dreh der Kamera den Rücken zu“', () => {
    expect(checkPosition(makeSidePose(), undefined, 'back').issues).toContain('turnBack');
  });
});

describe('Seitansicht', () => {
  it('aufrecht → alles 0°', () => {
    const s = viewSample(makeSidePose(), 'side').sample;
    expect(s.head).toBeCloseTo(0);
    expect(s.trunk).toBeCloseTo(0);
    expect(s.leg).toBeCloseTo(0);
    expect(s.knee).toBeCloseTo(0);
  });
  it.each(['imageLeft', 'imageRight'] as const)('Blick nach %s: Kopf 15° vor, Rumpf 5° zurück, Hüfte 3° vor', (facing) => {
    const s = viewSample(makeSidePose({ facing, headDeg: 15, trunkDeg: -5, legDeg: 3 }), 'side').sample;
    expect(s.head).toBeCloseTo(15, 0);
    expect(s.trunk).toBeCloseTo(-5, 0);
    expect(s.leg).toBeCloseTo(3, 0);
  });
  it('rechte Seite zur Kamera funktioniert genauso', () => {
    const r = viewSample(makeSidePose({ near: 'right', headDeg: 10 }), 'side');
    expect(r.meta.near).toBe('right');
    expect(r.sample.head).toBeCloseTo(10, 0);
  });
  it('Knie vor bzw. hinter der Linie Hüfte–Knöchel', () => {
    expect(viewSample(makeSidePose({ kneeDx: 20 }), 'side').sample.knee!).toBeGreaterThan(3);
    expect(viewSample(makeSidePose({ kneeDx: -20 }), 'side').sample.knee!).toBeLessThan(-3);
  });
});

describe('Vorder- und Rückansicht', () => {
  it('vorne gerade → 0°', () => {
    const s = viewSample(makePose(), 'front').sample;
    expect(s.shoulder).toBeCloseTo(0);
    expect(s.trunk).toBeCloseTo(0);
  });
  it('vorne: Oberkörper nach links (Bild rechts) geneigt → trunk positiv', () => {
    const f = makePose();
    for (const i of [L.leftShoulder, L.rightShoulder]) f.image![i] = { ...f.image![i], x: f.image![i].x + 23 };
    expect(viewSample(f, 'front').sample.trunk!).toBeCloseTo(5, 0);
  });
  it('hinten: linke Schulter höher → positiv, wie vorne', () => {
    const f = backPose((fr) => { fr.image![L.leftShoulder] = { ...fr.image![L.leftShoulder], y: fr.image![L.leftShoulder].y - 14 }; });
    const r = viewSample(f, 'back');
    expect(r.meta.swapped).toBe(false);
    expect(r.sample.shoulder).toBeCloseTo(5, 0);
  });
  it('hinten: MediaPipe vertauscht links/rechts → wird korrigiert, Ergebnis gleich', () => {
    // Person hebt die linke Schulter; MediaPipe beschriftet sie aber als rechte
    const f = backPose((fr) => { fr.image![L.rightShoulder] = { ...fr.image![L.rightShoulder], y: fr.image![L.rightShoulder].y - 14 }; }, true);
    const r = viewSample(f, 'back');
    expect(r.meta.swapped).toBe(true);
    expect(r.sample.shoulder).toBeCloseTo(5, 0);
  });
  it('hinten: Neigung nach links zeigt im Bild nach links → trunk positiv', () => {
    const f = backPose();
    for (const i of [L.leftShoulder, L.rightShoulder]) f.image![i] = { ...f.image![i], x: f.image![i].x - 23 };
    expect(fixBackLabels(f.image!).swapped).toBe(false);
    expect(viewSample(f, 'back').sample.trunk!).toBeCloseTo(5, 0);
  });
});

describe('Zusammenfassung', () => {
  it('Mittel in ganzen Grad, zu wenige Frames → NaN', () => {
    const r = summarizeView([{ head: 10.4, trunk: NaN }, { head: 11, trunk: NaN }, { head: 11.2, trunk: 2 }], 'side');
    expect(r.head).toBe(11);
    expect(Number.isNaN(r.trunk!)).toBe(true);
  });
  it('Asymmetrie-Liste: größte zuerst, unter 1° nicht aufgeführt, Texte ohne Bewertung', () => {
    const list = asymmetries({ front: { shoulder: 2, pelvis: 0, head: -4, trunk: NaN }, side: { head: 12, trunk: -3, leg: 0, knee: 0 } });
    expect(list.map((i) => i.deg)).toEqual([12, 4, 3, 2]);
    expect(list[0].text).toBe('nach vorn');
    expect(list[1].text).toBe('rechts höher');
    for (const i of list) expect(i.text).not.toMatch(/auffällig|Fehlhaltung|Skoliose|Hohlkreuz|Rundrücken/i);
  });
  it('Richtungstexte', () => {
    expect(directionText('side', 'knee', -2)).toBe('Knie dahinter');
    expect(directionText('front', 'trunk', 3)).toBe('nach links geneigt');
    expect(directionText('back', 'pelvis', 0)).toBe('waagerecht');
    expect(directionText('front', 'trunk', 0)).toBe('senkrecht');
    expect(directionText('side', 'head', 0)).toBe('im Lot');
  });
});

describe('Linien im Bild', () => {
  it('Mittelwert der Punkte', () => {
    const a = makePose().image!, b = makePose({ dx: 10 }).image!;
    expect(meanPoints([a, b])![L.nose].x).toBeCloseTo(a[L.nose].x + 5);
    expect(meanPoints([])).toBeNull();
  });
  it('seitlich: Kette Knöchel→Ohr (4 Strecken) + Lotlinien; Lot durch den Knöchel ist senkrecht', () => {
    const f = makeSidePose({ headDeg: 15 });
    const lines = overlayLines('side', f.image!, 'left');
    expect(lines.filter((l) => l.kind === 'measured')).toHaveLength(4);
    const lot = lines.find((l) => l.kind === 'reference')!;
    expect(lot.a.x).toBe(lot.b.x);
  });
  it('vorne: drei Linien + Rumpfachse, Bezugslinien waagerecht bzw. senkrecht', () => {
    const lines = overlayLines('front', makePose().image!);
    expect(lines.filter((l) => l.kind === 'measured')).toHaveLength(4);
    const refs = lines.filter((l) => l.kind === 'reference');
    expect(refs.slice(0, 3).every((l) => l.a.y === l.b.y)).toBe(true);
    expect(refs[3].a.x).toBe(refs[3].b.x);
  });
});
