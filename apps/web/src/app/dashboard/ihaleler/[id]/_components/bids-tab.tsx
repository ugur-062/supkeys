"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  useTenderBidComparison,
  useTenderBids,
} from "@/hooks/use-tenant-tenders";
import type { TenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  AlertCircle,
  FileText,
  Info,
  Loader2,
  Trophy,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { AwardWizardModal } from "./award-wizard-modal";
import { CloseNoAwardDialog } from "./close-no-award-dialog";
import { ItemBasedRanking } from "./item-based-ranking";
import { TenderBasedRanking } from "./tender-based-ranking";

const MAIN_TRIGGER = cn(
  "px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
  "data-[state=active]:border-brand-500 data-[state=active]:text-brand-700",
  "data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500",
  "hover:text-slate-700 focus:outline-none",
);

export function BidsTab({ tender }: { tender: TenderDetail }) {
  const isLive = tender.status === "OPEN_FOR_BIDS";
  const isClosed =
    tender.status === "IN_AWARD" ||
    tender.status === "AWARDED" ||
    tender.status === "CLOSED_NO_AWARD";

  const bidsQuery = useTenderBids(tender.id, { polling: isLive });
  const [view, setView] = useState<"item-based" | "tender-based">(
    "item-based",
  );

  if (tender.status === "DRAFT") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-12 text-center">
        <Info className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="font-semibold text-slate-700">Taslak ihalede teklif olmaz</p>
        <p className="text-sm text-slate-500 mt-1">
          İhaleyi yayınladığınızda tedarikçi teklifleri burada listelenir.
        </p>
      </div>
    );
  }

  if (bidsQuery.isLoading && !bidsQuery.data) {
    return (
      <div className="py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Teklifler yükleniyor…
      </div>
    );
  }

  if (bidsQuery.isError || !bidsQuery.data) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-danger-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-danger-700">
            Teklifler yüklenemedi
          </p>
          <p className="text-sm text-danger-600 mt-1">
            Lütfen sayfayı yenileyin.
          </p>
        </div>
      </div>
    );
  }

  const bidsData = bidsQuery.data;

  return (
    <div className="space-y-5">
      {/* Polling banner */}
      {isLive ? (
        <PollingBanner isError={bidsQuery.isError} />
      ) : isClosed && tender.status === "IN_AWARD" ? (
        <ClosedStatusBanner tender={tender} total={bidsData.summary.total} />
      ) : isClosed ? (
        <ResultBanner tender={tender} />
      ) : null}

      {/* KPI özet */}
      <BidsSummary bidsData={bidsData} />

      {/* 2 Ana Tab */}
      <TabsPrimitive.Root
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
      >
        <TabsPrimitive.List
          className="border-b border-slate-200 flex items-center gap-1"
          aria-label="Teklif sıralama görünümü"
        >
          <TabsPrimitive.Trigger value="item-based" className={MAIN_TRIGGER}>
            Kalem Bazlı Sıralama
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="tender-based" className={MAIN_TRIGGER}>
            İhale Bazlı Sıralama
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="item-based" className="mt-4 outline-none">
          <ItemBasedRankingWrapper tender={tender} isLive={isLive} />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content
          value="tender-based"
          className="mt-4 outline-none"
        >
          <TenderBasedRanking tenderId={tender.id} bidsData={bidsData} />
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}

function ItemBasedRankingWrapper({
  tender,
  isLive,
}: {
  tender: TenderDetail;
  isLive: boolean;
}) {
  const comparison = useTenderBidComparison(tender.id, { polling: isLive });

  if (comparison.isLoading && !comparison.data) {
    return (
      <div className="py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Karşılaştırma yükleniyor…
      </div>
    );
  }

  if (comparison.isError || !comparison.data) {
    return (
      <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        Karşılaştırma yüklenemedi.
      </div>
    );
  }

  return (
    <ItemBasedRanking tenderId={tender.id} comparison={comparison.data} />
  );
}

function PollingBanner({ isError }: { isError: boolean }) {
  if (isError) {
    return (
      <div className="bg-danger-50 border border-danger-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-danger-500" />
        <p className="text-sm text-danger-700">
          Güncelleme alınamıyor. Lütfen sayfayı yenileyin.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-success-50 border border-success-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-success-500 animate-pulse" />
      <p className="text-sm text-success-700">
        Sayfa her yeni teklif aldığında otomatik olarak güncellenir.
      </p>
    </div>
  );
}

function ClosedStatusBanner({
  tender,
  total,
}: {
  tender: TenderDetail;
  total: number;
}) {
  const { user } = useAuth();
  const isCompanyAdmin = user?.role === "COMPANY_ADMIN";
  const [awardOpen, setAwardOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  return (
    <>
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Trophy className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-purple-900">Kazandırma Aşaması</h3>
            <p className="text-sm text-purple-700 mt-0.5">
              İhale kapandı, {total} teklif değerlendirilmeyi bekliyor.
            </p>
          </div>
          {isCompanyAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setCloseOpen(true)}
                className="!text-warning-700 !border-warning-300 hover:!bg-warning-50"
                disabled={total === 0}
              >
                <XCircle className="h-4 w-4" />
                Kazanan Yok Kapat
              </Button>
              <Button
                variant="primary"
                onClick={() => setAwardOpen(true)}
                className="!bg-purple-600 hover:!bg-purple-700"
                disabled={total === 0}
                title={
                  total === 0 ? "Bu ihaleye teklif verilmemiş" : undefined
                }
              >
                <Trophy className="h-4 w-4" />
                Kazandırmayı Tamamla
              </Button>
            </div>
          ) : (
            <p className="text-xs text-purple-700">
              Kazandırma için Firma Yöneticisi yetkisi gerekli.
            </p>
          )}
        </div>
      </div>

      <AwardWizardModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        tender={tender}
      />
      <CloseNoAwardDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        tenderId={tender.id}
      />
    </>
  );
}

function ResultBanner({ tender }: { tender: TenderDetail }) {
  if (tender.status === "AWARDED") {
    return (
      <div className="bg-success-50 border border-success-200 rounded-2xl p-5 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-success-100 flex items-center justify-center flex-shrink-0">
          <Trophy className="h-5 w-5 text-success-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-success-900">İhale Kazandırıldı</h3>
          <p className="text-sm text-success-700 mt-0.5">
            Siparişler oluşturuldu, kazanan tedarikçilere bildirim gönderildi.
            Detaylar için /dashboard/siparisler sayfasına gidin.
          </p>
        </div>
      </div>
    );
  }
  if (tender.status === "CLOSED_NO_AWARD") {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
          <XCircle className="h-5 w-5 text-slate-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800">
            Kazanan Olmadan Kapatıldı
          </h3>
          {tender.cancelReason ? (
            <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">
              {tender.cancelReason}
            </p>
          ) : (
            <p className="text-sm text-slate-600 mt-0.5">
              Bu ihale kazanan tedarikçi olmadan kapatıldı.
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function BidsSummary({
  bidsData,
}: {
  bidsData: { tender: { invitedCount: number }; summary: { total: number; complete: number; incomplete: number } };
}) {
  const items: Array<{
    label: string;
    value: number;
    valueClass: string;
  }> = [
    {
      label: "Davet Edilen",
      value: bidsData.tender.invitedCount,
      valueClass: "text-brand-900",
    },
    {
      label: "Teklif Veren",
      value: bidsData.summary.total,
      valueClass: "text-success-700",
    },
    {
      label: "Tamamına",
      value: bidsData.summary.complete,
      valueClass: "text-brand-900",
    },
    {
      label: "Eksik Veren",
      value: bidsData.summary.incomplete,
      valueClass: "text-warning-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="bg-white border border-slate-200 rounded-xl p-4"
        >
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
            {it.label}
          </p>
          <p className={cn("text-2xl font-bold mt-1", it.valueClass)}>
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function NoBidsEmptyState() {
  return (
    <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
      <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
      <p className="font-semibold text-slate-700">Henüz teklif yok</p>
      <p className="text-sm text-slate-500 mt-1">
        Tedarikçilerin teklifleri buraya düşecek
      </p>
    </div>
  );
}
