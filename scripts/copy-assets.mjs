// Kopiert die MediaPipe-WASM-Dateien aus node_modules nach public/mediapipe/wasm,
// damit sie selbst gehostet werden (kein CDN zur Laufzeit). Läuft automatisch vor dev und build.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = join(root, 'public/mediapipe/wasm');

if (!existsSync(src)) {
  console.error('[copy-assets] MediaPipe nicht gefunden. Bitte zuerst "npm install" ausführen.');
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) cpSync(join(src, f), join(dst, f));
console.log(`[copy-assets] ${readdirSync(dst).length} WASM-Dateien nach public/mediapipe/wasm kopiert.`);

for (const m of ['pose_landmarker_lite.task', 'pose_landmarker_full.task']) {
  if (!existsSync(join(root, 'public/models', m))) {
    console.warn(`[copy-assets] WARNUNG: public/models/${m} fehlt. Bitte "npm run fetch-models" ausführen.`);
  }
}
