/**
 * Tactile Haptics Utility using navigator.vibrate
 * Safe cross-platform wrapper for mobile web gaming
 */

class HapticsController {
  private enabled = true;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator;
  }

  public setEnabled(enable: boolean) {
    this.enabled = enable;
  }

  public vibrate(pattern: number | number[]): void {
    if (!this.enabled || !this.isSupported()) return;
    try {
      navigator.vibrate(pattern);
    } catch {}
  }

  // Crisp micro-click for card selection / slide
  public tap(): void {
    this.vibrate(12);
  }

  // Double click for playing card
  public playCard(): void {
    this.vibrate([15, 30, 20]);
  }

  // Heavy rumble for bomb / rocket explosion
  public bomb(): void {
    this.vibrate([50, 40, 80, 50, 120]);
  }

  // Supernova rocket rumble
  public rocket(): void {
    this.vibrate([30, 20, 60, 30, 100, 40, 150]);
  }

  // Mahjong ceramic clack / discard
  public mahjongClack(): void {
    this.vibrate(20);
  }

  // Calligraphy seal stamp (碰/杠/胡)
  public sealStamp(): void {
    this.vibrate([45, 30, 70]);
  }

  // Victory fanfare vibration
  public victory(): void {
    this.vibrate([30, 60, 40, 60, 50, 80, 120]);
  }

  // Gunshot shock in Shisanshui
  public gunshot(): void {
    this.vibrate([40, 30, 60]);
  }
}

export const haptics = new HapticsController();
