import { deviceTilt } from '../analysis/posture';

/** Liest die Geräteneigung. Auf iOS ist dafür eine Erlaubnis per Tipp nötig. */
export class DeviceTiltWatcher {
  latest: { roll: number; pitch: number } | null = null;
  private handler = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    const angle = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
    this.latest = deviceTilt(e.beta, e.gamma, angle);
  };

  static get supported() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window; }

  /** Muss aus einem Tipp heraus aufgerufen werden. true = läuft. */
  async start(): Promise<boolean> {
    if (!DeviceTiltWatcher.supported) return false;
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this.handler);
    return true;
  }

  stop() {
    window.removeEventListener('deviceorientation', this.handler);
    this.latest = null;
  }
}
