# Fortschritt

## M0 – Projekt aufsetzen ✅

**Gebaut**
- Vite + TypeScript + Vitest, Ordner `src/analysis`, `src/pose`, `src/ui`, `tests`, `scripts`.
- README (Deutsch), `DECISIONS.md`, `LICENSES.md`, `.gitignore`, Cloudflare-Header.
- Modelle `pose_landmarker_lite.task` und `pose_landmarker_full.task` in `public/models/`
  (Download hat funktioniert).
- WASM-Dateien werden beim Build automatisch selbst gehostet.
- Schriften Geist/Geist Mono lokal eingebunden.

**Getestet**
- `npm run build` grün, `npm test` grün (Platzhaltertest).

**Offen**
- Noch keine Funktion in der App (kommt ab M1).

**Testanleitung**
- Im Terminal `npm install` und dann `npm run dev`. Öffne die angezeigte Adresse. Du
  solltest auf grauem Hintergrund das Wort „Stand“ sehen.
