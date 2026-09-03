"use client";

import { InquiriesView } from "@/components/inquiries/inquiries-view";

/**
 * Bilgi Taleplerim (SATINALMA) — tedarikçi ürünleri hakkında GÖNDERDİĞİM
 * sorular ve gelen yanıtlar.
 *
 * Satış portalındaki "Bilgi Talepleri" ile karıştırılmamalı: orası ürünlerime
 * GELEN sorular. Ayrımı iyelik kipi taşıyor ("Taleplerim" vs "Talepler") —
 * "Ürünlerim" / "Ürünler" ayrımıyla aynı kural.
 */
export default function BilgiTaleplerimPage() {
  return <InquiriesView portal="satinalma" />;
}
