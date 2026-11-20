/** Indizes der 33 BlazePose-Punkte (MediaPipe Pose Landmarker). links/rechts = aus Sicht der Person. */
export const L = {
  nose: 0,
  leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3,
  rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8,
  mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18,
  leftIndex: 19, rightIndex: 20,
  leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** Punkte einer Körperseite, damit die Logik mit „Standbein“/„Spielbein“ arbeiten kann. */
export interface SideIdx {
  shoulder: number; elbow: number; wrist: number; hip: number;
  knee: number; ankle: number; heel: number; footIndex: number;
}

export const SIDE: Record<'left' | 'right', SideIdx> = {
  left: {
    shoulder: L.leftShoulder, elbow: L.leftElbow, wrist: L.leftWrist, hip: L.leftHip,
    knee: L.leftKnee, ankle: L.leftAnkle, heel: L.leftHeel, footIndex: L.leftFootIndex,
  },
  right: {
    shoulder: L.rightShoulder, elbow: L.rightElbow, wrist: L.rightWrist, hip: L.rightHip,
    knee: L.rightKnee, ankle: L.rightAnkle, heel: L.rightHeel, footIndex: L.rightFootIndex,
  },
};

/** Paare (links, rechts) zum Vertauschen bei gespiegelten Videos. */
const PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18],
  [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

/** Index-Tabelle: swapIndex[i] = Index des Gegenstücks. */
export const SWAP_INDEX: number[] = (() => {
  const m = Array.from({ length: LANDMARK_COUNT }, (_, i) => i);
  for (const [a, b] of PAIRS) { m[a] = b; m[b] = a; }
  return m;
})();

/** Verbindungen für das Skelett-Overlay (Gesicht reduziert, für ruhiges Bild). */
export const SKELETON: [number, number][] = [
  [L.leftShoulder, L.rightShoulder],
  [L.leftShoulder, L.leftElbow], [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow], [L.rightElbow, L.rightWrist],
  [L.leftShoulder, L.leftHip], [L.rightShoulder, L.rightHip], [L.leftHip, L.rightHip],
  [L.leftHip, L.leftKnee], [L.leftKnee, L.leftAnkle],
  [L.rightHip, L.rightKnee], [L.rightKnee, L.rightAnkle],
  [L.leftAnkle, L.leftHeel], [L.leftHeel, L.leftFootIndex], [L.leftAnkle, L.leftFootIndex],
  [L.rightAnkle, L.rightHeel], [L.rightHeel, L.rightFootIndex], [L.rightAnkle, L.rightFootIndex],
  [L.leftEar, L.leftEye], [L.leftEye, L.nose], [L.nose, L.rightEye], [L.rightEye, L.rightEar],
];

/** Punkte, die im Overlay gezeichnet werden (ohne Finger-/Mundpunkte). */
export const DRAWN_POINTS: number[] = [
  L.nose, L.leftEye, L.rightEye, L.leftEar, L.rightEar,
  L.leftShoulder, L.rightShoulder, L.leftElbow, L.rightElbow, L.leftWrist, L.rightWrist,
  L.leftHip, L.rightHip, L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle,
  L.leftHeel, L.rightHeel, L.leftFootIndex, L.rightFootIndex,
];
