import { SWAP_INDEX } from './landmarks';
import type { Pt } from './types';

/** Rohpunkt im MediaPipe-Format (normalisiert 0..1 bzw. Meter). */
export interface RawLandmark { x: number; y: number; z: number; visibility?: number }

/**
 * Normalisierte MediaPipe-Punkte → Pixelkoordinaten des Quellbilds.
 * z wird wie x skaliert (MediaPipe: „z uses roughly the same scale as x“).
 */
export function toImagePoints(raw: RawLandmark[], width: number, height: number): Pt[] {
  return raw.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z * width, v: p.visibility ?? 0 }));
}

export function toWorldPoints(raw: RawLandmark[]): Pt[] {
  return raw.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 0 }));
}

/**
 * Vertauscht links und rechts (Beschriftung). Nötig, wenn die Quelle schon gespiegelt ist
 * (z. B. ein Selfie-Video, das das iPhone gespiegelt gespeichert hat). Dann hält MediaPipe die
 * linke Körperseite für die rechte. Die Koordinaten bleiben, nur die Zuordnung wechselt.
 */
export function swapLeftRight<T>(points: T[]): T[] {
  return points.map((_, i) => points[SWAP_INDEX[i]]);
}

/** Anzahl Punkte mit visibility >= Schwelle. */
export function countVisible(points: Pt[] | null, minVisibility: number): number {
  if (!points) return 0;
  return points.reduce((n, p) => n + (p.v >= minVisibility ? 1 : 0), 0);
}
