import type { Pt } from './types';

/**
 * Exponentiell gleitender Mittelwert für eine Punktliste.
 * alpha = 1: keine Glättung. alpha klein: stark geglättet.
 * Keine DOM-Abhängigkeit, Zustand liegt im Objekt.
 */
export class PointSmoother {
  private prev: Pt[] | null = null;
  private lastT = -Infinity;

  constructor(private alpha: number, private resetAfterMs = 500) {}

  reset(): void {
    this.prev = null;
    this.lastT = -Infinity;
  }

  /** Nimmt neue Punkte und gibt geglättete zurück. Bei Lücke > resetAfterMs wird neu begonnen. */
  push(points: Pt[] | null, t: number): Pt[] | null {
    if (!points) {
      if (t - this.lastT > this.resetAfterMs) this.prev = null;
      return null;
    }
    if (!this.prev || this.prev.length !== points.length || t - this.lastT > this.resetAfterMs || t < this.lastT) {
      this.prev = points.map((p) => ({ ...p }));
    } else {
      const a = this.alpha;
      this.prev = points.map((p, i) => {
        const q = this.prev![i];
        return {
          x: q.x + a * (p.x - q.x),
          y: q.y + a * (p.y - q.y),
          z: q.z + a * (p.z - q.z),
          v: q.v + a * (p.v - q.v),
        };
      });
    }
    this.lastT = t;
    return this.prev.map((p) => ({ ...p }));
  }
}

/** Gleitender Mittelwert über ein Zeitfenster (z. B. fps-Anzeige oder Mittelung von Winkeln). */
export class WindowAverage {
  private items: { t: number; v: number }[] = [];
  constructor(private windowMs: number) {}
  push(v: number, t: number): number {
    if (Number.isFinite(v)) this.items.push({ t, v });
    while (this.items.length && t - this.items[0].t > this.windowMs) this.items.shift();
    return this.value();
  }
  value(): number {
    if (!this.items.length) return NaN;
    return this.items.reduce((s, i) => s + i.v, 0) / this.items.length;
  }
  reset(): void { this.items = []; }
}

/** Mittelwert einer Zahlenliste, NaN-Werte werden ignoriert. Leere Liste → NaN. */
export function mean(values: number[]): number {
  const f = values.filter(Number.isFinite);
  return f.length ? f.reduce((s, v) => s + v, 0) / f.length : NaN;
}
