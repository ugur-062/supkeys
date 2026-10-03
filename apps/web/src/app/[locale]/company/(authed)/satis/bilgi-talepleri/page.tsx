"use client";

import { InquiriesView } from "@/components/inquiries/inquiries-view";

/**
 * Bilgi Talepleri (SATIŞ) — ürünlerime GELEN sorular.
 *
 * "Gönderdiklerim" sekmesi buradan KALKTI: alıcı olarak gönderdiğin talepler
 * satın alma panelindeki "Bilgi Taleplerim" sayfasında. Satış panelinde
 * durmaları rol sınırının sızmasıydı.
 */
export default function BilgiTalepleriPage() {
  return <InquiriesView portal="satis" />;
}
