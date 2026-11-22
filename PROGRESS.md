# Fortschritt

## ☀️ Zusammenfassung für dich (Stand Ende des Nachtlaufs)

### 1. Was fertig ist

| Meilenstein | Status | Kurz |
|---|---|---|
| M0 Projekt aufsetzen | ✅ fertig | Vite + TS + Vitest, Doku, Modelle im Repo |
| M1 Kamera und Skelett | ✅ fertig | Kamera vorne/hinten, Lite/Full, Skelett, Debug-Leiste, Video-Modus |
| M2 Positionscheck + Ablauf | ✅ fertig | Hinweise bis alles passt, Countdown, Timer startet erst in Startposition |
| M3 BESS-Fehlerzählung | ✅ fertig | Hände, Fuß, Hüfte > 30°, > 5 s; Ferse/Vorfuß experimentell getrennt |
| M4 Versuche + Ergebnis | ✅ fertig | 3 × pro Seite, Ergebnis-Screen, CSV/JSON-Export |
| M5 Haltung frontal | ✅ fertig (erster Wurf) | Schulter-/Beckenlinie in Grad, Geräteneigung optional |
| M6 Körpergröße mit Platte | ✅ Prototyp | Ecken antippen (Lupe), Neigung per Sensor, Ergebnis mit Spanne |
| M7 Haltung | ✅ | vorne + seitlich, optional andere Seite mit Seitenvergleich; Linien im Bild |

Bei jedem Meilenstein waren `npm run build` und `npm test` grün (am Ende **109 Tests**).
Zusätzlich habe ich jeden Ablauf im Headless-Browser durchgeklickt – mit einem Beispielvideo als
künstlicher Kamera (M1/M2) und mit einer synthetischen Person (M3–M5). Dabei hat die App
**keine einzige Anfrage an fremde Server** gestellt.

**Was ich nicht konnte:** auf einem echten iPhone testen. GPU/CPU, fps, Wake Lock, Kamera-Wechsel,
Download auf iOS und die Geräteneigung sind deshalb nur nach Doku gebaut, nicht am Gerät geprüft.
Alle Schwellenwerte sind Schätzungen – noch nicht mit echten Personen eingestellt.

### 2. Was du als Erstes tun musst

1. **Lokal starten:** Branch `claude/gym-onboarding-mediapipe-eun3mb` holen, dann im Terminal
   `npm install` und `npm run dev`. Die **Modelle sind schon im Repository** (Download hat
   funktioniert), du musst nichts laden. Falls doch etwas fehlt: `npm run fetch-models`.
2. **iPhone:** gleiche WLAN, in Safari die `Network`-Adresse mit `https://` öffnen, Zertifikats-
   warnung bestätigen (Details einblenden → diese Website besuchen → Website besuchen). Steht in der README.
3. **Cloudflare Pages verbinden** (optional, dann ohne Zertifikatswarnung): Workers & Pages →
   Create → Pages → Connect to Git → dieses Repo. Build command `npm run build`, Output `dist`.
   **Achtung:** Cloudflare baut standardmäßig den Branch `main`. Entweder diesen Branch nach `main`
   mergen oder in Cloudflare den Production-Branch auf `claude/gym-onboarding-mediapipe-eun3mb` setzen.
4. Ohne Person ausprobieren: `https://localhost:5173/?synthetic` (nur Dev-Server) →
   „Kamera starten“ spielt eine künstliche Person ab. `?synthetic&fast` = kurze Versuche.

**GitHub Pages:** Die App wird bei jedem Push automatisch veröffentlicht unter
https://remigiuszkwapik-web.github.io/stablepose/ (Einrichtung siehe README).

### 3. Testanleitung iPhone, Schritt für Schritt

1. Seite öffnen → Du siehst **„Stand“**, darunter drei Tests (Einbeinstand ist gewählt), Kamera
   Vorne/Hinten, Modell Full/Lite.
2. iPhone aufs Stativ, ca. 2–3 m entfernt, Hüfthöhe, senkrecht. Für den Anfang: Kamera **Vorne**,
   damit du dich siehst.
3. **„Kamera starten“** → Kamera erlauben → kurz „Modell wird geladen …“ → dunkle Ansicht mit
   deinem Bild (gespiegelt) und grauem Skelett.
4. Oben rechts **„Debug“** → du siehst fps, Inferenz in ms, „Full“, **GPU oder CPU**. Notier dir
   fps und GPU/CPU – das ist die wichtigste Info für mich.
5. Unten **„Links“** tippen (Standbein) → Anleitung → **„Los“**.
6. Oben rote Hinweise, bis du ganz und frontal im Bild bist (probier „Füße raus“ → „Deine Füße sind
   nicht im Bild“). Passt es: grün „Gut so – kurz stillhalten“.
7. Riesiger Countdown **5 … 1**. Danach steht groß, was fehlt („Hände an die Hüfte und das rechte
   Bein anheben“). Sobald du richtig stehst, startet der **20-s-Timer**.
8. Während der Messung: Fuß kurz absetzen → oben rot „Fuß abgesetzt / Schritt“, Bein rot im
   Skelett, unter dem Timer „Fehler 1“. Hand von der Hüfte → „Fehler 2“.
9. Nach 20 s: „Kurze Pause“ mit Fehlerzahl und Aufschlüsselung → „Weiter“ → Versuch 2 und 3 →
   „Weiter: Standbein Rechts“ → 3 Versuche.
10. **„Ergebnis ansehen“**: Links/Rechts mit Mittelwert und Versuchen, Unterschied, Hinweis
    „Kein medizinischer Test …“. **„CSV exportieren“** → in Dateien sichern → in Numbers öffnen.
11. Zurück („Neuer Test“) → **„Haltung frontal“** → „Geräteneigung anzeigen“ erlauben → Handy
    gerade ausrichten → „Los“ → 3 s ruhig stehen → Schultern/Becken in Grad.
12. **Video-Modus:** Auf dem Start „Video laden“ → Video aus der Mediathek. Es läuft mit Skelett
    durch denselben Ablauf. Buttons: „Von vorn“, „Pause/Weiter“, „Langsam“, „Gespiegelt“.

### 4. Die drei unsichersten Schwellenwerte – und wie du sie einstellst

Alle stehen in `src/config.ts` unter `singleLeg`. Nach dem Speichern lädt der Dev-Server neu.

1. **Hände an/weg von der Hüfte** – `handsOnHipMax` (0,35), `handsOffHipMin` (0,5),
   `elbowBentMaxDeg` (140°), `elbowStraightMinDeg` (155°).
   Der MediaPipe-Hüftpunkt sitzt am Gelenk, nicht am Beckenkamm; bei hängenden Armen ist das
   Handgelenk auch nah dran. Darum zusätzlich der Ellbogenwinkel.
   *Einstellen:* Video aufnehmen: 5 s Hände an der Hüfte, dann eine Hand locker wegnehmen, dann
   Arme hängen lassen. „Video laden“ → „Langsam“ → Debug: „Hand L→Hüfte“, „Hand R→Hüfte“ und
   „Ellbogen L / R“ ablesen. Die Schwellen zwischen „an der Hüfte“ und „weg“ legen.
2. **Fuß abgesetzt** – `footDownMax` (0,04 Beinlängen) und `footRaisedMin` (0,10).
   Wer das Bein nur wenig anhebt, liegt nah an der Grenze; Fußpunkte wackeln frontal stark.
   *Einstellen:* Video: Bein normal angehoben, dann Zehen kurz auf den Boden tippen, dann Fuß
   ganz absetzen. Debug: „Fuß gehoben (×Bein)“. `footDownMax` knapp über den Wert beim Antippen,
   `footRaisedMin` deutlich darunter, was du im normalen Stand siehst.
3. **Hüfte über 30°** – `hipAngleMaxDeg` (30°, aus BESS) – unsicher ist hier weniger die Zahl als
   die **Messung**: Die Beugung nach vorn hängt an der Tiefenschätzung (z), die von vorn ungenau
   ist, und die BESS-Haltung hat selbst schon 20–30° Beugung.
   *Einstellen:* Video: Bein normal halten, dann Knie deutlich nach vorn/oben ziehen, dann Bein
   seitlich abspreizen. Debug: „Hüfte Beugung“ und „Hüfte Abspreizung“. Wenn die Beugung im
   normalen Stand schon um 30° schwankt, wird zu oft gezählt → testweise Kamera leicht seitlich
   stellen oder die Schwelle für die Beugung getrennt anheben (eigene Zeile in `config.ts` ergänzen).

Ebenfalls einen Blick wert: `errorMinDurationMs` (250 ms Entprellung). Im Debug zeigt „prüft …“,
dass eine Bedingung gerade erfüllt ist, aber noch nicht lange genug.

Tipp für reproduzierbare Tests: Videos mit der **Rückkamera** aufnehmen (nicht gespiegelt). Bei
Frontkamera-Videos ggf. „Gespiegelt“ einschalten, wenn links/rechts vertauscht wirkt
(Gegenprobe: Standbein links wählen und das linke Bein heben – dann darf der Timer nicht starten).

---

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

## M3 – Fehlerzählung nach BESS-Kriterien ✅

**Gebaut**
- `src/analysis/bess.ts`: Fehlerbedingungen pro Frame + Zähler mit Entprellung, „gleichzeitig
  zählt einmal“, Zusatzfehler bei > 5 s aus der Position, Deckel bei 10, „unter 5 s gehalten = 10“.
- Erkannt werden: Hände von der Hüfte, Fuß abgesetzt/Schritt, Hüfte > 30° gebeugt oder
  abgespreizt, > 5 s aus der Position. Ferse/Vorfuß **experimentell, getrennt** ausgewiesen.
  „Augen geöffnet“ = nicht gemessen.
- Live: Timer groß, darunter „Fehler n“; aktiver Fehler oben in Rot; betroffene Gelenke rot im Skelett.
- Debug-Leiste: Hüftbeugung/-abspreizung in Grad, Ferse–Zehe-Änderung, für jeden Fehlertyp
  „–“ / „prüft …“ (Entprellung läuft) / „FEHLER“ / „nicht messbar“, laufender Fehler seit x s.
- Ergebnis nach dem Versuch: große Fehlerzahl, Aufschlüsselung je Typ, Hinweise (unsicher,
  Deckel, nicht gehalten).
- Dev-Server: `https://localhost:5173/?synthetic` → „Kamera starten“ spielt eine künstliche
  Person ab (Fuß ab bei ~12 s, Hand weg bei ~18 s). Nur zum Ausprobieren des Ablaufs.

**Getestet**
- 85 Unit-Tests gesamt. Neu: je Fehlertyp „Fehler“ und „kein Fehler“ aus synthetischen
  Körperpunkten, „nicht messbar“-Fälle, Entprellung (150 ms zählt nicht, 400 ms zählt),
  gleichzeitig = 1, überlappend = 1, getrennt = 2, kurze Lücke = 1, > 5 s = +1, 4 s = kein
  Zusatz, Deckel 10, „unter 5 s gehalten“ = 10, nicht messbare Zeit, experimentell getrennt
  bzw. per Config eingerechnet, Ende-zu-Ende mit synthetischen Frames.
- Headless-Browser mit synthetischer Person: Ablauf bis „Fertig“ → 2 Fehler (Hand, Fuß). ✔

**Offen**
- Schwellen mit echten Videos einstellen (siehe oben in der Zusammenfassung).

**Testanleitung**
1. Einbeinstand starten wie in M2. Während der 20 s:
2. Setz kurz den Fuß ab (ca. 1 s). Oben erscheint rot „Fuß abgesetzt / Schritt“, das Bein wird im
   Skelett rot, unter dem Timer steht „Fehler 1“.
3. Nimm eine Hand von der Hüfte → „Hände von der Hüfte“, „Fehler 2“.
4. Nimm Hand weg **und** setz den Fuß gleichzeitig ab → zählt nur einmal.
5. Bleib 6 s mit abgesetztem Fuß stehen → zählt zwei (Fehler + „länger als 5 s“).
6. Am Ende siehst du die Zahl groß und darunter je Fehlertyp.
7. Zum Einstellen: Debug öffnen. Dort siehst du live die Winkel und welche Bedingung gerade
   „prüft …“ oder „FEHLER“ ist.

## M4 – Mehrere Versuche und Ergebnis ✅

**Gebaut**
- 3 Versuche pro Seite (`config.singleLeg.trialsPerSide`), dazwischen Pause mit Kurzergebnis,
  „Weiter“ und „Wiederholen“.
- Ergebnis-Screen: Mittelwert je Seite groß (ganze Zahl), Fehler je Versuch, Unterschied
  links/rechts (ohne Bewertung), Hinweis „Kein medizinischer Test …“, aufklappbare Tabelle mit
  Fehlern je Typ.
- Export als CSV und JSON per Download – nur lokal. Felder: Datum, Standbein, Versuch, Fehlerzahl,
  Fehler je Typ, Dauer, Modell, fps-Durchschnitt (+ Zeit in Position, nicht auswertbar).
- Nichts wird gespeichert; kein localStorage.

**Getestet**
- 93 Unit-Tests gesamt. Neu: Runden, Mittelwert je Seite, fehlende Seite, Unterschied, CSV
  (Kopf, Zeilen, Semikolon, BOM, leere fps), JSON (Zusammenfassung, Konfiguration), Dateiname.
- Headless-Browser, synthetische Person, kompletter Durchlauf 2 × links + 2 × rechts →
  Ergebnis-Screen → CSV- und JSON-Download geprüft, localStorage leer. ✔

**Testanleitung**
1. Einbeinstand mit Standbein „Links“ starten, Versuch machen.
2. Nach 20 s: „Kurze Pause“, Fehlerzahl groß, darunter je Typ. Tippe „Weiter“ → Anleitung
   „Versuch 2 von 3“ → „Los“.
3. Nach Versuch 3: „Weiter: Standbein Rechts“. Drei Versuche rechts.
4. „Ergebnis ansehen“: zwei Karten Links/Rechts mit Mittelwert und den drei Versuchen,
   darunter der Unterschied.
5. „CSV exportieren“: iOS fragt, wo die Datei hin soll (Dateien-App). In Numbers öffnen –
   eine Zeile pro Versuch.
6. „Neuer Test“ fragt nach, dann ist alles weg.

## M5 – Haltung frontal, erster Wurf ✅

**Gebaut**
- Neuer Test „Haltung frontal“ auf dem Startscreen.
- Ablauf: Anleitung mit deutlichem Hinweis zur Handyneigung → „Los“ → Positionscheck →
  3 s Countdown → 3 s Messung → Ergebnis: Schultern und Becken in ganzen Grad zur Waagerechten,
  mit „links höher“/„rechts höher“/„waagerecht“. Keine Bewertung.
- Optional „Geräteneigung anzeigen“ (iOS-Erlaubnis per Tipp): zeigt live, wie schief das Handy steht,
  und im Ergebnis die mittlere Neigung während der Messung.

**Getestet**
- 109 Unit-Tests gesamt. Neu: Linienneigung (waagerecht, links/rechts höher, Becken unabhängig,
  Spiegelung egal, schlecht sichtbar), Mittelung in ganzen Grad, „nicht gemessen“ bei zu wenigen
  Frames, keine −0, Texte; Geräteneigung (Hochformat, flach, Querformat, Drehrichtungs-Konvention).
- Headless-Browser mit synthetischer Person: Ablauf bis Ergebnis „0° · waagerecht“. ✔

**Offen**
- Geräteneigung auf echtem iPhone prüfen (Vorzeichen/Querformat).
- Kein Export für diesen Test.

**Testanleitung**
1. Start → „Haltung frontal“ → „Kamera starten“.
2. Tippe „Geräteneigung anzeigen“ und erlaube den Zugriff. Unter dem Warnhinweis steht z. B.
   „Gerät seitlich geneigt: 3° … – bitte gerade stellen“. Richte das iPhone aus, bis 0–2° dasteht.
3. „Los“, ruhig stehen. Countdown 3 – 2 – 1, dann 3 s Messung.
4. Ergebnis: zwei große Gradzahlen (Schultern, Becken) mit „links höher“ o. ä.
5. Gegenprobe: Kipp das iPhone absichtlich um ~5° und miss noch einmal – die Werte verschieben
   sich um etwa diesen Betrag. Genau das sagt der Warnhinweis.

## M6 – Körpergröße mit Referenzplatte (Prototyp) ✅

**Gebaut**
- Neuer Test „Körpergröße“: Plattenmaße eingeben (werden gemerkt) → optional „Neigung messen“ →
  vier Ecken antippen (mit Lupe: grob tippen, Bild zoomt 4×, genau tippen) → „Los“ → auf die Platte
  stellen → 3 s Countdown → 2 s Messung → Ergebnis „176 cm ± 3 cm (geschätzt)“.
- Overlay: Plattenumriss, gestrichelte Linie vom Fußpunkt zum Scheitel (grün = auf der Platte).
- Debug: Maßstab am Fuß (px/cm), Fußposition auf der Platte, Scheitel-Methode, Größe pro Bild,
  Neigung, angenommene Brennweite.

**Getestet**
- 127 Unit-Tests gesamt. Neu: synthetische Lochkamera vor der Platte. Ideale Punkte: 176 cm auf
  ±0,5 cm bei waagerechter, geneigter, tiefer Kamera; 120/160/200 cm; falscher Bildwinkel ±15 %
  egal bei waagerechter Kamera; Waage 5° schräg < 1 %; ±2 px Eckfehler < 5 cm und innerhalb der
  angezeigten Spanne; unbekannte Neigung → Fehler innerhalb der Spanne; Vorzeichen der Drehung;
  Maske, Fallback, „nicht auf der Platte“, unplausible Werte.
- Headless-Browser mit synthetischer Person: Maße eingeben, Ecken mit Lupe antippen, messen,
  Ergebnis. ✔

**Ehrliche Einschätzung**
- Rechnerisch (mit Sensor, Umriss, Lupe) etwa **±3–4 cm**. Ohne Neigungssensor eher ±8–12 cm.
- Wie gut es wirklich ist, zeigt erst ein Vergleich mit dem Stadiometer (10–20 Personen).

**Offen**
- Vorzeichen der Neigung am iPhone prüfen (Test unten, Schritt 6).
- Automatische Erkennung der Plattenecken (genauer als Antippen).

**Testanleitung**
1. Start → „Körpergröße“ → Kamera **Hinten** → „Kamera starten“.
2. iPhone aufs Stativ, ca. 2–3 m vor der Waage, Hüfthöhe. Waage gerade zur Kamera.
3. Breite (quer zur Kamera) und Tiefe der Glasplatte in cm eingeben.
4. „Neigung messen“ → erlauben. Darunter steht z. B. „Handy seitlich 1° · nach vorn/hinten 2°“.
   Handy ausrichten, bis die Zeile grün ist.
5. „Weiter: Ecken antippen“ → in die Nähe einer Ecke tippen → Bild wird groß → genau auf die Ecke
   tippen. Viermal. Rot umrandet siehst du die Platte → „Fertig“.
6. „Los“, auf die Platte stellen, gerade stehen. Countdown, 2 s Messung, dann z. B.
   „176 cm ± 3 cm (geschätzt)“. **Gegenprobe Neigung:** Handy absichtlich 5° nach unten neigen,
   neu einmessen und messen. Bleibt der Wert ähnlich → Vorzeichen stimmt. Springt er um ~10 cm →
   Vorzeichen falsch, bitte melden.
7. Vergleich mit dem Stadiometer notieren (Debug-Werte helfen beim Einstellen).

## M7 – Haltung vorne, seitlich, hinten ✅

**Gebaut**
- Test „Haltung“ (ersetzt „Haltung frontal“): drei Ansichten nacheinander, je 3 s, überspringbar.
- Vorne/hinten: Schulterlinie, Beckenlinie, Kopf (Ohrlinie), Rumpfachse. Seitlich: Ohr zur Schulter,
  Schulter zur Hüfte, Hüfte zum Knöchel, Knie zur Linie Hüfte–Knöchel.
- Übersicht: alle Abweichungen ab 1°, größte zuerst, Gradzahl groß, Richtung klein darunter.
- Positionscheck kennt die Ansicht („Dreh dich seitlich zur Kamera“, „Dreh der Kamera den Rücken zu“).
- Rückansicht: vertauschte Seiten von MediaPipe werden automatisch korrigiert.

**Getestet**
- 147 Unit-Tests gesamt. Neu: Positionscheck je Ansicht, Seitansicht (Blick nach links/rechts,
  linke/rechte Seite zur Kamera, Kopf/Rumpf/Bein-Winkel, Knie davor/dahinter), Rückansicht inkl.
  automatischer Seitenkorrektur, Rumpfneigung vorne/hinten, Übersicht, Texte ohne Bewertungswörter.
- Headless-Browser mit synthetischer Person durch alle drei Ansichten: gemessene Werte = Vorgaben. ✔

**Testanleitung**
1. Start → „Haltung“ → „Kamera starten“. Optional „Geräteneigung anzeigen“, Handy gerade stellen.
2. **Vorne:** „Los“, ruhig stehen → Werte für Schulter, Becken, Kopf, Rumpf.
3. „Weiter: Seitlich“ → 90° drehen → „Los“. Gegenprobe: Kopf bewusst vorschieben → „Ohr zur
   Schulter“ wird größer, „nach vorn“.
4. „Weiter: Hinten“ → Rücken zur Kamera → „Los“. Gegenprobe: linke Schulter hochziehen → vorne
   und hinten sollte beide Male „links höher“ stehen.
5. „Zur Übersicht“: Liste der Abweichungen, größte zuerst.

### Nachtrag M7 (nach Test im Studio)
- Rückansicht aus dem Ablauf genommen (kein Mehrwert, schlecht erkannt). Standard: vorne + seitlich.
- Optional „andere Seite messen“ → Seitenvergleich links/rechts in der Übersicht.
- Nach jeder Messung: gemessene Linien grün, Lot/Waagerechte gestrichelt im Bild.
- „Trotzdem messen“, wenn der Positionscheck länger als 8 s hängt.
