"use client";

// V2-7+ — "İhaleyi Kopyala" akışı.
// Verilen tender ID'sini fetch eder, form değerlerine map edip wizard'ı
// create mode'da template ile başlatır. Tarihler/title sıfırlanır,
// davetli/kalemler/kategoriler kopyalanır.

import { Button } from "@/components/ui/button";
import { useTenderDetail } from "@/hooks/use-tenant-tenders";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { TenderWizard } from "./tender-wizard";

export function CopyLoader({ sourceId }: { sourceId: string }) {
  const detail = useTenderDetail(sourceId);

  const templateData = useMemo<TenderFormData | null>(() => {
    if (!detail.data) return null;
    const t = detail.data;
    return {
      ...DEFAULT_FORM_VALUES,
      // Identifier'lar, tarihler, status'tan bağımsız alanları taşı:
      categoryIds: t.categories?.map((c) => c.id) ?? [],
      title: `${t.title} (Kopya)`,
      description: t.description ?? "",
      keywords: t.keywords ?? [],
      type: t.type,
      isLogistics: t.isLogistics,
      logistics: t.logisticsDetails
        ? {
            transportMode: t.logisticsDetails.transportMode,
            originCity: t.logisticsDetails.originCity,
            originDistrict: t.logisticsDetails.originDistrict ?? "",
            originAddress: t.logisticsDetails.originAddress ?? "",
            destinationCity: t.logisticsDetails.destinationCity,
            destinationDistrict: t.logisticsDetails.destinationDistrict ?? "",
            destinationAddress: t.logisticsDetails.destinationAddress ?? "",
            cargoType: t.logisticsDetails.cargoType,
            weightKg: t.logisticsDetails.weightKg ?? undefined,
            volumeM3: t.logisticsDetails.volumeM3 ?? undefined,
            packageCount: t.logisticsDetails.packageCount ?? undefined,
            vehicleType: t.logisticsDetails.vehicleType ?? "",
            // Kopyada operasyonel tarihler sıfırlanır
            loadingDate: "",
            deliveryDate: "",
            hazardous: t.logisticsDetails.hazardous,
            refrigerated: t.logisticsDetails.refrigerated,
            fragile: t.logisticsDetails.fragile,
            stackable: t.logisticsDetails.stackable,
            notes: t.logisticsDetails.notes ?? "",
          }
        : DEFAULT_FORM_VALUES.logistics,
      isSealedBid: t.isSealedBid,
      requireAllItems: t.requireAllItems,
      requireBidDocument: t.requireBidDocument,
      primaryCurrency: t.primaryCurrency,
      allowedCurrencies:
        t.allowedCurrencies && t.allowedCurrencies.length > 0
          ? t.allowedCurrencies
          : [t.primaryCurrency],
      deliveryTerm: t.deliveryTerm ?? undefined,
      billingAddressId: t.billingAddressSnapshot?.id ?? "",
      deliveryAddressId: t.deliveryAddressSnapshot?.id ?? "",
      paymentTerm: t.paymentTerm,
      paymentDays: t.paymentDays ?? undefined,
      termsAndConditions: t.termsAndConditions ?? "",
      // Dahili not kopyalanmaz — kopya temiz başlasın
      internalNotes: "",
      // Tarihler sıfırlanır — kullanıcı kendisi seçer
      bidsCloseAt: "",
      bidsOpenAt: "",
      // V2-7 açık eksiltme ayarları
      bidVisibility: t.bidVisibility,
      priceDecrementType: t.priceDecrementType ?? undefined,
      priceDecrementValue: t.priceDecrementValue
        ? Number(t.priceDecrementValue)
        : undefined,
      priceDecrementBasis: t.priceDecrementBasis ?? undefined,
      decimalPlaces: t.decimalPlaces,
      sendClosingReminder: t.sendClosingReminder,
      reminderMinutesBefore: t.reminderMinutesBefore,
      autoExtendOnLateBid: t.autoExtendOnLateBid,
      autoExtendThresholdMin: t.autoExtendThresholdMin,
      autoExtendByMinutes: t.autoExtendByMinutes,
      items: t.items.map((it) => ({
        name: it.name,
        description: it.description ?? "",
        quantity: Number(it.quantity),
        unit: it.unit,
        materialCode: it.materialCode ?? "",
        // requiredByDate kopyalanmaz — eski tarih artık geçerli olmayabilir
        requiredByDate: "",
        targetUnitPrice:
          it.targetUnitPrice !== null ? Number(it.targetUnitPrice) : undefined,
        customQuestion: it.customQuestion ?? "",
        questions: it.questions ?? [],
      })),
      invitedSupplierIds: t.invitations.map((i) => i.supplier.id),
    };
  }, [detail.data]);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Kaynak ihale yükleniyor…</p>
      </div>
    );
  }

  if (!detail.data || !templateData) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">
            Kaynak ihale bulunamadı
          </p>
          <p className="text-sm text-slate-500">
            Kopyalamak istediğiniz ihale silinmiş veya size ait olmayabilir.
          </p>
          <Link href="/dashboard/ihaleler/yeni" className="inline-block">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Yeni İhale
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto mb-4 p-3 rounded-xl border border-brand-200 bg-brand-50/60 flex items-center gap-3 text-sm">
        <span className="text-brand-700">
          <strong>{detail.data.tenderNumber}</strong> kopyalanıyor — tarihler
          ve başlık dahil değerleri istediğiniz gibi düzenleyin.
        </span>
      </div>
      <TenderWizard mode="create" initialData={templateData} />
    </>
  );
}
