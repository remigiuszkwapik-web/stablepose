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

## M2 – Positionscheck und Ablauf Einbeinstand ✅

**Gebaut**
- Test „Einbeinstand“ auf dem Startscreen (Standard), „Live-Ansicht“ bleibt als zweite Option.
- Ablauf: Standbein wählen (Links/Rechts) → Anleitung → „Los“ → Positionscheck mit klaren
  Hinweisen oben („Geh einen Schritt zurück“, „Deine Füße sind nicht im Bild“, „Dreh dich frontal
  zur Kamera“ …) → großer 5-s-Countdown → Warten auf Startposition („Hände an die Hüfte und das
  rechte Bein anheben“) → großer 20-s-Timer → „Fertig“.
- Messdauer, Countdown, alle Schwellen in `src/config.ts` (`singleLeg.durationS` = 20 → 30 möglich).
- Debug-Leiste zeigt zusätzlich: Phase, Positionsprobleme, Schulter/Rumpf-Verhältnis,
  Körperhöhe, Fußhöhe, Abstand Hand–Hüfte, Ellbogenwinkel, Startposition ja/nein.

**Getestet**
- 57 Unit-Tests gesamt, neu: Positionscheck (13 Fälle, u. a. Füße abgeschnitten, zu weit weg,
  seitlich gedreht, Rücken zur Kamera), Startposition (Bein oben/unten, hängende Arme, falsches
  Bein, gespiegeltes Video), Hüftwinkel aus World Landmarks, Zustandsautomat mit simulierten
  Zeitreihen (idealer Ablauf, Wackeln, Position kurz/lang verloren, Startpose flackert).
- Headless-Browser: Ablauf bis zum Positionscheck durchgeklickt.

**Offen**
- Schwellen sind geschätzt und müssen mit echten Aufnahmen eingestellt werden.

**Testanleitung**
1. Start → „Einbeinstand“ ist ausgewählt → „Kamera starten“.
2. Unten: „Auf welchem Bein stehst du?“ → tippe „Links“.
3. Du siehst die Anleitung in 4 Schritten → „Los“.
4. Stell dich 2–3 m vor das iPhone. Oben steht ein Hinweis in Rot, bis alles passt
   (probier: Füße aus dem Bild → „Deine Füße sind nicht im Bild“; seitlich drehen →
   „Dreh dich frontal zur Kamera“). Passt es, wird der Hinweis grün.
5. Nach 1 s erscheint ein riesiger Countdown 5 – 4 – 3 – 2 – 1.
6. Danach steht groß, was noch fehlt. Erst wenn du die Hände an der Hüfte hast und das rechte
   Bein angehoben ist, startet der Timer: große Zahl 20, 19, … 0.
7. Danach „Fertig“ mit „Noch einmal“ oder „Anderes Bein“.
