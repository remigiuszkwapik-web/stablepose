import './styles.css';
import { config } from './config';
import { renderLicenses } from './ui/licenses';
import { liveController } from './ui/live';
import { singleLegController } from './ui/singleLeg';
import { openSession, type SourceRequest } from './ui/session';
import { renderStart, settings, type StartHandlers } from './ui/start';

const app = document.getElementById('app')!;

const TESTS: StartHandlers['tests'] = [
  { value: 'singleLeg', label: 'Einbeinstand', description: `Gleichgewicht auf einem Bein, ${config.singleLeg.durationS} s` },
  { value: 'live', label: 'Live-Ansicht', description: 'Nur Skelett anzeigen, ohne Messung' },
];

function showStart(error?: string) {
  renderStart(app, {
    tests: TESTS,
    error,
    onCamera: () => start({ kind: 'camera', facing: settings.facing }),
    onFile: (file) => start({ kind: 'file', file }),
    onLicenses: () => renderLicenses(app, () => showStart()),
  });
}

function start(source: SourceRequest) {
  void openSession({
    root: app,
    source,
    model: settings.model,
    title: settings.test === 'singleLeg' ? 'Einbeinstand' : 'Live-Ansicht',
    controller: settings.test === 'singleLeg' ? singleLegController : liveController,
    onExit: () => showStart(),
    onError: (msg) => showStart(msg),
  });
}

showStart();
