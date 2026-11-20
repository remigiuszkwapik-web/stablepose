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

## M3 – Fehlerzählung nach BESS

- **Abgleich mit öffentlicher Beschreibung:** Geprüft gegen das BESS-Protokoll (Guskiewicz,
  UNC-Manual, Zusammenfassung der APTA). Die sechs Fehler stimmen mit der Tabelle im Briefing
  überein: Hände von den Beckenkämmen, Augen öffnen, Schritt/Stolpern/Fallen, Hüfte > 30° Beugung
  oder Abspreizung, Vorfuß oder Ferse anheben, > 5 s aus der Testposition. Regeln: Fehler zählen
  erst ab korrekter Testposition; gleichzeitige Fehler zählen einmal; max. 10 pro Versuch; wer die
  Position nicht mindestens 5 s halten kann, bekommt 10. Quellen:
  APTA (apta.org, „Balance Error Scoring System (BESS)“), UNC/BESS-Manual (sralab.org, „bess_manual_.pdf“).
- **Abweichungen vom Original-BESS:**
  1. *Augen offen* statt geschlossen (Briefing). Fehler „Augen geöffnet“ entfällt → „nicht gemessen“.
  2. *Ferse/Vorfuß anheben* ist im BESS v. a. für den Tandemstand beschrieben. Wir messen es beim
     Standfuß nur **experimentell** (Höhenunterschied Ferse ↔ Zehenpunkt gegenüber den ersten 500 ms
     der Messung) und zählen es **getrennt**, nicht in der Summe (umstellbar per
     `countExperimentalInTotal`). Grund: Fersen-/Zehenpunkte sind frontal sehr ungenau.
  3. *Mehrere Fehler nacheinander ohne Pause:* Wenn ein Fehler noch läuft und ein zweiter beginnt
     (Hand weg, dann Fuß ab), zählt das als **ein** Fehler – die Person war durchgehend aus der
     Position. Ein menschlicher Prüfer würde hier evtl. zwei zählen. Konservativ, aber reproduzierbar.
  4. *> 5 s aus der Position:* zählt **einmal pro Fehler-Episode** einen Zusatzfehler, nicht pro
     weiteren 5 s.
  5. *Hüftwinkel:* gemessen am **Spielbein** (Oberschenkel gegen Rumpfachse), getrennt nach Beugung
     (nach vorn) und Abspreizung (nach außen). Achtung: Die BESS-Testhaltung hat selbst schon
     ca. 20–30° Hüftbeugung – der Abstand zur 30°-Schwelle ist klein. Die Beugung hängt an der
     Tiefe (z), die MediaPipe von vorn nur ungenau schätzt. Die Abspreizung ist frontal verlässlicher.
  6. *Schritt/Stolpern* wird als „Spielfuß auf Höhe des Standfußes“ erkannt (Fußhöhe < 0,04 Beinlängen).
     Ein Hüpfen auf dem Standbein wird nicht erkannt.
- **Entprellung:** Eine Bedingung zählt erst nach 250 ms am Stück. Ein Fehler endet erst, wenn
  400 ms lang keine Bedingung mehr besteht (auch nicht „roh“ während der Entprellung). So zählen
  Wackler oder einzelne falsche Frames nicht doppelt.
- **Ehrlich bei Aussetzern:** Kann die Kamera die Person in einem Frame nicht auswerten (Punkte
  nicht sichtbar), zählt das **nicht als Fehler**, sondern als „nicht auswertbar“. Liegt der Anteil
  über 20 %, zeigt das Ergebnis einen Hinweis „Ergebnis unsicher“.
- **Live-Anzeige:** Während der Messung steht der aktive Fehler oben in Rot, die betroffenen Gelenke
  leuchten im Skelett rot, und unter dem Timer steht „Fehler n“.
- **Synthetische Testperson** (`src/dev/syntheticPose.ts`): Wird für Unit-Tests genutzt und im
  Dev-Server mit `?synthetic` statt der Kamera. Damit lässt sich der ganze Ablauf ohne Person
  durchklicken. Im Produktions-Build ist sie nicht enthalten.

## M4 – Mehrere Versuche und Ergebnis

- **Reihenfolge:** Erst alle Versuche (Standard 3) auf dem zuerst gewählten Bein, dann die andere
  Seite. Nach jedem Versuch eine Pause mit Kurzergebnis und „Weiter“. „Wiederholen“ verwirft den
  letzten Versuch (z. B. wenn jemand durchs Bild läuft). „Nur diese Seite – zum Ergebnis“ ist möglich.
- **„Beenden“ mitten im Test:** Sind schon Versuche fertig, erscheint trotzdem der Ergebnis-Screen,
  damit nichts verloren geht.
- **Kamera aus beim Ergebnis:** Der Ergebnis-Screen ist ein normaler Screen (hell/dunkel nach
  System). Die Kamera wird dafür gestoppt.
- **Mittelwert je Seite** = arithmetisches Mittel der Fehler, kaufmännisch auf ganze Zahl gerundet.
  „Unterschied links/rechts“ = Betrag der Differenz der gerundeten Mittelwerte, ohne Bewertung.
- **CSV:** Semikolon als Trenner und UTF-8-BOM, damit deutsches Excel/Numbers die Datei mit
  Umlauten direkt richtig öffnet. Eine Zeile pro Versuch. Zusätzliche Spalten über das Briefing
  hinaus: Zeit in Position, Anteil nicht auswertbar, „Position unter 5 s gehalten“.
- **JSON:** enthält zusätzlich die verwendeten Schwellenwerte (`config`), damit spätere Exporte mit
  geänderten Schwellen vergleichbar bleiben.
- **Datum** in der CSV als lokale Zeit „JJJJ-MM-TT HH:MM“, im JSON als ISO-8601 (UTC).
- **Kein Speichern:** Messdaten nur im Arbeitsspeicher. Kein localStorage (im Browser-Test geprüft:
  `localStorage.length` = 0). Neu laden oder „Neuer Test“ verwirft alles (mit Rückfrage).
- **Dev-Schalter** `?synthetic&fast` (nur Dev-Server): 6 s Messung, 2 s Countdown, 2 Versuche pro
  Seite, künstliche Person – für schnelle Durchläufe im Browser.

## M5 – Haltung frontal (erster Wurf)

- **Messgröße:** Neigung der Linie linke ↔ rechte Schulter bzw. linke ↔ rechte Hüfte zur
  Bild-Waagerechten, in ganzen Grad, Mittelwert über 3 s. Vorzeichen intern: positiv = linke Seite
  höher; angezeigt wird der Betrag plus „links höher“ / „rechts höher“ / „waagerecht“. Keine Bewertung,
  keine Diagnose-Wörter.
- **Ablauf** nutzt denselben Zustandsautomaten wie der Einbeinstand (Positionscheck → 3 s Countdown
  → 3 s Messung), ohne Startposition.
- **Nur gültige Frames:** Frames, in denen der Positionscheck nicht passt, zählen als „nicht
  messbar“. Ist weniger als die Hälfte der Frames messbar, steht „nicht gemessen“ statt eines Werts.
- **Hüftpunkte ≠ Beckenkamm:** MediaPipe liefert Hüftgelenk-Schätzungen, keine Beckenkämme.
  Die „Becken“-Linie ist also eine Näherung.
- **Geräteneigung:** Optional per Tipp auf „Geräteneigung anzeigen“ (iOS fragt nach Erlaubnis).
  Aus β/γ und der Bildschirmdrehung wird die Drehung in der Bildschirmebene (roll) und das Kippen
  nach vorn/hinten (pitch) berechnet. Der Wert wird **angezeigt, aber nicht herausgerechnet** –
  eine automatische Korrektur würde Genauigkeit vortäuschen, solange sie nicht am Gerät geprüft ist.
  Roll wird auf ±90° normiert (für eine Linie zählt der Winkel modulo 180°); das macht die Anzeige
  unempfindlich gegen die unterschiedliche Drehrichtungs-Konvention von `screen.orientation.angle`
  im Querformat. Auf einem echten iPhone **noch nicht geprüft**.
- **Kein Export** für „Haltung frontal“ (nicht im Briefing verlangt).

## M6 – Körpergröße mit Referenzplatte

- **Verfahren:** Maßstab aus der Plattenbreite genau an der Stelle, wo die Person steht
  (Homographie aus den vier Ecken), Körpergröße = Pixelabstand Fußpunkt → Scheitel / Maßstab.
  Bei waagerechter Kamera ist das exakt und unabhängig von Brennweite und Kamerahöhe.
- **Verworfen: komplette Kameralage aus der Platte.** Mathematisch elegant (Brennweite + Lage aus
  einem Rechteck), aber im Test unbrauchbar: Die Platte ist im Bild nur ca. 160 × 40 px groß; schon
  ±2 px Tippfehler verschieben die Höhe um 10–40 cm.
- **Neigung ist wichtiger als gedacht:** ca. 1 cm Fehler pro Grad Neigung nach vorn/hinten (sie
  verändert die Entfernungsschätzung). Deshalb: Lagesensor (DeviceOrientation) dringend empfohlen.
  Mit Sensor wird die Neigung herausgerechnet; ohne wird „waagerecht“ angenommen und die Spanne
  entsprechend größer angezeigt. Das Vorzeichen (Rück- vs. Frontkamera) ist **nicht am Gerät geprüft**
  – darum zusätzlich der Hinweis, das Handy möglichst gerade zu stellen (dann ist es egal).
- **Seitliche Drehung (roll)** wird nur angezeigt, nicht herausgerechnet (Vorzeichen am Gerät
  ungeprüft; bei ≤ 2° unter 1 cm Wirkung). Die Funktion kann es, Test prüft das Vorzeichen.
- **Bildwinkel** wird angenommen (hinten 63°, vorn 70°). Wirkt nur über die Neigungskorrektur;
  bei waagerechter Kamera gar nicht (Test: ±15 % Bildwinkel → < 0,5 cm).
- **Scheitel:** aus der Segmentierungsmaske von MediaPipe (oberster Punkt des Körperumrisses über
  dem Kopf), nur während der Messung eingeschaltet (kostet Rechenzeit). Fallback: Schätzung aus
  Gesichtspunkten (±5 cm). Haare zählen beim Umriss mit – ein Grund, warum es kein Stadiometer ersetzt.
- **Körperachse:** Mitte aus Fersen und Zehenpunkten, um 2,5 cm (geschätzte Höhe dieser Punkte über
  dem Boden) auf die Plattenoberfläche heruntergerechnet. Ohne diese Korrektur läge der Fußpunkt
  scheinbar ~6 cm weiter hinten → ca. 4 cm Fehler.
- **Ecken antippen mit Lupe:** Ein Finger trifft auf ±5 Bildschirmpixel, das wären im Kamerabild
  ±10–15 px. Darum: erster Tipp vergrößert 4×, zweiter Tipp setzt die Ecke. Automatische
  Kantenerkennung der weißen Platte wäre der nächste Schritt (genauer, ±1 px).
- **Spanne („± x cm, geschätzt“):** quadratische Summe aus Ecken-Ungenauigkeit (jede Ecke ±3 px,
  durchgerechnet), Neigungsunsicherheit (±1,5° mit Sensor, ±6° ohne), Bildwinkel ±10 %, Scheitel
  (Umriss 1,5 cm / Gesicht 5 cm), Körperachse 1,5 cm. Alle Werte in `config.ts` → `height`.
- **Ergebnis** = Median über 2 s, nur Bilder mit Person ganz im Bild und auf der Platte; ganze cm.
- **Plattenmaße** werden im localStorage gemerkt (nur die zwei Maße, keine Messdaten) – damit man
  sie nicht jedes Mal neu eingeben muss.
- **Nicht gespeichert / nicht exportiert:** das Messergebnis selbst.

## Nachbesserung: Hände an der Hüfte (nach erstem iPhone-Test)

Rückmeldung: „Hand an der Hüfte“ wurde schlecht erkannt. Zwei Ursachen im Code:
1. **Sichtbarkeit:** Für Handgelenk/Ellbogen galt dieselbe Mindest-visibility (0,6) wie für den
   Rumpf. Liegt die Hand an der Hüfte, ist sie teils verdeckt; MediaPipe meldet dann oft < 0,6,
   obwohl die Position stimmt. Folge: Handgelenk verworfen → Startposition nie erfüllt.
   **Neu:** eigene Schwelle `armMinVisibility` = 0,3.
2. **Bezugspunkt:** Gemessen wurde zum MediaPipe-Hüftpunkt (Hüftgelenk). Die Hände liegen aber am
   Beckenkamm, höher und weiter außen. **Neu:** Bezugspunkt = Hüftpunkt + 0,2 Rumpflängen nach oben
   + 0,1 nach außen (`crestUp`, `crestOut`). Hängende Arme liegen dadurch noch klarer daneben (> 0,5).
3. Ellbogen-Schwellen großzügiger: gebeugt ≤ 150° (vorher 140°), „gestreckt = Hand weg“ > 165° (vorher 155°),
   weil der Winkel im 2D-Bild je nach Ellbogenrichtung gestreckter wirkt.
Debug zeigt jetzt zusätzlich die Sichtbarkeit beider Handgelenke; Werte über der Schwelle sind rot.
