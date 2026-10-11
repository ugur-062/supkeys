"use client";

import { VerificationGate } from "@/components/company/verification-gate";

/**
 * Sayfa kapısı — ücretsiz dönemde (2026-10-07) DOĞRULAMA kapısıdır: paket
 * kartları, fiyat ve paket adı çizilmez; "firma doğrulaması gerekir" + duruma
 * göre eylem (`VerificationGate`).
 *
 * @deprecated Ad geriye dönük; yeni kod `VerificationGate` kullanır.
 * `requiredTier` kabul edilir ama metne yansımaz (eşik çağıranın kapı
 * mantığındadır).
 */
export function PremiumGate({ title }: { requiredTier?: "SILVER" | "GOLD"; title?: string }) {
  return <VerificationGate title={title} />;
}
