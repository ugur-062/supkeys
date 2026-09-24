"use client";

import { useTranslations } from "next-intl";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useState } from "react";

/**
 * YAYIN SONRASI — engel değil öneri (2026-09-09).
 * Tedarikçi önerisi (AI, Silver+) ve talep sayfası; "yeni talep" ile döngü.
 */
export function PublishedPanel({ listingId, title, categoryIds, itemNames, onNew }: { listingId: string; title: string; categoryIds: string[]; itemNames: string[]; onNew: () => void }) {
  const t = useTranslations("web.panel.requests.publishedPanel");
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const { company } = useCompanyAuth();
  // API `company/ai/supplier-discovery` @RequireTier("GOLD") — ekran aynı kapı.
  const aiAvailable = !!company && tierAtLeast(company.tier, BUYING_TIER);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-950/5">
      <CheckCircleIcon aria-hidden className="mx-auto size-12 text-emerald-500" />
      <h2 className="mt-3 text-xl font-semibold text-zinc-950">{t("talebinizYayinda")}</h2>
      <p className="mt-1 text-sm text-zinc-600">{t("davetlilerVeGorunurlukKuralinaUyan", { title: title })}</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={`/company/ilan/${listingId}`} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          {t("talebiGor")}
        </Link>
        <button
          type="button"
          onClick={() => setDiscoveryOpen(true)}
          disabled={!aiAvailable}
          title={aiAvailable ? undefined : t("tedarikciOnerisiGoldPakette")}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
        >
          <SparklesIcon aria-hidden className="size-4" />
          {t("uygunTedarikciOnerVeDavet")}
        </button>
      </div>
      <button type="button" onClick={onNew} className="mt-4 text-sm font-medium text-zinc-600 hover:text-zinc-900">
        {t("yeniTalepAc")}
      </button>
      <SupplierDiscoveryModal isOpen={discoveryOpen} onClose={() => setDiscoveryOpen(false)} categoryIds={categoryIds} itemNames={itemNames} listingId={listingId} />
    </div>
  );
}
