/** Hält den Bildschirm wach (Screen Wake Lock API), wenn verfügbar. Fehler werden still ignoriert. */
export class WakeLock {
  private sentinel: { release(): Promise<void> } | null = null;
  private wanted = false;
  private onVisible = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };

  get supported() { return 'wakeLock' in navigator; }
  get active() { return this.sentinel !== null; }

  async enable() {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisible);
    await this.acquire();
  }

  async disable() {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    const s = this.sentinel;
    this.sentinel = null;
    await s?.release().catch(() => {});
  }

  private async acquire() {
    if (!this.supported || this.sentinel) return;
    try {
      const nav = navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<{ release(): Promise<void>; addEventListener(e: string, f: () => void): void }> } };
      const s = await nav.wakeLock.request('screen');
      s.addEventListener('release', () => { if (this.sentinel === s) this.sentinel = null; });
      this.sentinel = s;
    } catch {
      this.sentinel = null;
    }
  }
}
