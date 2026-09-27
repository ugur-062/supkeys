"use client";

import { useTranslations } from "next-intl";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import type { ExternalInviteResult } from "@/hooks/use-supplier-discovery";
import { isInviteAccepted } from "@/lib/tenders/external-invite-status";
import { cn } from "@/lib/utils";
import { ListingSuggestions } from "@/components/tenders/ai-suppliers/listing-suggestions";
import { ShareListing } from "@/components/tenders/share-listing";
import { useListingDetail } from "@/hooks/use-company-listings";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * YAYIN SONRASI — engel değil öneri (2026-09-09).
 * Tedarikçi önerisi (AI, Silver+) ve talep sayfası; "yeni talep" ile döngü.
 */
export function PublishedPanel({
  listingId,
  title,
  categoryIds,
  itemNames,
  inviteResults = null,
  onNew,
}: {
  listingId: string;
  title: string;
  categoryIds: string[];
  itemNames: string[];
  /** Yayın öncesi eklenen dış davetlerin GERÇEK sonucu (adres başına); "error" = istek düştü. */
  inviteResults?: ExternalInviteResult[] | "error" | null;
  onNew: () => void;
}) {
  const t = useTranslations("web.panel.requests.publishedPanel");
  const tStatus = useTranslations("web.panel.requests.externalInviteStatus");
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const { company } = useCompanyAuth();
  // API `company/ai/supplier-discovery` @RequireTier("GOLD") — ekran aynı kapı.
  const aiAvailable = !!company && tierAtLeast(company.tier, BUYING_TIER);
  const buyerCountry = useCompanyAuthStore((st) => st.company?.country);
  // Herkese açık sayfa vitrindeyse paylaş (2026-09-27, Faz 3).
  const detail = useListingDetail(listingId);
  const publicPath = detail.data?.publicPath ?? null;
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
      {inviteResults ? (
        <div className="mt-6 rounded-xl bg-zinc-100 p-4 text-left ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-950">{t("davetEPostalari")}</p>
          {inviteResults === "error" ? (
            <p className="mt-1 text-sm text-red-700">{t("davetEPostalariGonderilemedi")}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-700">
                {t("davetSirayaAlindiSayisi", { n: inviteResults.filter((r) => isInviteAccepted(r.status)).length })}
              </p>
              <ul className="mt-2 space-y-1">
                {inviteResults.map((r) => (
                  <li key={r.email} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-zinc-800">{r.email}</span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold",
                        isInviteAccepted(r.status)
                          ? "text-emerald-700"
                          : r.status === "FAILED" || r.status === "SUPPRESSED"
                            ? "text-red-700"
                            : "text-zinc-600",
                      )}
                    >
                      {tStatus(r.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
      {/* Yayında otomatik AI araması (2026-09-27, Faz 1): tur sürerken "AI
          arıyor…", bitince bulunanlar SEÇİLİ — tek tıkla davet. Otomatik arama
          kapalıysa bileşen hiçbir şey çizmez. */}
      {publicPath ? (
        <div className="mt-6">
          <ShareListing publicPath={publicPath} title={title} />
        </div>
      ) : null}
      {aiAvailable ? (
        <div className="mt-6">
          <ListingSuggestions listingId={listingId} itemNames={itemNames} buyerCountry={buyerCountry} variant="panel" />
        </div>
      ) : null}
      <button type="button" onClick={onNew} className="mt-4 text-sm font-medium text-zinc-600 hover:text-zinc-900">
        {t("yeniTalepAc")}
      </button>
      <SupplierDiscoveryModal isOpen={discoveryOpen} onClose={() => setDiscoveryOpen(false)} categoryIds={categoryIds} itemNames={itemNames} listingId={listingId} />
    </div>
  );
}
