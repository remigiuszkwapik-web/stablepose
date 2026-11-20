export type Facing = 'user' | 'environment';

export interface CameraSource {
  kind: 'camera';
  facing: Facing;
  stream: MediaStream;
}
export interface FileSource {
  kind: 'file';
  url: string;
  name: string;
}
export type Source = CameraSource | FileSource;

/** Startet die Kamera. Muss aus einem Tipp-Ereignis heraus aufgerufen werden (iOS). */
export async function startCamera(video: HTMLVideoElement, facing: Facing): Promise<CameraSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Dieser Browser erlaubt keinen Kamerazugriff. Öffne die Seite per HTTPS in Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  prepareVideo(video);
  video.setAttribute('autoplay', '');
  video.autoplay = true;
  video.srcObject = stream;
  await video.play();
  await waitForSize(video);
  return { kind: 'camera', facing, stream };
}

/** Spielt eine lokale Videodatei ab. Die Datei bleibt auf dem Gerät (Object-URL). */
export async function startFile(video: HTMLVideoElement, file: File): Promise<FileSource> {
  const url = URL.createObjectURL(file);
  prepareVideo(video);
  video.srcObject = null;
  video.src = url;
  video.loop = false;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Video konnte nicht geladen werden. Unterstützt sind z. B. MP4 und MOV.'));
  });
  video.pause();
  video.currentTime = 0;
  await waitForSize(video);
  // Abspielen startet erst, wenn das Modell geladen ist (siehe session.ts), damit kein Bild verloren geht.
  return { kind: 'file', url, name: file.name };
}

export function stopSource(video: HTMLVideoElement, source: Source | null): void {
  video.pause();
  if (source?.kind === 'camera') source.stream.getTracks().forEach((t) => t.stop());
  if (source?.kind === 'file') URL.revokeObjectURL(source.url);
  video.srcObject = null;
  video.removeAttribute('src');
  video.load();
}

function prepareVideo(video: HTMLVideoElement) {
  // iOS Safari: ohne diese Attribute öffnet sich der Vollbildplayer bzw. startet nichts.
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.playsInline = true;
  video.muted = true;
}

function waitForSize(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => (video.videoWidth > 0 ? resolve() : requestAnimationFrame(check));
    check();
  });
}
