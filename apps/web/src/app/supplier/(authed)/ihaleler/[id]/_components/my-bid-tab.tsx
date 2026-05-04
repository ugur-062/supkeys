"use client";

import { Button } from "@/components/ui/button";
import { useMyBid, useWithdrawBid } from "@/hooks/use-supplier-bid";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Edit,
  FileText,
  Info,
  Loader2,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BidSummaryCard } from "./bid-summary-card";

interface Props {
  tender: SupplierTenderDetail;
}

export function MyBidTab({ tender }: Props) {
  const myBidQuery = useMyBid(tender.id);
  const withdrawMutation = useWithdrawBid(tender.id);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (myBidQuery.isLoading) {
    return (
      <div className="card p-12 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="ml-2 text-sm">Teklif yükleniyor…</span>
      </div>
    );
  }

  if (myBidQuery.isError) {
    return (
      <div className="card p-12 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-danger-600 mx-auto" />
        <p className="font-medium text-brand-900">Teklif bilgisi alınamadı</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => myBidQuery.refetch()}
        >
          Tekrar dene
        </Button>
      </div>
    );
  }

  const bid = myBidQuery.data ?? null;
  const isOpen = tender.status === "OPEN_FOR_BIDS";
  const formHref = `/supplier/ihaleler/${tender.id}/teklif-ver`;

  // 1. Henüz teklif yok
  if (!bid) {
    if (!isOpen) {
      return (
        <div className="card p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="font-display font-bold text-brand-900">
            Bu ihaleye teklif vermediniz
          </p>
          <p className="text-sm text-slate-500">
            İhale teklif kabul aşaması bitti.
          </p>
        </div>
      );
    }
    return (
      <div className="card p-12 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-brand-50 flex items-center justify-center">
          <FileText className="w-6 h-6 text-brand-600" />
        </div>
        <p className="font-display font-bold text-brand-900">
          Henüz teklif vermediniz
        </p>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Kapanış tarihinden önce teklif vererek bu ihalede yer alabilirsiniz.
        </p>
        <div className="pt-2">
          <Link href={formHref}>
            <Button variant="primary">
              <Send className="w-4 h-4" />
              Teklif Ver
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleWithdraw = async () => {
    try {
      await withdrawMutation.mutateAsync();
      toast.success("Teklifiniz geri çekildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geri çekme başarısız"));
    } finally {
      setConfirmingWithdraw(false);
    }
  };

  return (
    <div className="space-y-4">
      {bid.status === "DRAFT" ? (
        <div className="rounded-xl bg-warning-50 border border-warning-200 p-4 flex gap-3 items-start">
          <Info className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-warning-900">
            <strong>Taslak teklifiniz var.</strong> Henüz alıcıya gönderilmedi.
            Kapanış tarihinden önce gönderin.
          </div>
        </div>
      ) : null}

      {bid.status === "SUBMITTED" && bid.submittedAt ? (
        <div className="rounded-xl bg-success-50 border border-success-200 p-4 flex gap-3 items-start">
          <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-success-900">
            <strong>Teklifiniz alındı.</strong> Versiyon: v{bid.version} ·
            Verildi:{" "}
            {format(new Date(bid.submittedAt), "d MMM yyyy, HH:mm", {
              locale: tr,
            })}
          </div>
        </div>
      ) : null}

      {bid.status === "WITHDRAWN" && bid.withdrawnAt ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex gap-3 items-start">
          <Ban className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-slate-700">
            <strong>Teklif geri çekildi.</strong> Geri çekme:{" "}
            {format(new Date(bid.withdrawnAt), "d MMM yyyy, HH:mm", {
              locale: tr,
            })}
          </div>
        </div>
      ) : null}

      <BidSummaryCard bid={bid} />

      {/* Aksiyon butonları — sadece OPEN_FOR_BIDS aşamasında */}
      {isOpen ? (
        <div className="flex items-center gap-2 flex-wrap">
          {bid.status === "DRAFT" ? (
            <Link href={formHref}>
              <Button variant="primary">
                <Edit className="w-4 h-4" />
                Devam Et
              </Button>
            </Link>
          ) : null}

          {bid.status === "SUBMITTED" ? (
            <>
              <Link href={formHref}>
                <Button variant="primary">
                  <Edit className="w-4 h-4" />
                  Teklifi Revize Et
                </Button>
              </Link>
              {confirmingWithdraw ? (
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-slate-600">
                    Emin misiniz?
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingWithdraw(false)}
                    disabled={withdrawMutation.isPending}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleWithdraw}
                    loading={withdrawMutation.isPending}
                    className="!bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
                  >
                    <Ban className="w-4 h-4" />
                    Geri Çek
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmingWithdraw(true)}
                  className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                >
                  <Ban className="w-4 h-4" />
                  Teklifi Geri Çek
                </Button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
