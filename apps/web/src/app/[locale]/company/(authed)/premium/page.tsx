"use client";

import { PackagesView } from "@/components/company/packages/packages-view";

/**
 * Paketler — panel içi (`PRICING_HREF`). Kilit kartları ve "Paketleri Gör"
 * çağrıları buraya gelir. Satın al → doğrulanmamışsa doğrulama, doğrulanmışsa
 * `/company/premium/satin-al`.
 */
export default function PremiumPage() {
  return <PackagesView />;
}
