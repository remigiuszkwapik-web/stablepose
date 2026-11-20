/** Ein Körperpunkt. Reine Daten, unabhängig von MediaPipe. */
export interface Pt {
  x: number;
  y: number;
  z: number;
  /** Sichtbarkeit 0..1 (MediaPipe „visibility“). */
  v: number;
}

/**
 * Ein ausgewerteter Frame.
 * - image: 33 Punkte in Pixeln des Quellbilds (x nach rechts, y nach unten). Unabhängig von der
 *   Anzeige-Spiegelung: links/rechts bezieht sich immer auf die Person.
 * - world: 33 Punkte in Metern, Ursprung Hüftmitte, y nach unten, z: kleiner = näher zur Kamera.
 */
export interface PoseFrame {
  /** Zeit in ms (Kamera: performance.now, Video: Zeit im Video). */
  t: number;
  width: number;
  height: number;
  image: Pt[] | null;
  world: Pt[] | null;
  /** Optional: Segmentierungsmaske der Person (Werte 0..1), nur wenn angefordert. */
  mask?: { data: Float32Array; width: number; height: number };
}

export type Side = 'left' | 'right';

export const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left');
