import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { config } from '../config';
import { swapLeftRight, toImagePoints, toWorldPoints } from '../analysis/frame';
import { PointSmoother, WindowAverage } from '../analysis/smoothing';
import type { PoseFrame } from '../analysis/types';
import { loadLandmarker, type LoadedLandmarker } from './landmarker';

export interface FrameStats {
  fps: number;
  inferenceMs: number;
  model: string;
  delegate: string;
  fallbackReason?: string;
}

export interface RunnerOptions {
  video: HTMLVideoElement;
  /** Zeit für die Analyse: Kamera = Uhrzeit, Video = Position im Video (reproduzierbar). */
  clock: 'wall' | 'media';
  /** Quelle ist bereits gespiegelt (Selfie-Video) → links/rechts tauschen. */
  sourceMirrored: () => boolean;
  onFrame: (frame: PoseFrame, stats: FrameStats) => void;
}

/**
 * Verarbeitet jedes neue Videobild mit MediaPipe und ruft onFrame auf.
 * Nutzt requestVideoFrameCallback (Safari ≥ 15.4), sonst requestAnimationFrame.
 */
export class PoseRunner {
  private loaded: LoadedLandmarker | null = null;
  private running = false;
  private lastMpTs = 0;
  private lastMediaTime = -1;
  private fpsAvg = new WindowAverage(2000);
  private infAvg = new WindowAverage(1000);
  private lastFrameWall = 0;
  private smoothImage = new PointSmoother(config.pose.smoothingAlpha);
  private smoothWorld = new PointSmoother(config.pose.smoothingAlpha);
  private handle = 0;
  private fpsSamples: number[] = [];

  constructor(private opts: RunnerOptions) {}

  get info() { return this.loaded; }

  async load(model: 'lite' | 'full'): Promise<LoadedLandmarker> {
    const prev = this.loaded;
    this.loaded = await loadLandmarker(model);
    prev?.landmarker.close();
    this.resetSmoothing();
    return this.loaded;
  }

  resetSmoothing() {
    this.smoothImage.reset();
    this.smoothWorld.reset();
  }

  /** Durchschnittliche fps seit dem letzten Aufruf (für den Export), danach zurückgesetzt. */
  takeFpsAverage(): number {
    const s = this.fpsSamples;
    this.fpsSamples = [];
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    const v = this.opts.video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
  }

  dispose() {
    this.stop();
    this.loaded?.landmarker.close();
    this.loaded = null;
  }

  private schedule() {
    if (!this.running) return;
    const v = this.opts.video;
    if ('requestVideoFrameCallback' in v) {
      this.handle = v.requestVideoFrameCallback(() => this.tick());
    } else {
      this.handle = requestAnimationFrame(() => this.tick());
    }
  }

  private tick() {
    try {
      this.process();
    } catch (err) {
      console.error(err);
      // GPU kann auch erst beim ersten Bild scheitern → einmalig auf CPU wechseln.
      if (this.loaded?.delegate === 'GPU') {
        const model = this.loaded.model;
        this.loaded.landmarker.close();
        this.loaded = null;
        void loadLandmarker(model, 'CPU').then((l) => {
          this.loaded = { ...l, fallbackReason: err instanceof Error ? err.message : String(err) };
          this.schedule();
        });
        return;
      }
    }
    this.schedule();
  }

  private process() {
    const v = this.opts.video;
    if (!this.loaded || v.readyState < 2 || v.videoWidth === 0) return;
    if (v.currentTime === this.lastMediaTime) return; // kein neues Bild (z. B. rAF-Fallback oder Pause)
    this.lastMediaTime = v.currentTime;

    const wall = performance.now();
    // MediaPipe verlangt streng steigende Zeitstempel – auch wenn ein Video zurückgespult wird.
    const mpTs = Math.max(this.lastMpTs + 1, Math.round(wall));
    this.lastMpTs = mpTs;

    const t0 = performance.now();
    const result: PoseLandmarkerResult = this.loaded.landmarker.detectForVideo(v, mpTs);
    const inference = performance.now() - t0;

    if (this.lastFrameWall) {
      const fps = 1000 / (wall - this.lastFrameWall);
      this.fpsAvg.push(fps, wall);
      this.fpsSamples.push(fps);
    }
    this.lastFrameWall = wall;
    this.infAvg.push(inference, wall);

    const t = this.opts.clock === 'media' ? v.currentTime * 1000 : wall;
    const w = v.videoWidth;
    const h = v.videoHeight;
    let image = result.landmarks[0] ? toImagePoints(result.landmarks[0], w, h) : null;
    let world = result.worldLandmarks[0] ? toWorldPoints(result.worldLandmarks[0]) : null;
    if (this.opts.sourceMirrored()) {
      image = image && swapLeftRight(image);
      world = world && swapLeftRight(world);
    }
    image = this.smoothImage.push(image, t);
    world = this.smoothWorld.push(world, t);
    result.close?.();

    this.opts.onFrame(
      { t, width: w, height: h, image, world },
      {
        fps: this.fpsAvg.value(),
        inferenceMs: this.infAvg.value(),
        model: this.loaded.model === 'full' ? 'Full' : 'Lite',
        delegate: this.loaded.delegate,
        fallbackReason: this.loaded.fallbackReason,
      },
    );
  }
}
