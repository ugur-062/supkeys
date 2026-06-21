"use client";

import { Text } from "@/components/catalyst/text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMyBid, useWithdrawBid } from "@/hooks/use-supplier-bid";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  Ban,
  FileText,
  Loader2,
  Send,
  TrendingDown,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BidSummaryCard } from "./bid-summary-card";

interface Props {
  tender: SupplierTenderDetail;
}

/** Boş/yükleniyor/hata gibi tek-mesaj merkezi durumlar. */
function CenteredState({
  icon: Icon,
  title,
  description,
  children,
  tone = "neutral",
}: {
  icon: typeof FileText;
  title: string;
  description?: string;
  children?: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${
          tone === "danger" ? "bg-danger-50" : "bg-zinc-100"
        }`}
      >
        <Icon
          className={`h-6 w-6 ${tone === "danger" ? "text-danger-600" : "text-zinc-500"}`}
        />
      </div>
      <p className="mt-3 font-semibold text-zinc-950">{title}</p>
      {description ? (
        <Text className="mt-1 max-w-md">{description}</Text>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** Kazanma kutlama paneli. */
function AwardPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl bg-success-50 p-6 ring-1 ring-success-600/20">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success-100">
          <Trophy className="h-6 w-6 text-success-600" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-lg font-bold text-success-900">{title}</p>
          <p className="text-sm text-success-800">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function MyBidTab({ tender }: Props) {
  const myBidQuery = useMyBid(tender.id);
  const withdrawMutation = useWithdrawBid(tender.id);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (myBidQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="ml-2 text-sm">Teklif yükleniyor…</span>
      </div>
    );
  }

  if (myBidQuery.isError) {
    return (
      <CenteredState
        icon={AlertCircle}
        tone="danger"
        title="Teklif bilgisi alınamadı"
      >
        <Button variant="secondary" onClick={() => myBidQuery.refetch()}>
          Tekrar dene
        </Button>
      </CenteredState>
    );
  }

  const bid = myBidQuery.data ?? null;
  const isOpen = tender.status === "OPEN_FOR_BIDS";
  // V2-7 — Açık eksiltmede tedarikçi SUBMITTED teklifini açıkken düşürebilir.
  const isAuction = tender.type === "ENGLISH_AUCTION";
  const formHref = `/supplier/ihaleler/${tender.id}/teklif-ver`;

  // 1. Henüz teklif yok
  if (!bid) {
    if (!isOpen) {
      return (
        <CenteredState
          icon={FileText}
          title="Bu ihaleye teklif vermediniz"
          description="İhale teklif kabul aşaması bitti."
        />
      );
    }
    return (
      <CenteredState
        icon={FileText}
        title="Henüz teklif vermediniz"
        description="Kapanış tarihinden önce teklif vererek bu ihalede yer alabilirsiniz."
      >
        <Link href={formHref}>
          <Button>
            <Send className="h-4 w-4" />
            Teklif Ver
          </Button>
        </Link>
      </CenteredState>
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

  const tenderClosed =
    tender.status === "IN_AWARD" ||
    tender.status === "AWARDED" ||
    tender.status === "CLOSED_NO_AWARD";

  const tenderAwarded = tender.status === "AWARDED";

  // ----- AWARDED durumları -----
  if (bid.status === "AWARDED_FULL" || bid.status === "AWARDED_PARTIAL") {
    const full = bid.status === "AWARDED_FULL";
    return (
      <div className="space-y-5">
        <AwardPanel
          title={
            full
              ? "Tebrikler! Tüm kalemleri kazandınız."
              : "Bazı kalemleri kazandınız."
          }
          description={
            full
              ? "Sipariş oluşturuldu. Detaylar için sipariş sayfasına gidin."
              : "Kazandığınız kalemler için sipariş oluşturuldu."
          }
        />
        <BidSummaryCard bid={bid} />
        <Link href={`/supplier/siparisler?tenderId=${tender.id}`}>
          <Button>
            <Trophy className="h-4 w-4" />
            Siparişlerimi Görüntüle
          </Button>
        </Link>
      </div>
    );
  }

  // LOST sonrası tender artık kapanmış (AWARDED veya CLOSED_NO_AWARD)
  if (bid.status === "LOST" && tenderAwarded) {
    return (
      <div className="space-y-5">
        <Alert variant="info" title="İhale sonuçlandı.">
          Maalesef bu ihaleyi kazanamadınız. Diğer ihalelerimizi takip etmeyi
          unutmayın.
        </Alert>
        <BidSummaryCard bid={bid} />
      </div>
    );
  }

  // LOST + ihale hâlâ açık → eleme akışı: yeniden teklif verilebilir
  if (bid.status === "LOST" && isOpen) {
    return (
      <div className="space-y-5">
        <Alert variant="warning" title="Teklifiniz alıcı tarafından elendi.">
          {bid.eliminationReason ? (
            <p>
              <strong>Sebep:</strong> {bid.eliminationReason}
            </p>
          ) : null}
        </Alert>

        <BidSummaryCard bid={bid} />

        <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5">
          <p className="text-sm font-bold text-zinc-900">
            Yeniden Teklif Verebilirsiniz
          </p>
          <Text className="mt-1">
            Alıcının eleme sebebini dikkate alarak yeni bir teklif
            hazırlayabilirsiniz.
          </Text>
          <div className="mt-3">
            <Link href={formHref}>
              <Button>
                <Send className="h-4 w-4" />
                Yeniden Teklif Ver
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ----- DRAFT, SUBMITTED, WITHDRAWN -----
  return (
    <div className="space-y-5">
      {bid.status === "SUBMITTED" && tenderClosed ? (
        <Alert variant="info" title="İhale teklif kabul aşaması sona erdi.">
          Alıcı kazandırma kararını verdiğinde sonuç bildirimi alacaksınız.
        </Alert>
      ) : null}

      {bid.status === "DRAFT" ? (
        <Alert variant="warning">
          <strong>Taslak teklifiniz var.</strong> Henüz alıcıya gönderilmedi.
          Kapanış tarihinden önce gönderin.
        </Alert>
      ) : null}

      {bid.status === "SUBMITTED" && bid.submittedAt ? (
        <Alert variant="success" title="Teklifiniz alındı.">
          Versiyon: v{bid.version} · Verildi:{" "}
          {format(new Date(bid.submittedAt), "d MMM yyyy, HH:mm", {
            locale: tr,
          })}
        </Alert>
      ) : null}

      {bid.status === "WITHDRAWN" && bid.withdrawnAt ? (
        <Alert variant="info" title="Teklif geri çekildi.">
          Geri çekme:{" "}
          {format(new Date(bid.withdrawnAt), "d MMM yyyy, HH:mm", {
            locale: tr,
          })}
        </Alert>
      ) : null}

      <BidSummaryCard bid={bid} />

      {/* SUBMITTED + ihale açık. */}
      {bid.status === "SUBMITTED" && isOpen ? (
        <>
          {isAuction ? (
            <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5">
              <p className="text-sm font-bold text-zinc-900">
                Açık eksiltme — fiyatınızı düşürebilirsiniz
              </p>
              <Text className="mt-1">
                İhale açık olduğu sürece daha düşük bir teklif vererek
                sıralamanızı iyileştirebilirsiniz. Yeni teklifiniz öncekinden en
                az belirlenen azaltma kadar düşük olmalıdır.
              </Text>
            </div>
          ) : (
            <Alert
              variant="warning"
              title="Teklifinizi mi değiştirmek istiyorsunuz?"
            >
              <p>
                Teklifinizi değiştirmek için alıcıyla iletişime geçin. Alıcı
                teklifinizi elerse yeniden teklif verebilirsiniz.
              </p>
              <p className="mt-2 text-xs">
                Acil durumlarda teklifinizi geri çekebilirsiniz; ancak bu
                durumda yeniden teklif veremezsiniz.
              </p>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isAuction && !confirmingWithdraw ? (
              <Link href={formHref}>
                <Button type="button">
                  <TrendingDown className="h-4 w-4" />
                  Yeni Teklif Ver (Fiyat Düşür)
                </Button>
              </Link>
            ) : null}
            {confirmingWithdraw ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600">Emin misiniz?</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmingWithdraw(false)}
                  disabled={withdrawMutation.isPending}
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  onClick={handleWithdraw}
                  loading={withdrawMutation.isPending}
                >
                  <Ban className="h-4 w-4" />
                  Geri Çek
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmingWithdraw(true)}
              >
                <Ban className="h-4 w-4" />
                Teklifi Geri Çek
              </Button>
            )}
          </div>
        </>
      ) : null}

      {/* DRAFT + açık ihale → "Devam Et" */}
      {bid.status === "DRAFT" && isOpen ? (
        <Link href={formHref}>
          <Button>
            <Send className="h-4 w-4" />
            Devam Et
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
