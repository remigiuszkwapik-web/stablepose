/**
 * Zentrale Konfiguration: ALLE Schwellenwerte stehen hier.
 *
 * Kennzeichnung der Herkunft:
 *  [BESS]      = aus der Beschreibung des Balance Error Scoring System (Riemann & Guskiewicz)
 *  [MediaPipe] = aus der offiziellen MediaPipe-Doku bzw. deren Standardwerten
 *  [geschätzt] = von mir geschätzt, noch nicht mit echten Messungen geprüft → bitte mit dem
 *                Video-Modus und der Debug-Leiste einstellen
 *  [Produkt]   = Produktentscheidung aus dem Briefing
 *
 * Längen sind (wo nicht anders angegeben) relativ zu einer Körpergröße normiert, damit sie
 * unabhängig vom Abstand zur Kamera funktionieren:
 *  - "Rumpflänge" = Abstand Schultermitte → Hüftmitte im Bild
 *  - "Beinlänge"  = Abstand Hüfte → Knöchel des Standbeins im Bild
 */
export const config = {
  pose: {
    /** [MediaPipe] Standardwerte 0,5. */
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    /** [geschätzt] Ab dieser visibility zählt ein Punkt als „gut sichtbar“. */
    goodVisibility: 0.65,
    /** [geschätzt] Unter dieser visibility wird ein Punkt im Overlay blass gezeichnet. */
    faintVisibility: 0.5,
    /**
     * [geschätzt] Glättung der Punkte (exponentieller gleitender Mittelwert).
     * 1 = keine Glättung, kleiner = ruhiger, aber träger. 0,6 bei ~30 fps ≈ 50 ms Verzögerung.
     */
    smoothingAlpha: 0.6,
    /** [Produkt] Standardmodell. */
    defaultModel: 'full' as 'lite' | 'full',
  },

  position: {
    /** [geschätzt] Punkte, die für den Positionscheck sichtbar sein müssen (siehe position.ts). */
    minVisibility: 0.6,
    /** [geschätzt] Abstand zum Bildrand (Anteil der Bildhöhe/-breite), den Kopf und Füße mindestens haben müssen. */
    edgeMargin: 0.02,
    /** [geschätzt] Person muss mindestens so viel der Bildhöhe einnehmen (Kopf bis Fuß). Sonst „näher ran“. */
    minBodyHeight: 0.45,
    /** [geschätzt] Körpermitte darf höchstens so weit (Anteil Bildbreite) von der Bildmitte entfernt sein. */
    maxCenterOffset: 0.3,
    /**
     * [geschätzt] Frontal-Prüfung: Schulterbreite / Rumpflänge muss mindestens so groß sein.
     * Frontal stehend typisch ~0,6–0,8; seitlich gedreht fällt der Wert stark ab.
     */
    minShoulderToTorsoRatio: 0.45,
    /** [geschätzt] Hüftbreite / Rumpflänge mindestens (zweite Frontal-Prüfung). */
    minHipToTorsoRatio: 0.25,
    /** [geschätzt] So lange (ms) muss der Positionscheck ohne Unterbrechung passen, bevor es weitergeht. */
    stableMs: 1000,
  },

  singleLeg: {
    /** [BESS] Messdauer pro Versuch in Sekunden. BESS: 20 s. Auf 30 umstellbar. */
    durationS: 20,
    /** [Produkt] Countdown vor dem Versuch in Sekunden. */
    countdownS: 5,
    /** [Produkt] Versuche pro Seite. */
    trialsPerSide: 3,
    /**
     * [geschätzt] Startposition: Spielbein gilt als „angehoben“, wenn der tiefste Punkt des
     * Spielfußes mindestens so viel (× Beinlänge) höher ist als der Standfuß.
     */
    footRaisedMin: 0.1,
    /**
     * [geschätzt] Fehler „Fuß abgesetzt“: Spielfuß ist weniger als so viel (× Beinlänge) über dem Standfuß.
     * Liegt bewusst unter footRaisedMin (Hysterese), damit Wackeln nicht sofort als Fehler zählt.
     */
    footDownMax: 0.04,
    /**
     * [geschätzt] Hände an der Hüfte: Abstand Handgelenk → Beckenkamm-Punkt höchstens so viel
     * (× Rumpflänge) UND Ellbogen gebeugt (elbowBentMaxDeg).
     * Der Beckenkamm-Punkt wird aus dem MediaPipe-Hüftpunkt geschätzt (der liegt am Hüftgelenk):
     * crestUp × Rumpflänge nach oben und crestOut × Rumpflänge nach außen verschoben.
     */
    handsOnHipMax: 0.35,
    crestUp: 0.2,
    crestOut: 0.1,
    /** [geschätzt] Ellbogenwinkel (Schulter–Ellbogen–Handgelenk) höchstens so viel Grad = Arm gebeugt. */
    elbowBentMaxDeg: 150,
    /**
     * [geschätzt] Fehler „Hände weg“: Abstand größer als so viel (× Rumpflänge) ODER Arm fast gestreckt
     * (Ellbogen über elbowStraightMinDeg). Hysterese zu den Werten oben, damit Wackeln nicht zählt.
     */
    handsOffHipMin: 0.5,
    elbowStraightMinDeg: 165,
    /**
     * [geschätzt] Mindest-Sichtbarkeit für Handgelenk und Ellbogen. Bewusst niedriger als sonst:
     * Liegt die Hand an der Hüfte, ist sie teils verdeckt und MediaPipe meldet niedrige visibility,
     * die Position stimmt aber meist trotzdem.
     */
    armMinVisibility: 0.3,
    /** [BESS] Fehler „Hüfte über 30° gebeugt oder abgespreizt“. */
    hipAngleMaxDeg: 30,
    /**
     * [geschätzt, experimentell] Fehler „Ferse oder Vorfuß des Standbeins angehoben“:
     * Änderung des Höhenunterschieds Ferse ↔ Zehenpunkt (× Beinlänge) gegenüber dem Start.
     */
    standFootLiftMax: 0.035,
    /** [Produkt] Experimentelle Fehler (Ferse/Vorfuß) zählen NICHT zur Gesamtzahl, werden nur getrennt ausgewiesen. */
    countExperimentalInTotal: false,
    /** [BESS] Länger als so viele Sekunden außerhalb der Testposition = zusätzlicher Fehler. */
    outOfPositionS: 5,
    /** [geschätzt] Entprellung: eine Fehlerbedingung muss so lange (ms) ununterbrochen bestehen, bevor sie zählt. */
    errorMinDurationMs: 250,
    /** [geschätzt] Ein Fehler gilt als beendet, wenn so lange (ms) keine Fehlerbedingung mehr besteht. */
    errorReleaseMs: 400,
    /** [BESS] Höchstens so viele Fehler pro Versuch. */
    maxErrors: 10,
    /**
     * [BESS] Kann die Person die Testposition insgesamt nicht mindestens so viele Sekunden halten,
     * wird der Versuch mit der Höchstzahl (maxErrors) bewertet.
     */
    minInPositionS: 5,
    /** [geschätzt] So lange (ms) müssen Startposition (Bein oben, Hände an Hüfte) bestehen, bevor der Timer startet. */
    startPoseHoldMs: 500,
  },

  height: {
    /** [Produkt] Messdauer in Sekunden; Ergebnis = Median über alle Frames. */
    durationS: 2,
    /** [Produkt] Countdown vor der Messung. */
    countdownS: 3,
    /**
     * [geschätzt] Höhe der Fußpunkte (Ferse, Zehenpunkt) über der Plattenoberfläche in cm.
     * Damit wird bestimmt, wo auf der Platte die Person steht (Körperachse).
     */
    footPointHeightCm: 2.5,
    /** [geschätzt] Angenommene Ungenauigkeit beim Antippen einer Plattenecke in Pixeln (Quellbild). */
    tapErrorPx: 3,
    /** [geschätzt] Unsicherheit des Scheitels aus dem Körperumriss (Haare, Kantenunschärfe) in cm. */
    headMaskErrorCm: 1.5,
    /** [geschätzt] Unsicherheit des Scheitels, wenn er nur aus Gesichtspunkten geschätzt wird. */
    headLandmarkErrorCm: 5,
    /** [geschätzt] Unsicherheit der Körperachse (wo genau auf der Platte die Person steht) in cm. */
    feetAxisErrorCm: 1.5,
    /** [MediaPipe] Ab diesem Wert gehört ein Pixel der Segmentierungsmaske zur Person. */
    maskThreshold: 0.5,
    /**
     * [geschätzt] Bildwinkel der Kamera über die lange Bildseite (16:9-Video). Wird nur für die
     * Neigungskorrektur gebraucht; bei waagerechter Kamera kürzt er sich heraus.
     * Hinten ≈ iPhone-Hauptkamera, vorn ≈ Frontkamera.
     */
    fovBackDeg: 63,
    fovFrontDeg: 70,
    /** [geschätzt] Unsicherheit des Bildwinkels (relativ), geht in die Spanne ein. */
    fovUncertainty: 0.1,
    /** [geschätzt] Unsicherheit der Neigung in Grad: mit Lagesensor bzw. ohne (dann Annahme „waagerecht“). */
    tiltErrorWithSensorDeg: 1.5,
    tiltErrorWithoutSensorDeg: 6,
    /** [geschätzt] Ergebnisse außerhalb dieses Bereichs werden als „nicht gemessen“ verworfen. */
    minCm: 80,
    maxCm: 230,
  },

  posture: {
    /** [Produkt] Messdauer „Haltung frontal“ in Sekunden. */
    durationS: 3,
    /** [Produkt] Countdown vor der Messung in Sekunden. */
    countdownS: 3,
    /** [geschätzt] Gerät gilt als „gerade“, wenn die Neigung höchstens so viele Grad beträgt (nur Hinweis). */
    deviceTiltHintDeg: 2,
  },
};

export type Config = typeof config;
