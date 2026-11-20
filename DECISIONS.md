# Entscheidungen

Hier steht, was ich ohne Rückfrage entschieden habe, und warum. Neueste Einträge unten im
jeweiligen Meilenstein.

## M0 – Projekt

- **Versionen:** Vite 8, TypeScript 7, Vitest 5, `@mediapipe/tasks-vision` 1.2.3 (aktuell bei
  Installation). Vitest-Konfiguration liegt in `vitest.config.ts`, weil Vite 8 das Feld
  `test` in `vite.config.ts` nicht mehr typisiert.
- **Modelle im Repository:** Der Download von Google Storage hat funktioniert. Die beiden
  Modelle (5,8 MB und 9,4 MB) liegen deshalb direkt in `public/models/` und werden
  mitversioniert. So funktioniert der Cloudflare-Build ohne Netzwerkzugriff auf Google.
  `npm run fetch-models` lädt sie bei Bedarf neu (`--force` überschreibt).
- **WASM-Dateien nicht im Repository:** Sie werden bei `npm run dev`/`npm run build` aus
  `node_modules` nach `public/mediapipe/wasm/` kopiert (Skript `scripts/copy-assets.mjs`).
  So passen sie immer exakt zur installierten Bibliotheksversion.
- **Schriften:** Geist und Geist Mono kommen als variable WOFF2-Dateien aus dem npm-Paket
  `geist` und werden von Vite gebündelt. Fallback: Systemschrift.
- **Content-Security-Policy** in `index.html`: erlaubt nur Ressourcen vom eigenen Server.
  Damit ist technisch abgesichert, dass die App nichts nach außen schickt.
  `'wasm-unsafe-eval'`/`'unsafe-eval'` sind nötig, damit MediaPipe sein WebAssembly starten kann.
- **Cloudflare-Header** in `public/_headers` (Kamera nur für die eigene Seite, kein Referrer).
