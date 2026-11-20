import './styles.css';
import { renderLicenses } from './ui/licenses';
import { liveController } from './ui/live';
import { openSession, type SourceRequest } from './ui/session';
import { renderStart, settings, type StartHandlers } from './ui/start';

const app = document.getElementById('app')!;

const TESTS: StartHandlers['tests'] = [
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
    title: 'Live-Ansicht',
    controller: liveController,
    onExit: () => showStart(),
    onError: (msg) => showStart(msg),
  });
}

showStart();
