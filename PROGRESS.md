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

## M1 – Kamera und Skelett ✅

**Gebaut**
- Startscreen „Stand“ mit Auswahl Kamera (Vorne/Hinten) und Modell (Full/Lite, Standard Full),
  Buttons „Kamera starten“ und „Video laden“, Datenschutz-Hinweis, Link „Lizenzen“.
- Kameraansicht (immer dunkel): Live-Video mit Skelett-Overlay in Stahlgrau, blasse Punkte bei
  schlechter Sichtbarkeit. Frontkamera wird gespiegelt angezeigt, ausgewertet wird ungespiegelt.
- Debug-Leiste (oben rechts, „Debug“ antippen): fps, Inferenzzeit, Modell, GPU/CPU, Anzahl
  gut sichtbarer Punkte, Bildgröße.
- GPU-Delegate mit automatischem Rückfall auf CPU.
- Video-Modus: eigene Videodatei laden; Buttons „Von vorn“, „Pause/Weiter“, „Langsam“ (0,5×)
  und „Gespiegelt“ (links/rechts tauschen bei gespiegelt gespeicherten Selfie-Videos).
- Bildschirm bleibt während der Kameraansicht wach (Wake Lock, wenn verfügbar).
- Hoch- und Querformat (im Querformat steht das Bedienfeld rechts neben dem Bild).
- Lizenzen-Bildschirm mit Apache-2.0- und OFL-Volltext.

**Getestet**
- 21 Unit-Tests: Winkel aus drei Punkten, Abstände, Neigung zur Horizontalen, Runden,
  Glättung (inkl. Neustart nach Lücke/Zurückspulen), Fensterdurchschnitt, Pixelumrechnung,
  links/rechts tauschen.
- Headless-Chromium mit Beispielvideo als künstliche Kamera: Modell lädt (GPU), Skelett wird
  gezeichnet, 26 von 33 Punkten erkannt, **keine einzige Anfrage an fremde Server**.
- Video-Datei-Modus im Headless-Browser geprüft.

**Offen**
- Auf echtem iPhone noch nicht getestet (kann ich hier nicht). Besonders prüfen: GPU oder CPU?
  Welche fps erreicht Full bzw. Lite?

**Testanleitung**
1. Öffne die Seite auf dem iPhone (siehe README). Du siehst „Stand“ und zwei Einstellungen.
2. Tippe auf „Kamera starten“ und erlaube die Kamera. Kurz steht „Modell wird geladen …“.
3. Stell dich vor die Kamera. Über dir erscheint ein graues Skelett. Bewegst du den rechten
   Arm, bewegt sich im Bild der Arm auf derselben Seite wie im Spiegel.
4. Tippe oben rechts auf „Debug“: Du siehst fps, Inferenz in ms, „Full“, „GPU“ oder „CPU“ und
   z. B. „31 / 33“ Punkte.
5. Dreh das iPhone quer: Bild und Bedienfeld ordnen sich nebeneinander an.
6. „Beenden“ → zurück zum Start. „Video laden“ → wähle ein Video aus der Mediathek. Es läuft
   von vorn, mit Skelett. Probier „Langsam“ und „Von vorn“.
