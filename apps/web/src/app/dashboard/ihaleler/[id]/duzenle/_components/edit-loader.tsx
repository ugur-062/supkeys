"use client";

import { Button } from "@/components/ui/button";
import { useTenderDetail } from "@/hooks/use-tenant-tenders";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { tenderStatusLabel } from "@/lib/tenders/labels";
import { format } from "date-fns";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { TenderWizard } from "../../../yeni/_components/tender-wizard";

interface Props {
  id: string;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function EditLoader({ id }: Props) {
  const detail = useTenderDetail(id);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">İhale yükleniyor…</p>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">İhale bulunamadı</p>
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

  const isDraft = tender.status === "DRAFT";
  const isEditableOpen =
    tender.status === "OPEN_FOR_BIDS" && tender.bidStats.submitted === 0;

  if (!isDraft && !isEditableOpen) {
    const reason =
      tender.status === "OPEN_FOR_BIDS"
        ? "Bu ihaleye teklif gönderilmiş; teklif aldıktan sonra ihale düzenlenemez."
        : `Bu ihale şu an "${tenderStatusLabel(tender.status)}" durumunda.`;
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-warning-600" />
          </div>
          <p className="font-medium text-brand-900">
            Bu ihale düzenlenemez
          </p>
          <p className="text-sm text-slate-500">{reason}</p>
          <Link
            href={`/dashboard/ihaleler/${tender.id}`}
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

  // Map server tender → form values
  const initialData: TenderFormData & { id: string } = {
    id: tender.id,
    // V2-6 — kategoriler (multi); V1 backward-compat: legacy ihalelerde boş array
    categoryIds: tender.categories?.map((c) => c.id) ?? [],
    title: tender.title,
    description: tender.description ?? "",
    keywords: tender.keywords ?? [],
    type: tender.type,
    isSealedBid: tender.isSealedBid,
    requireAllItems: tender.requireAllItems,
    requireBidDocument: tender.requireBidDocument,
    primaryCurrency: tender.primaryCurrency,
    allowedCurrencies:
      tender.allowedCurrencies && tender.allowedCurrencies.length > 0
        ? tender.allowedCurrencies
        : [tender.primaryCurrency],
    deliveryTerm: tender.deliveryTerm ?? undefined,
    // E.7.B — snapshot'tan adres ID'si. Snapshot yoksa boş bırak (kullanıcı dropdown'dan
    // yeniden seçer). Snapshot ID'si silinmiş bir adresi gösteriyorsa kullanıcı yeni
    // adres seçmek zorunda kalır.
    billingAddressId: tender.billingAddressSnapshot?.id ?? "",
    deliveryAddressId: tender.deliveryAddressSnapshot?.id ?? "",
    paymentTerm: tender.paymentTerm,
    paymentDays: tender.paymentDays ?? undefined,
    termsAndConditions: tender.termsAndConditions ?? "",
    internalNotes: tender.internalNotes ?? "",
    bidsCloseAt: toDatetimeLocal(tender.bidsCloseAt),
    bidsOpenAt: toDatetimeLocal(tender.bidsOpenAt),
    // V2-7 — Açık eksiltme alanları
    bidVisibility: tender.bidVisibility,
    priceDecrementType: tender.priceDecrementType ?? undefined,
    priceDecrementValue: tender.priceDecrementValue
      ? Number(tender.priceDecrementValue)
      : undefined,
    priceDecrementBasis: tender.priceDecrementBasis ?? undefined,
    decimalPlaces: tender.decimalPlaces,
    sendClosingReminder: tender.sendClosingReminder,
    reminderMinutesBefore: tender.reminderMinutesBefore,
    autoExtendOnLateBid: tender.autoExtendOnLateBid,
    autoExtendThresholdMin: tender.autoExtendThresholdMin,
    autoExtendByMinutes: tender.autoExtendByMinutes,
    items: tender.items.map((it) => ({
      name: it.name,
      description: it.description ?? "",
      quantity: Number(it.quantity),
      unit: it.unit,
      materialCode: it.materialCode ?? "",
      requiredByDate: toDateInput(it.requiredByDate),
      targetUnitPrice:
        it.targetUnitPrice !== null
          ? Number(it.targetUnitPrice)
          : undefined,
      customQuestion: it.customQuestion ?? "",
    })),
    invitedSupplierIds: tender.invitations.map((i) => i.supplier.id),
  };

  return (
    <>
      {isEditableOpen ? (
        <div className="max-w-5xl mx-auto mb-4 p-4 rounded-xl border border-warning-200 bg-warning-50/70 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-warning-800">
              Yayınlanmış ihale düzenleniyor
            </p>
            <p className="text-warning-700 mt-0.5 leading-relaxed">
              Bu ihale yayında ve henüz teklif gönderilmemiş. Kaydettiğinizde
              mevcut davetler, kalemler ve dosyalar değiştirilir; tedarikçilere
              güncel davet e-postaları yeniden gönderilir.
            </p>
          </div>
        </div>
      ) : null}
      <TenderWizard mode="edit" initialData={initialData} />
    </>
  );
}
