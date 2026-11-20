# Stand

**Stand** ist ein Web-Prototyp für ein kamerabasiertes Trainings-Onboarding in kleinen Gyms.
Die App läuft im Browser (Safari auf iPhone und iPad), nutzt die Kamera und erkennt mit
MediaPipe Pose Landmarker 33 Körperpunkte. Tests:

- **Einbeinstand** mit Fehlerzählung nach den BESS-Kriterien (3 Versuche pro Seite, Export CSV/JSON)
- **Haltung frontal** (erster Wurf): Neigung von Schulter- und Beckenlinie in Grad
- **Live-Ansicht**: nur Skelett, ohne Messung

> Kein Medizinprodukt. Keine Diagnosen. Die Werte dienen nur zur Orientierung fürs Training.

**Datenschutz:** Alles läuft lokal im Browser. Kein Bild, kein Video und keine Messung
verlässt das Gerät. Es gibt kein Backend, keine Analytics, keine Tracker und keine externen
Schriften oder CDNs. Modelle, WASM-Dateien und Schriften liegen mit auf dem eigenen Server.

## Was ist wo?

| Ordner/Datei | Inhalt |
|---|---|
| `src/config.ts` | **Alle Schwellenwerte** an einer Stelle, mit Kommentar zur Herkunft |
| `src/analysis/` | Reine Mess-Logik (Winkel, Positionscheck, Fehlerzählung, Ablauf). Kein DOM, mit Tests. |
| `src/pose/` | Anbindung an MediaPipe, Kamera, Video-Datei, Frame-Schleife |
| `src/ui/` | Bildschirme und Oberfläche (Vanilla DOM, kein Framework) |
| `tests/` | Vitest-Tests mit synthetischen Körperpunkten |
| `public/models/` | Die beiden Modelle `pose_landmarker_lite.task` und `pose_landmarker_full.task` |
| `scripts/` | Hilfsskripte (WASM kopieren, Modelle laden) |
| `PROGRESS.md` | Protokoll und Testanleitung |
| `DECISIONS.md` | Entscheidungen mit Begründung |
| `LICENSES.md` | Lizenzen der verwendeten Software und Modelle |

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run fetch-models   # nur nötig, falls public/models/*.task fehlen
npm run dev
```

Im Terminal erscheinen zwei Adressen, z. B.

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.1.23:5173/
```

Am Computer öffnest du die `Local`-Adresse.

## Auf dem iPhone oder iPad testen

1. iPhone und Computer müssen im **selben WLAN** sein.
2. `npm run dev` am Computer starten.
3. Auf dem iPhone in **Safari** die `Network`-Adresse eintippen (mit `https://` vorne).
4. Safari zeigt eine Warnung „Diese Verbindung ist nicht privat“. Das liegt am selbst
   erzeugten Zertifikat für die lokale Entwicklung und ist hier in Ordnung:
   - Tippe auf **„Details einblenden“**,
   - dann auf **„diese Website besuchen“**,
   - und bestätige noch einmal mit **„Website besuchen“**.
5. Die App lädt. Tippe auf **„Kamera starten“** und erlaube den Kamerazugriff.

Warum HTTPS? Safari erlaubt den Kamerazugriff nur auf sicheren Seiten (HTTPS oder localhost).

Tipp: Für Messungen das iPhone auf ein Stativ stellen, ca. 2 bis 3 m entfernt, Kamera auf
Hüfthöhe und möglichst senkrecht.

## Ohne Person ausprobieren (nur Dev-Server)

- `https://localhost:5173/?synthetic` → „Kamera starten“ spielt eine künstliche Person ab
  (setzt den Fuß bei ~12 s ab und nimmt bei ~18 s eine Hand weg).
- `?synthetic&fast` → zusätzlich kurze Versuche (6 s, 2 pro Seite).

Beides ist im Produktions-Build nicht enthalten.

## Schwellen einstellen

Alle Werte stehen in `src/config.ts`, jeweils mit Herkunft ([BESS], [MediaPipe], [geschätzt]).
Mit „Video laden“ + „Langsam“ + „Debug“ siehst du live die Messgrößen und welche Fehlerbedingung
gerade aktiv ist. Details in `PROGRESS.md`, Abschnitt 4.

## Tests und Build

```bash
npm test         # Vitest: alle Analyse-Funktionen mit synthetischen Daten
npm run build    # Typprüfung + Produktions-Build nach dist/
npm run preview  # dist/ lokal ansehen (auch per HTTPS im WLAN)
```

## Auf Cloudflare Pages veröffentlichen

1. Bei Cloudflare anmelden → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** und dieses GitHub-Repository auswählen.
2. Einstellungen:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Unter *Environment variables* optional `NODE_VERSION` = `22`.
3. **Save and Deploy.** Nach ein bis zwei Minuten bekommst du eine Adresse wie
   `https://stand-xyz.pages.dev`. Die ist automatisch HTTPS, die Zertifikatswarnung entfällt.

Die App nutzt nur relative Pfade und funktioniert deshalb auch in einem Unterordner oder
mit jedem anderen statischen Hosting. Die Modelle liegen im Repository (je unter 10 MB,
Cloudflare erlaubt bis 25 MB pro Datei).

## Lizenzen

Siehe [`LICENSES.md`](LICENSES.md) und in der App unter „Lizenzen“.
