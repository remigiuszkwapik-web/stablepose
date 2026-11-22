import './styles.css';
import { config } from './config';
import { renderLicenses } from './ui/licenses';
import { liveController } from './ui/live';
import { singleLegController } from './ui/singleLeg';
import { renderResults } from './ui/results';
import { postureController } from './ui/posture';
import { heightController } from './ui/height';
import type { TrialRecord } from './analysis/results';
import { openSession, type SourceRequest } from './ui/session';
import { renderStart, settings, type StartHandlers } from './ui/start';

const app = document.getElementById('app')!;

// Nur Dev-Server: ?fast verkürzt den Ablauf für Browser-Tests.
if (import.meta.env.DEV && location.search.includes('fast')) {
  Object.assign(config.singleLeg, { durationS: 6, countdownS: 2, trialsPerSide: 2 });
}

const TESTS: StartHandlers['tests'] = [
  { value: 'singleLeg', label: 'Einbeinstand', description: `Gleichgewicht auf einem Bein, ${config.singleLeg.durationS} s` },
  { value: 'posture', label: 'Haltung', description: 'Vorne und seitlich, je 3 s' },
  { value: 'height', label: 'Körpergröße', description: 'Mit der Waagenplatte als Maßstab' },
  { value: 'live', label: 'Live-Ansicht', description: 'Nur Skelett anzeigen, ohne Messung' },
];

function showStart(error?: string) {
  renderStart(app, {
    tests: TESTS,
    error,
    onCamera: () =>
      start(import.meta.env.DEV && location.search.includes('synthetic') ? { kind: 'synthetic' } : { kind: 'camera', facing: settings.facing }),
    onFile: (file) => start({ kind: 'file', file }),
    onLicenses: () => renderLicenses(app, () => showStart()),
  });
}

function start(source: SourceRequest) {
  // Messdaten leben nur im Arbeitsspeicher, bis exportiert wird (kein localStorage).
  let finished: TrialRecord[] | null = null;
  void openSession({
    root: app,
    source,
    model: settings.model,
    title: { singleLeg: 'Einbeinstand', posture: 'Haltung', height: 'Körpergröße', live: 'Live-Ansicht' }[settings.test],
    controller:
      settings.test === 'singleLeg'
        ? (ui) => singleLegController(ui, (records) => { finished = records; ui.exit(); })
        : settings.test === 'posture'
          ? postureController
          : settings.test === 'height'
            ? heightController
            : liveController,
    onExit: () => (finished && finished.length ? renderResults(app, finished, () => showStart()) : showStart()),
    onError: (msg) => showStart(msg),
  });
}

showStart();
