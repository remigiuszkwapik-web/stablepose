import type { PoseFrame } from '../analysis/types';
import { PoseRunner, type FrameStats } from '../pose/runner';
import { startCamera, startFile, stopSource, type Facing, type Source } from '../pose/source';
import type { ModelVariant } from '../pose/landmarker';
import { DebugBar } from './debug';
import { h } from './dom';
import { drawSkeleton } from './overlay';
import { WakeLock } from './wakelock';

export type SourceRequest = { kind: 'camera'; facing: Facing } | { kind: 'file'; file: File } | { kind: 'synthetic' };

/** Was ein Test (Controller) von der Kameraansicht bekommt. */
export interface SessionUI {
  /** Unterer Bereich für Anleitung und Buttons. */
  panel: HTMLElement;
  /** Große Anzeige mittig über dem Bild (Countdown, Timer). */
  big: HTMLElement;
  /** Hinweiszeile oben (Positionscheck). */
  setHint(text: string | null, tone?: 'info' | 'warn' | 'ok'): void;
  setHighlight(points: Set<number> | null): void;
  setDebugRows(rows: [string, string, boolean?][]): void;
  /** Durchschnittliche fps seit letztem Aufruf. */
  takeFpsAverage(): number;
  modelName(): string;
  isFile: boolean;
  /** Videodatei von vorn abspielen (nur Video-Modus). */
  restartVideo(): void;
  exit(): void;
  /** Welche Kamera (null = Videodatei/synthetisch). */
  facing: Facing | null;
  /** Tipp auf das Bild, in Quellbild-Pixeln (Spiegelung berücksichtigt). null = aus. */
  onTap(cb: ((p: { x: number; y: number }) => void) | null): void;
  /** Zusätzliche Zeichnung über dem Skelett (Quellbild-Pixel). Wird jedes Bild aufgerufen. */
  setOverlay(draw: ((ctx: CanvasRenderingContext2D, frame: PoseFrame | null) => void) | null): void;
  /** Overlay sofort neu zeichnen (z. B. nach einem Tipp bei pausiertem Video). */
  redraw(): void;
  /** Segmentierungsmaske anfordern (Körperumriss). */
  setMask(on: boolean): void;
  /** Größe des Quellbilds. */
  sourceSize(): { width: number; height: number };
  /** Ansicht um einen Quellbild-Punkt vergrößern (Lupe zum genauen Antippen). null = normal. */
  setZoom(p: { x: number; y: number } | null, factor?: number): void;
}

export interface Controller {
  onFrame(frame: PoseFrame, stats: FrameStats): void;
  dispose?(): void;
}

export interface SessionOptions {
  root: HTMLElement;
  source: SourceRequest;
  model: ModelVariant;
  title: string;
  controller: (ui: SessionUI) => Controller;
  onExit: () => void;
  onError: (message: string) => void;
}

/** Kameraansicht: Video + Skelett + Debug + Bereich für den Testablauf. Immer dunkel. */
export async function openSession(o: SessionOptions): Promise<() => void> {
  document.documentElement.classList.add('force-dark');

  const video = h('video', { class: 'media', playsinline: true, muted: true });
  const canvas = h('canvas', { class: 'media overlay' });
  const mediaBox = h('div', { class: 'media-box' }, video, canvas);
  const big = h('div', { class: 'bigview', 'aria-live': 'polite' });
  const hint = h('div', { class: 'hint', hidden: true, role: 'status' });
  const status = h('div', { class: 'loading' }, 'Modell wird geladen …');
  const stage = h('div', { class: 'stage' }, mediaBox, big, status);
  const debug = new DebugBar();
  const panel = h('div', { class: 'panel' });
  const exitBtn = h('button', { type: 'button', class: 'btn ghost small' }, 'Beenden');
  const title = h('div', { class: 'session-title' }, o.title);
  const topbar = h('div', { class: 'topbar' }, exitBtn, title, debug.el);

  const isFile = o.source.kind === 'file';
  let fileMirrored = false;
  const videoTools = isFile
    ? h(
        'div',
        { class: 'video-tools' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => restartVideo() }, 'Von vorn'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => togglePlay() }, 'Pause/Weiter'),
        (() => {
          const b = h('button', { type: 'button', class: 'btn ghost small', 'aria-pressed': 'false' }, 'Langsam');
          b.addEventListener('click', () => {
            video.playbackRate = video.playbackRate === 1 ? 0.5 : 1;
            b.setAttribute('aria-pressed', String(video.playbackRate !== 1));
          });
          return b;
        })(),
        (() => {
          const b = h('button', { type: 'button', class: 'btn ghost small', 'aria-pressed': 'false', title: 'Wenn das Video gespiegelt aufgenommen wurde (Selfie), links und rechts tauschen' }, 'Gespiegelt');
          b.addEventListener('click', () => {
            fileMirrored = !fileMirrored;
            b.setAttribute('aria-pressed', String(fileMirrored));
            runner.resetSmoothing();
          });
          return b;
        })(),
      )
    : null;

  const root = h('div', { class: 'session' }, topbar, hint, stage, videoTools, panel);
  o.root.replaceChildren(root);

  let source: Source | null = null;
  let syntheticSize: { w: number; h: number } | null = null;
  let highlight: Set<number> | null = null;
  let overlayDraw: ((ctx: CanvasRenderingContext2D, frame: PoseFrame | null) => void) | null = null;
  let tapCb: ((p: { x: number; y: number }) => void) | null = null;
  let lastFrame: PoseFrame | null = null;
  const paint = (frame: PoseFrame | null) => {
    drawSkeleton(canvas, frame, { highlight: highlight ?? undefined });
    const ctx = canvas.getContext('2d');
    if (overlayDraw && ctx) overlayDraw(ctx, frame);
  };
  let disposed = false;
  const wake = new WakeLock();

  const runner = new PoseRunner({
    video,
    clock: isFile ? 'media' : 'wall',
    sourceMirrored: () => fileMirrored,
    onFrame: (frame, stats) => {
      lastFrame = frame;
      paint(frame);
      controller.onFrame(frame, stats);
      debug.update(frame, stats, debugRows);
    },
  });
  let debugRows: [string, string, boolean?][] = [];

  const restartVideo = () => {
    if (!isFile) return;
    video.currentTime = 0;
    runner.resetSmoothing();
    void video.play();
  };
  const togglePlay = () => (video.paused ? void video.play() : video.pause());

  const ui: SessionUI = {
    panel,
    big,
    setHint(text, tone = 'info') {
      hint.hidden = !text;
      hint.textContent = text ?? '';
      hint.dataset.tone = tone;
    },
    setHighlight(p) { highlight = p; },
    setDebugRows(rows) { debugRows = rows; },
    takeFpsAverage: () => runner.takeFpsAverage(),
    modelName: () => (runner.info?.model === 'lite' ? 'Lite' : 'Full'),
    isFile,
    restartVideo,
    exit: () => cleanup(),
    facing: o.source.kind === 'camera' ? o.source.facing : null,
    onTap(cb) {
      tapCb = cb;
      mediaBox.classList.toggle('tappable', !!cb);
    },
    setOverlay(draw) { overlayDraw = draw; },
    redraw() { paint(lastFrame); },
    setMask(on) { void runner.setMask(on); },
    sourceSize: () => ({ width: lastFrame?.width ?? video.videoWidth, height: lastFrame?.height ?? video.videoHeight }),
    setZoom(p, factor = 4) {
      if (!p) {
        mediaBox.style.transform = '';
        mediaBox.style.transformOrigin = '';
        return;
      }
      const { width, height } = ui.sourceSize();
      const mirrored = mediaBox.classList.contains('mirrored');
      const ox = ((mirrored ? width - p.x : p.x) / width) * 100;
      const oy = (p.y / height) * 100;
      mediaBox.style.transformOrigin = `${ox}% ${oy}%`;
      // Spiegelung (Klasse) muss in der Inline-Transformation erhalten bleiben
      mediaBox.style.transform = `${mirrored ? 'scaleX(-1) ' : ''}scale(${factor})`;
    },
  };
  mediaBox.addEventListener('click', (e) => {
    if (!tapCb) return;
    const r = mediaBox.getBoundingClientRect();
    const { width, height } = ui.sourceSize();
    if (!width || !height || !r.width) return;
    let x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (mediaBox.classList.contains('mirrored')) x = 1 - x; // angezeigt gespiegelt, Quelle nicht
    tapCb({ x: x * width, y: y * height });
  });
  const controller = o.controller(ui);

  // Anzeige in das verfügbare Feld einpassen (Hoch- und Querformat).
  const fit = () => {
    const vw = syntheticSize?.w ?? (video.videoWidth || 16);
    const vh = syntheticSize?.h ?? (video.videoHeight || 9);
    const r = stage.getBoundingClientRect();
    const s = Math.min(r.width / vw, r.height / vh);
    mediaBox.style.width = `${Math.floor(vw * s)}px`;
    mediaBox.style.height = `${Math.floor(vh * s)}px`;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  video.addEventListener('loadedmetadata', fit);
  video.addEventListener('resize', fit);

  function cleanup() {
    if (disposed) return;
    disposed = true;
    controller.dispose?.();
    runner.dispose();
    stopSource(video, source);
    ro.disconnect();
    void wake.disable();
    document.documentElement.classList.remove('force-dark');
    o.onExit();
  }
  exitBtn.addEventListener('click', cleanup);

  if (import.meta.env.DEV && o.source.kind === 'synthetic') {
    // Nur Entwicklung: künstliche Person statt Kamera (siehe src/dev/syntheticPose.ts).
    const { syntheticScript } = await import('../dev/syntheticPose');
    status.remove();
    syntheticSize = { w: 720, h: 1280 };
    fit();
    const t0 = performance.now();
    const timer = window.setInterval(() => {
      if (disposed) return window.clearInterval(timer);
      const stand = (window as unknown as { __standSide?: 'left' | 'right' }).__standSide;
      const frame = syntheticScript(performance.now() - t0, stand, o.title === 'Körpergröße');
      lastFrame = frame;
      paint(frame);
      const stats = { fps: 30, inferenceMs: 0, model: 'synthetisch', delegate: '–' };
      controller.onFrame(frame, stats);
      debug.update(frame, stats, debugRows);
    }, 33);
    return cleanup;
  }

  try {
    // Kamera zuerst (Tipp-Geste noch „frisch“ für iOS), dann Modell.
    if (o.source.kind === 'camera') {
      source = await startCamera(video, o.source.facing);
      mediaBox.classList.toggle('mirrored', o.source.facing === 'user'); // nur Anzeige spiegeln
    } else if (o.source.kind === 'file') {
      source = await startFile(video, o.source.file);
    }
    fit();
    void wake.enable();
    await runner.load(o.model);
    status.remove();
    runner.start();
    if (isFile) restartVideo();
  } catch (err) {
    const msg = describeError(err);
    cleanup();
    o.onError(msg);
  }
  return cleanup;
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Kein Zugriff auf die Kamera. Erlaube den Zugriff in den Safari-Einstellungen für diese Website und versuch es noch einmal.';
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'Keine passende Kamera gefunden.';
    if (err.name === 'NotReadableError') return 'Die Kamera wird gerade von einer anderen App benutzt.';
  }
  return err instanceof Error ? err.message : String(err);
}
