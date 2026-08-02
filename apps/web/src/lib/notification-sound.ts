/**
 * Bildirim sesi — WebAudio ile sentezlenen kısa iki-notalı "ding".
 * Dosya/asset yok (CSP self-contained), modül-seviyesi tek AudioContext.
 *
 * Autoplay politikası: kullanıcı jesti olmadan context "suspended" kalır —
 * resume denenir, olmazsa SESSİZCE geçilir (hata fırlatmaz, konsol kirletmez).
 * İlk tıklamadan sonra sonraki bildirimler duyulur.
 */

interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext;
}

let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function playNotificationSound(): void {
  try {
    const ac = ensureContext();
    if (!ac) return;
    if (ac.state === "suspended") {
      // Jest yok → çalamayız; resume'u tetikle ki jest sonrası ilk bildirim
      // duyulsun. Bu bildirimi zamanlama (resume asenkron — geç çalmasın).
      void ac.resume().catch(() => undefined);
      return;
    }
    const t0 = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    const notes: Array<[freq: number, offset: number]> = [
      [880, 0], // A5
      [1174.66, 0.12], // D6
    ];
    for (const [freq, offset] of notes) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0 + offset);
      osc.connect(gain);
      osc.start(t0 + offset);
      osc.stop(t0 + 0.5);
    }
  } catch {
    // Ses hiçbir akışı bozmamalı — sessizce geç.
  }
}
