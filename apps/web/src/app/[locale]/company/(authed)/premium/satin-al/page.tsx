"use client";

import { useTranslations } from "next-intl";
import { CheckoutView } from "@/components/company/packages/checkout-view";
import { Suspense } from "react";

/** Paket satın alma ekranı — `?paket=silver|gold`. useSearchParams Suspense ister. */
export default function PaketSatinAlPage() {
  const t = useTranslations("web.panel.premium.premiumSatinAlPage");
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-zinc-500" role="status">
          {t("yukleniyor")}
        </div>
      }
    >
      <CheckoutView />
    </Suspense>
  );
}
