"use client";

import { PackagesView } from "@/components/company/packages/packages-view";

/**
 * Paket kapısı — kilitli sayfa ve `/company/premium` AYNI paket görünümünü
 * çizer (2026-09-15, kullanıcı kararı: "sadece paketlerde gözüksün").
 *
 * Eskiden burada uzun bir "neler açılır" listesi, doğrulama kutusu ve
 * "Gold'a Geç" düğmesi vardı. Doğrulama ve satın alma kararı artık paket
 * kartındaki "satın al" tıklamasında verilir (`PackagesView`).
 */
export function PremiumGate({ requiredTier }: { requiredTier?: "SILVER" | "GOLD" }) {
  return <PackagesView requiredTier={requiredTier} />;
}
