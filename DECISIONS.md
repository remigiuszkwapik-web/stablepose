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

## M1 – Kamera und Skelett

- **Links/rechts bei der Frontkamera:** MediaPipe bekommt immer das *ungespiegelte* Kamerabild.
  Dann sind „linke Hüfte“ usw. anatomisch korrekt aus Sicht der Person. Gespiegelt wird
  **nur die Anzeige** (CSS `scaleX(-1)` auf Video und Skelett gemeinsam). So stimmt die
  Auswertung, und die Person sieht sich trotzdem wie im Spiegel.
- **Gespiegelte Videodateien:** Manche Selfie-Videos sind schon gespiegelt gespeichert. Dafür
  gibt es im Video-Modus den Schalter „Gespiegelt“, der links und rechts in der Auswertung
  tauscht. Automatisch erkennen lässt sich das nicht zuverlässig.
- **Zeitbasis im Video-Modus:** Die Analyse nutzt die Position im Video (`currentTime`), nicht
  die Uhrzeit. Ein Video ergibt dadurch immer dieselben Zeiten, auch wenn das Gerät langsamer
  rechnet. Zusätzlich gibt es „Langsam“ (halbe Geschwindigkeit), damit auf langsamen Geräten
  weniger Bilder übersprungen werden. MediaPipe selbst bekommt eigene, streng steigende
  Zeitstempel (Pflicht im VIDEO-Modus, auch nach „Von vorn“).
- **Frame-Takt:** `requestVideoFrameCallback` (Safari ab 15.4), sonst `requestAnimationFrame`.
  Es wird nur gerechnet, wenn ein neues Videobild da ist.
- **GPU → CPU:** Zuerst GPU. Scheitert das Laden *oder* das erste Bild, wird automatisch mit CPU
  neu geladen. Die Debug-Leiste zeigt dann „CPU (GPU fehlgeschlagen)“.
- **Glättung:** leichter exponentieller Mittelwert (alpha 0,6) auf alle Punkte, Wert in
  `config.ts`. Stärker glätten würde Fehler (z. B. kurzes Absetzen) verzögern.
- **Video-Datei startet erst nach dem Laden des Modells** von vorn, damit kein Bild verloren geht.
- **Kamera-Auflösung:** 1280 × 720 bei 30 fps angefragt (Safari wählt ggf. anders). Höher bringt
  für den Pose Landmarker nichts, weil er intern ohnehin klein rechnet.
- **Einstellungen** (Kamera, Modell) werden nur im Arbeitsspeicher gehalten, nicht im
  localStorage – nach Neuladen wieder Standard.

## M2 – Positionscheck und Ablauf

- **Positionscheck** (`src/analysis/position.ts`) prüft in dieser Reihenfolge und zeigt immer nur
  die wichtigste Anweisung: Person da? → Kopf und Füße im Bild (beides fehlt = „Geh einen Schritt
  zurück“) → groß genug („Komm einen Schritt näher“) → mittig → frontal → Körperpunkte gut sichtbar.
- **Scheitel** liegt nicht als Punkt vor. Geschätzt als Nase minus 0,6 × Abstand Nase–Schultermitte.
- **Frontal** = Schulterbreite und Hüftbreite groß genug im Verhältnis zur Rumpflänge **und**
  linke Schulter/Hüfte liegt im Kamerabild rechts. Damit wird auch „Rücken zur Kamera“ erkannt.
  Ein gespiegelt gespeichertes Selfie-Video sieht für das Modell aber genauso aus wie ein normales –
  das kann man nicht automatisch erkennen (deshalb der Schalter „Gespiegelt“, ein Test hält das fest).
- **Ablauf:** Positionscheck muss 1 s ununterbrochen passen → 5 s Countdown (kurzes Verlieren der
  Position < 1 s wird toleriert, länger → zurück zum Check) → Warten auf Startposition → 20 s Messung.
  Die Messung läuft nach dem Start bis zum Ende durch, auch wenn die Person das Bein absetzt –
  das ist dann ein Fehler (M3), kein Abbruch. So ist es auch beim BESS.
- **Startposition** = Spielfuß mindestens 0,10 Beinlängen über dem Standfuß **und** beide Hände an
  der Hüfte, 0,5 s lang gehalten. Der Timer startet erst dann (BESS: Fehler zählen erst ab korrekter
  Testposition).
- **Hände an der Hüfte = zwei Merkmale:** Handgelenk nah am Hüftpunkt (≤ 0,35 Rumpflängen) **und**
  Ellbogen gebeugt (≤ 140°). Nur der Abstand reicht nicht: Bei hängenden Armen liegt das Handgelenk
  ebenfalls nah am Hüftpunkt (ca. 0,4–0,5 Rumpflängen). Beim Erstellen der Testdaten aufgefallen.
- **Fuß-Höhe** = tiefster sichtbarer Punkt (Knöchel, Ferse, Zehen) je Fuß, relativ zur Beinlänge
  (Hüfte–Knöchel des Standbeins). Unabhängig vom Abstand zur Kamera.
- **Video-Modus:** Bei „Los“ springt das Video an den Anfang, damit jeder Durchlauf gleich ist.
