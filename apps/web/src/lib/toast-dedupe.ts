"use client";

import { toast } from "sonner";

/**
 * Global hata-toast tekilleştirme.
 *
 * Aynı API hatası iki katmandan birden toast'lanıyor: axios interceptor'ları
 * (lib/api + lib/company-auth/api) global gösterir, mutation catch'leri de
 * `extractErrorMessage` ile aynı sunucu mesajını basar — kullanıcı her hatayı
 * çift görüyordu ("Kapanış tarihi gelecekte olmalı" ×2). Katman sorumluluğunu
 * onlarca çağrı yerinde elden geçirmek yerine tek noktada çözüyoruz: birebir
 * aynı hata metni kısa pencere içinde ikinci kez gelirse yutulur (ilk
 * toast'ın id'si döner). Çift tıklama kaynaklı tekrarları da örter.
 */
const WINDOW_MS = 2500;
const recent = new Map<string, { t: number; id: string | number }>();
let installed = false;

export function installToastDedupe(): void {
  if (installed) return;
  installed = true;
  const original = toast.error.bind(toast);
  toast.error = ((message: Parameters<typeof toast.error>[0], opts?: Parameters<typeof toast.error>[1]) => {
    if (typeof message === "string") {
      const now = Date.now();
      const prev = recent.get(message);
      // Haritayı büyütmemek için eskimiş kayıtları fırsatçı temizle.
      if (recent.size > 20) {
        for (const [k, v] of recent) if (now - v.t > WINDOW_MS) recent.delete(k);
      }
      if (prev && now - prev.t < WINDOW_MS) {
        prev.t = now;
        return prev.id;
      }
      const id = original(message, opts);
      recent.set(message, { t: now, id });
      return id;
    }
    return original(message, opts);
  }) as typeof toast.error;
}
