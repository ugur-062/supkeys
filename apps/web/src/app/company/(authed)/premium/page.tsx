"use client";

import { PremiumGate } from "@/components/company-shell/premium-gate";

/**
 * Premium başvuru sayfası — maskeli PUBLIC ihale CTA'ları buraya yönlendirir.
 * Gereksinimler (belge doğrulama + 2FA) tamamlanınca "Premium'a Geç" aktifleşir.
 */
export default function PremiumPage() {
  return <PremiumGate />;
}
