"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { useTenders } from "@/hooks/use-company-tenders";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { toast } from "sonner";

/**
 * "SON TALEPLERDEN BAŞLA" — tekrarlayan alım için tek tık (2026-09-09 v3).
 * Son 3 yayımlanmış/tamamlanmış talebin kalemleri, kategorisi ve başlığı
 * yeni karta kopyalanır (tarih/davetliler kopyalanmaz — `forCopy`).
 */
export function RecentRequests({ onSeed }: { onSeed: (form: TenderFormData) => void }) {
  const { data = [] } = useTenders();
  const [busy, setBusy] = useState<string | null>(null);
  const recent = data.filter((t) => t.status !== "DRAFT").slice(0, 3);
  if (!recent.length) return null;

  const copy = async (id: string) => {
    setBusy(id);
    try {
      const { data: detail } = await companyApi.get<ListingDetail>(`/company/listings/${id}`);
      onSeed(mapDetailToForm(detail, { forCopy: true }));
      toast.success("Kalemler ve kategori kopyalandı — miktarları kontrol edin");
    } catch {
      toast.error("Talep kopyalanamadı");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      <ArrowPathIcon aria-hidden className="size-3.5" />
      Son taleplerden başla:
      {recent.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => void copy(t.id)}
          disabled={busy === t.id}
          className="max-w-[16rem] truncate rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:border-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
          title={t.title}
        >
          {busy === t.id ? "Kopyalanıyor…" : t.title}
        </button>
      ))}
    </div>
  );
}
