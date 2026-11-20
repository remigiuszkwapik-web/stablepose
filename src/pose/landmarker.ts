import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { config } from '../config';

export type ModelVariant = 'lite' | 'full';
export type Delegate = 'GPU' | 'CPU';

export interface LoadedLandmarker {
  landmarker: PoseLandmarker;
  model: ModelVariant;
  delegate: Delegate;
  /** Grund, warum auf CPU zurückgefallen wurde (für die Debug-Anzeige). */
  fallbackReason?: string;
}

/** Relative URL zur aktuellen Seite – funktioniert in jedem Unterordner. */
const assetUrl = (path: string) => new URL(path, document.baseURI).href;

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function fileset() {
  // WASM-Dateien sind selbst gehostet (siehe scripts/copy-assets.mjs). Kein CDN.
  filesetPromise ??= FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm').replace(/\/$/, ''));
  return filesetPromise;
}

async function create(model: ModelVariant, delegate: Delegate): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(await fileset(), {
    baseOptions: {
      modelAssetPath: assetUrl(`models/pose_landmarker_${model}.task`),
      delegate,
    },
    // Für GPU braucht MediaPipe eine eigene Canvas; ohne Angabe legt es selbst eine an.
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: config.pose.minPoseDetectionConfidence,
    minPosePresenceConfidence: config.pose.minPosePresenceConfidence,
    minTrackingConfidence: config.pose.minTrackingConfidence,
    outputSegmentationMasks: false,
  });
}

/** Lädt den Landmarker. Versucht GPU, fällt bei Fehler automatisch auf CPU zurück. */
export async function loadLandmarker(model: ModelVariant, prefer: Delegate = 'GPU'): Promise<LoadedLandmarker> {
  if (prefer === 'GPU') {
    try {
      return { landmarker: await create(model, 'GPU'), model, delegate: 'GPU' };
    } catch (err) {
      console.warn('GPU-Delegate fehlgeschlagen, nutze CPU', err);
      return {
        landmarker: await create(model, 'CPU'),
        model,
        delegate: 'CPU',
        fallbackReason: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { landmarker: await create(model, 'CPU'), model, delegate: 'CPU' };
}
