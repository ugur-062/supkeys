"use client";

import { PanelProductIndex } from "@/components/company/market/panel-product-index";
import { AiIntentBand } from "@/components/dashboard/ai-intent-band";
import { takeAiIntent } from "@/lib/company/ai-search";
import type { AiSearchIntentResult } from "@rothern/shared";
import { useEffect, useState } from "react";

/**
 * ÜRÜN DİZİNİ — pazar bölgesinin ürün tarafı.
 *
 * Bu rota 2026-09-05'te kaldırılıp anasayfaya 308'lenmişti; pazar katmanı
 * brifiyle GERİ AÇILDI (kullanıcı kararı, canlı inceleme sonrası): her
 * keşif durumunun bir adresi olmalı — filtrelenmiş bir liste
 * paylaşılabilmeli, geri tuşu bir önceki süzgece dönmeli, anasayfa hem
 * panel hem katalog olmaya çalışmamalı.
 *
 * Ürün DETAYI bu yolun altında yaşamaya devam ediyor
 * (`urunler/<firma>/<ürün>`) — adres değişmedi.
 */
export default function PanelProductsPage() {
  // "AI şöyle anladı" bandı: yorum anasayfadaki kutudan `sessionStorage` ile
  // gelir (URL yalnız süzgeci taşır). Efekt içinde okunur — sunucu render'ında
  // depolama yok, koşulu render'a taşımak hydration uyuşmazlığı olurdu.
  const [intent, setIntent] = useState<AiSearchIntentResult | null>(null);
  useEffect(() => setIntent(takeAiIntent()), []);
  return (
    <PanelProductIndex
      banner={intent ? <AiIntentBand intent={intent} onDismiss={() => setIntent(null)} /> : null}
    />
  );
}
