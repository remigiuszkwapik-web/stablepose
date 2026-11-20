import { ERROR_LABELS, type ErrorType, type TrialErrors } from './bess';
import type { Side } from './types';

/** Ein abgeschlossener Versuch, so wie er exportiert wird. */
export interface TrialRecord {
  /** ISO-8601-Zeitpunkt des Versuchsendes. */
  date: string;
  stand: Side;
  /** 1-basiert, pro Seite. */
  trial: number;
  errors: number;
  byType: Record<ErrorType, number>;
  experimental: number;
  /** Gemessene Dauer in ganzen Sekunden. */
  durationS: number;
  inPositionS: number;
  /** Anteil nicht auswertbarer Zeit in ganzen Prozent. */
  unmeasurablePct: number;
  failedToHold: boolean;
  model: string;
  /** Durchschnittliche Bildrate in ganzen fps (NaN, wenn unbekannt). */
  fpsAvg: number;
}

export function makeRecord(
  r: TrialErrors,
  meta: { date: Date; stand: Side; trial: number; durationMs: number; model: string; fpsAvg: number },
): TrialRecord {
  return {
    date: meta.date.toISOString(),
    stand: meta.stand,
    trial: meta.trial,
    errors: r.errors,
    byType: { ...r.byType },
    experimental: r.experimental,
    durationS: Math.round(meta.durationMs / 1000),
    inPositionS: r.inPositionS,
    unmeasurablePct: Math.round(r.unmeasurableShare * 100),
    failedToHold: r.failedToHold,
    model: meta.model,
    fpsAvg: Math.round(meta.fpsAvg),
  };
}

export interface SideSummary {
  stand: Side;
  trials: TrialRecord[];
  /** Mittelwert der Fehler als ganze Zahl, NaN wenn keine Versuche. */
  mean: number;
}

export function summarize(records: TrialRecord[], stand: Side): SideSummary {
  const trials = records.filter((r) => r.stand === stand).sort((a, b) => a.trial - b.trial);
  const mean = trials.length ? Math.round(trials.reduce((s, r) => s + r.errors, 0) / trials.length) : NaN;
  return { stand, trials, mean };
}

/** Betrag des Unterschieds der Mittelwerte links/rechts, NaN wenn eine Seite fehlt. Keine Bewertung. */
export function sideDifference(left: SideSummary, right: SideSummary): number {
  return Number.isFinite(left.mean) && Number.isFinite(right.mean) ? Math.abs(left.mean - right.mean) : NaN;
}

const SIDE_DE: Record<Side, string> = { left: 'links', right: 'rechts' };
const CSV_TYPES: ErrorType[] = ['handsOff', 'footDown', 'hipAngle', 'outOfPosition', 'standFootLift'];

/** Lokale Zeit „JJJJ-MM-TT HH:MM“ für die CSV (Tabellenprogramme verstehen das). */
export function localDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function csvCell(v: string | number | boolean): string {
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV mit Semikolon (deutsches Excel/Numbers öffnet das direkt) und UTF-8-BOM für Umlaute.
 * Eine Zeile pro Versuch.
 */
export function toCSV(records: TrialRecord[]): string {
  const header = [
    'Datum', 'Standbein', 'Versuch', 'Fehlerzahl',
    ...CSV_TYPES.map((t) => ERROR_LABELS[t]),
    'Dauer (s)', 'Zeit in Position (s)', 'Nicht auswertbar (%)', 'Position unter 5 s gehalten', 'Modell', 'fps (Durchschnitt)',
  ];
  const rows = records.map((r) => [
    localDateTime(r.date), SIDE_DE[r.stand], r.trial, r.errors,
    ...CSV_TYPES.map((t) => r.byType[t]),
    r.durationS, r.inPositionS, r.unmeasurablePct, r.failedToHold ? 'ja' : 'nein', r.model, r.fpsAvg,
  ]);
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export interface ExportMeta {
  app: string;
  version: string;
  test: string;
  exportedAt: string;
  hinweis: string;
  /** Verwendete Schwellenwerte, damit Exporte später vergleichbar bleiben. */
  config: unknown;
}

export function toJSON(records: TrialRecord[], meta: ExportMeta): string {
  const left = summarize(records, 'left');
  const right = summarize(records, 'right');
  return JSON.stringify(
    {
      ...meta,
      summary: {
        left: { mean: Number.isFinite(left.mean) ? left.mean : null, trials: left.trials.length },
        right: { mean: Number.isFinite(right.mean) ? right.mean : null, trials: right.trials.length },
      },
      notMeasured: ['Augen geöffnet'],
      experimental: ['standFootLift'],
      trials: records.map((r) => ({ ...r, fpsAvg: Number.isFinite(r.fpsAvg) ? r.fpsAvg : null })),
    },
    null,
    2,
  );
}

/** Dateiname mit Datum, z. B. stand-einbeinstand-20261120-0815 */
export function exportFileName(date: Date, ext: 'csv' | 'json'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `stand-einbeinstand-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.${ext}`;
}
