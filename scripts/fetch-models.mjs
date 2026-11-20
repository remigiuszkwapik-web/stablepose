// Lädt die Pose-Landmarker-Modelle (Apache-2.0) einmalig von Google Storage nach public/models.
// Nur für die Einrichtung nötig – die App selbst lädt zur Laufzeit nichts aus dem Internet.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/models');
mkdirSync(out, { recursive: true });

const base = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';
const models = ['lite', 'full'];
for (const m of models) {
  const file = join(out, `pose_landmarker_${m}.task`);
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`vorhanden: ${file}`);
    continue;
  }
  const url = `${base}/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;
  console.log(`lade ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`gespeichert: ${file}`);
}
