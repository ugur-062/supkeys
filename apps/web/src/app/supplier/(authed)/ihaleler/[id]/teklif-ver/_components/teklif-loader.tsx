"use client";

import { Button } from "@/components/ui/button";
import { useMyBid } from "@/hooks/use-supplier-bid";
import { useSupplierTenderDetail } from "@/hooks/use-supplier-tenders";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { TeklifForm } from "./teklif-form";

interface Props {
  id: string;
}

export function TeklifLoader({ id }: Props) {
  const detail = useSupplierTenderDetail(id);
  const myBidQuery = useMyBid(id);

  if (detail.isLoading || myBidQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Yükleniyor…</p>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">İhale bulunamadı</p>
          <p className="text-sm text-slate-500">
            Bu ihaleye davet edilmemiş olabilirsiniz veya ihale yayından
            kaldırılmış olabilir.
          </p>
          <Link href="/supplier/ihaleler" className="inline-block">
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

  // İhale teklif kabul etmiyorsa form gösterme
  if (tender.status !== "OPEN_FOR_BIDS") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-warning-600" />
          </div>
          <p className="font-display font-bold text-brand-900">
            Bu ihaleye artık teklif verilemez
          </p>
          <p className="text-sm text-slate-500">
            İhale &ldquo;{tender.status}&rdquo; durumunda. Teklif kabul aşaması
            kapandı.
          </p>
          <Link
            href={`/supplier/ihaleler/${tender.id}`}
            className="inline-block"
          >
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              İhale Detayı
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Kapanış geçmişse de form gösterme (timer client-side; double-check)
  if (new Date(tender.bidsCloseAt) <= new Date()) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-warning-600" />
          </div>
          <p className="font-display font-bold text-brand-900">
            Teklif kapanış tarihi geçmiş
          </p>
          <Link
            href={`/supplier/ihaleler/${tender.id}`}
            className="inline-block"
          >
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              İhale Detayı
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TeklifForm tender={tender} existingBid={myBidQuery.data ?? null} />
  );
}
