import type { Pt } from './types';

export interface Vec { x: number; y: number; z: number }

export const RAD2DEG = 180 / Math.PI;

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = (a: Vec): number => Math.hypot(a.x, a.y, a.z);

/** Mittelpunkt zweier Punkte; Sichtbarkeit = Minimum. */
export function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v, b.v) };
}

/** Abstand in der Bildebene (x, y). */
export function dist2(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Abstand im Raum (x, y, z). */
export function dist3(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Winkel zwischen zwei Vektoren in Grad (0..180). NaN bei Nullvektor. */
export function angleBetween(u: Vec, w: Vec): number {
  const n = norm(u) * norm(w);
  if (n === 0) return NaN;
  const c = Math.max(-1, Math.min(1, dot(u, w) / n));
  return Math.acos(c) * RAD2DEG;
}

/**
 * Winkel am Punkt b, gebildet aus a–b–c, in Grad (0..180).
 * mode '2d' ignoriert z (Bildebene), '3d' nutzt z (z. B. World Landmarks).
 */
export function angle3(a: Vec, b: Vec, c: Vec, mode: '2d' | '3d' = '2d'): number {
  const u = sub(a, b);
  const w = sub(c, b);
  if (mode === '2d') { u.z = 0; w.z = 0; }
  return angleBetween(u, w);
}

/**
 * Neigung der Linie a→b zur Horizontalen in Grad, im Bereich (-90, 90].
 * Bildkoordinaten (y nach unten): positiv = b liegt höher als a.
 */
export function tiltToHorizontal(a: Vec, b: Vec): number {
  let dx = b.x - a.x;
  let dy = a.y - b.y; // y nach unten → umdrehen
  if (dx < 0) { dx = -dx; dy = -dy; } // Richtung egal, nur Neigung
  if (dx === 0 && dy === 0) return NaN;
  return Math.atan2(dy, dx) * RAD2DEG;
}

/** Runden auf ganze Zahl, -0 vermeiden. NaN bleibt NaN. */
export function roundInt(x: number): number {
  const r = Math.round(x);
  return r === 0 ? 0 : r;
}
