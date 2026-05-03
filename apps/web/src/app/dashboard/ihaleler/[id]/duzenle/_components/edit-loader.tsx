"use client";

import { Button } from "@/components/ui/button";
import { useTenderDetail } from "@/hooks/use-tenant-tenders";
import type { TenderFormData } from "@/lib/tenders/form-schema";
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

  if (detail.isError || !detail.data) {
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

  if (tender.status !== "DRAFT") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-warning-600" />
          </div>
          <p className="font-medium text-brand-900">
            Sadece taslak ihaleler düzenlenebilir
          </p>
          <p className="text-sm text-slate-500">
            Bu ihale şu an &ldquo;{tender.status}&rdquo; durumunda.
          </p>
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
    title: tender.title,
    description: tender.description ?? "",
    type: tender.type,
    isSealedBid: tender.isSealedBid,
    requireAllItems: tender.requireAllItems,
    requireBidDocument: tender.requireBidDocument,
    primaryCurrency: tender.primaryCurrency,
    allowedCurrencies: tender.allowedCurrencies,
    decimalPlaces: tender.decimalPlaces,
    deliveryTerm: tender.deliveryTerm ?? undefined,
    deliveryAddress: tender.deliveryAddress ?? "",
    paymentTerm: tender.paymentTerm,
    paymentDays: tender.paymentDays ?? undefined,
    termsAndConditions: tender.termsAndConditions ?? "",
    internalNotes: tender.internalNotes ?? "",
    bidsCloseAt: toDatetimeLocal(tender.bidsCloseAt),
    bidsOpenAt: toDatetimeLocal(tender.bidsOpenAt),
    attachments: tender.attachments.map((a) => ({
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      // V1: dosya URL'i edit drawer'ında yeniden gönderilemiyor (data URL detail
      // payload'ında dönmüyor). Edit modunda mevcut dosyalar korunur — yeni
      // dosya eklenebilir, ama eski dosyalar full-replace nedeniyle silinir.
      // V2'de signed URL ile gerçek persistans gelecek.
      fileUrl: "",
    })),
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

  return <TenderWizard mode="edit" initialData={initialData} />;
}
