"use client";

import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { tierAtLeast } from "@rothern/shared";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * YAYIN SONRASI — engel değil öneri (2026-09-09).
 * Tedarikçi önerisi (AI, Silver+) ve talep sayfası; "yeni talep" ile döngü.
 */
export function PublishedPanel({ listingId, title, categoryIds, itemNames, onNew }: { listingId: string; title: string; categoryIds: string[]; itemNames: string[]; onNew: () => void }) {
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const { company } = useCompanyAuth();
  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");
  return (
    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-950/5">
      <CheckCircleIcon aria-hidden className="mx-auto size-12 text-emerald-500" />
      <h2 className="mt-3 text-xl font-semibold text-zinc-950">Talebiniz yayında</h2>
      <p className="mt-1 text-sm text-zinc-600">“{title}” — davetliler ve görünürlük kuralına uyan tedarikçiler bilgilendirildi.</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={`/company/ilan/${listingId}`} className="rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
          Talebi gör
        </Link>
        <button
          type="button"
          onClick={() => setDiscoveryOpen(true)}
          disabled={!aiAvailable}
          title={aiAvailable ? undefined : "Tedarikçi önerisi Silver ve üzeri paketlerde"}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
        >
          <SparklesIcon aria-hidden className="size-4" />
          Uygun tedarikçi öner ve davet et
        </button>
      </div>
      <button type="button" onClick={onNew} className="mt-4 text-sm font-medium text-zinc-600 hover:text-zinc-900">
        Yeni talep aç
      </button>
      <SupplierDiscoveryModal isOpen={discoveryOpen} onClose={() => setDiscoveryOpen(false)} categoryIds={categoryIds} itemNames={itemNames} listingId={listingId} />
    </div>
  );
}
