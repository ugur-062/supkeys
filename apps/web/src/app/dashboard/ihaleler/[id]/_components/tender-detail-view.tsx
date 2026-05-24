"use client";

import { TenderMessagesButton } from "@/components/messaging/tender-messages-button";
import { Button } from "@/components/ui/button";
import { useTenderDetail } from "@/hooks/use-tenant-tenders";
import { AlertCircle, ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { BidsTab } from "./bids-tab";
import { TenderHeaderCard } from "./header-card";

export function TenderDetailView({ id }: { id: string }) {
  const detail = useTenderDetail(id);

  // İlk yükleme (cache'te veri yok ve fetch ilerliyor)
  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-7xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">İhale yükleniyor…</p>
      </div>
    );
  }

  // Veri yoksa hata göster — `isError` tek başına yeterli değil çünkü
  // refetch hatası kayıtlı veriyi silmez; sadece data tamamen yoksa
  // "bulunamadı" göster.
  if (!detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">İhale bulunamadı</p>
          <p className="text-sm text-slate-500">
            Bu ihale silinmiş veya size ait olmayabilir.
          </p>
          <Link href="/dashboard/ihaleler" className="inline-block">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              İhaleler
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const tender = detail.data;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/dashboard/ihaleler"
          className="hover:text-brand-700 hover:underline"
        >
          İhaleler
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-brand-700">{tender.tenderNumber}</span>
      </nav>

      <TenderHeaderCard tender={tender} />

      {/* Detay sayfası = sadece Teklifler tablosu. Genel/Kalemler/Davetli/
          Dosyalar "Diğer İşlemler → İhale Detayını Gör" pop-up'ında. */}
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <TenderMessagesButton
            tenderId={tender.id}
            tenderNumber={tender.tenderNumber}
          />
        </div>
        <BidsTab tender={tender} />
      </div>
    </div>
  );
}
