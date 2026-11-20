import { describe, it, expect } from 'vitest';
import { exportFileName, makeRecord, sideDifference, summarize, toCSV, toJSON, type TrialRecord } from '../src/analysis/results';
import type { TrialErrors } from '../src/analysis/bess';

const errs = (n: number, extra: Partial<TrialErrors> = {}): TrialErrors => ({
  errors: n, rawErrors: n,
  byType: { handsOff: n, footDown: 0, hipAngle: 0, outOfPosition: 0, standFootLift: 0 },
  experimental: 0, inPositionS: 18, unmeasurableShare: 0.123, failedToHold: false, ...extra,
});
const rec = (stand: 'left' | 'right', trial: number, n: number): TrialRecord =>
  makeRecord(errs(n), { date: new Date('2026-11-20T08:15:00Z'), stand, trial, durationMs: 20020, model: 'Full', fpsAvg: 27.6 });

describe('Ergebnisse', () => {
  it('makeRecord rundet auf ganze Zahlen', () => {
    const r = rec('left', 1, 3);
    expect(r.durationS).toBe(20);
    expect(r.fpsAvg).toBe(28);
    expect(r.unmeasurablePct).toBe(12);
  });
  it('Mittelwert je Seite als ganze Zahl', () => {
    const rs = [rec('left', 1, 2), rec('left', 2, 3), rec('left', 3, 3), rec('right', 1, 5)];
    expect(summarize(rs, 'left').mean).toBe(3); // 2,67 → 3
    expect(summarize(rs, 'right').mean).toBe(5);
    expect(summarize(rs, 'left').trials.map((t) => t.trial)).toEqual([1, 2, 3]);
  });
  it('fehlende Seite → NaN, kein Unterschied', () => {
    const rs = [rec('left', 1, 2)];
    expect(Number.isNaN(summarize(rs, 'right').mean)).toBe(true);
    expect(Number.isNaN(sideDifference(summarize(rs, 'left'), summarize(rs, 'right')))).toBe(true);
  });
  it('Unterschied links/rechts als Betrag', () => {
    const rs = [rec('left', 1, 2), rec('right', 1, 5)];
    expect(sideDifference(summarize(rs, 'left'), summarize(rs, 'right'))).toBe(3);
  });
  it('CSV: Kopfzeile, eine Zeile pro Versuch, Semikolon, BOM', () => {
    const csv = toCSV([rec('left', 1, 2), rec('right', 1, 4)]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Datum;Standbein;Versuch;Fehlerzahl');
    expect(lines[0]).toContain('Modell;fps (Durchschnitt)');
    const cells = lines[2].split(';');
    expect(cells[1]).toBe('rechts');
    expect(cells[2]).toBe('1');
    expect(cells[3]).toBe('4');
    expect(cells.at(-2)).toBe('Full');
    expect(cells.at(-1)).toBe('28');
  });
  it('CSV: unbekannte fps → leeres Feld', () => {
    const r = { ...rec('left', 1, 0), fpsAvg: NaN };
    expect(toCSV([r]).trim().split('\r\n')[1].endsWith(';')).toBe(true);
  });
  it('JSON: enthält Zusammenfassung, Versuche, Hinweis, Konfiguration', () => {
    const j = JSON.parse(toJSON([rec('left', 1, 2)], { app: 'Stand', version: '0.1.0', test: 'Einbeinstand', exportedAt: 'x', hinweis: 'Kein medizinischer Test.', config: { a: 1 } }));
    expect(j.summary.left).toEqual({ mean: 2, trials: 1 });
    expect(j.summary.right).toEqual({ mean: null, trials: 0 });
    expect(j.trials[0].byType.handsOff).toBe(2);
    expect(j.notMeasured).toContain('Augen geöffnet');
    expect(j.config).toEqual({ a: 1 });
  });
  it('Dateiname', () => {
    expect(exportFileName(new Date(2026, 10, 20, 8, 5), 'csv')).toBe('stand-einbeinstand-20261120-0805.csv');
  });
});
