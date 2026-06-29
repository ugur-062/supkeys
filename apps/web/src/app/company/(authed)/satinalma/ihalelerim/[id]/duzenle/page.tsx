"use client";

import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { FilesTab } from "@/components/tenders/files-tab";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail, type ListingDetail } from "@/hooks/use-company-listings";
import {
  DEFAULT_FORM_VALUES,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { useParams } from "next/navigation";

/** ISO → datetime-local input ("YYYY-MM-DDTHH:mm", yerel saat). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO → date input ("YYYY-MM-DD"). */
function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Currency = TenderFormData["primaryCurrency"];

/** ListingDetail → wizard form (mapToInput'un tersi). */
function mapDetailToForm(l: ListingDetail): TenderFormData {
  const allowed = (l.allowedCurrencies ?? []).filter(
    Boolean,
  ) as Currency[];
  const primary = (l.primaryCurrency as Currency) ?? "TRY";
  return {
    ...DEFAULT_FORM_VALUES,
    categoryIds: l.categoryIds ?? [],
    title: l.title,
    description: l.description ?? "",
    keywords: l.keywords ?? [],
    type: (l.format as TenderFormData["type"]) ?? "RFQ",
    isInternational: l.isInternational,
    targetCountries: l.targetCountries ?? [],
    visibility: l.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    isLogistics: l.isLogistics ?? false,
    logistics: {
      ...DEFAULT_FORM_VALUES.logistics,
      ...((l.logistics as Record<string, unknown> | null) ?? {}),
    },
    isSealedBid: l.isSealedBid ?? true,
    requireAllItems: l.requireAllItems ?? false,
    requireBidDocument: l.requireBidDocument ?? false,
    primaryCurrency: primary,
    allowedCurrencies: allowed.length > 0 ? allowed : [primary],
    deliveryTerm:
      (l.deliveryTerm as TenderFormData["deliveryTerm"]) ?? undefined,
    paymentTerm: (l.paymentTerm as TenderFormData["paymentTerm"]) ?? "CASH",
    paymentDays: l.paymentDays ?? undefined,
    paymentTiming:
      (l.paymentTiming as TenderFormData["paymentTiming"]) ?? "AFTER_DELIVERY",
    termsAndConditions: l.terms ?? "",
    internalNotes: l.internalNotes ?? "",
    bidsCloseAt: toLocalInput(l.closesAt),
    bidsOpenAt: toLocalInput(l.bidsOpenAt),
    bidVisibility:
      (l.bidVisibility as TenderFormData["bidVisibility"]) ?? "OWN_ONLY",
    priceDecrementType:
      (l.priceDecrementType as TenderFormData["priceDecrementType"]) ??
      undefined,
    priceDecrementValue:
      l.priceDecrementValue != null ? Number(l.priceDecrementValue) : undefined,
    priceDecrementBasis:
      (l.priceDecrementBasis as TenderFormData["priceDecrementBasis"]) ??
      undefined,
    decimalPlaces: l.decimalPlaces ?? 2,
    sendClosingReminder: l.sendClosingReminder ?? false,
    reminderMinutesBefore: l.reminderMinutesBefore ?? undefined,
    autoExtendOnLateBid: l.autoExtendOnLateBid ?? false,
    autoExtendThresholdMin: l.autoExtendThresholdMin ?? undefined,
    autoExtendByMinutes: l.autoExtendByMinutes ?? undefined,
    items:
      l.items && l.items.length > 0
        ? l.items.map((it) => ({
            name: it.name,
            description: it.description ?? "",
            quantity: Number(it.quantity),
            unit: it.unit,
            materialCode: it.materialCode ?? "",
            requiredByDate: toDateInput(it.requiredByDate),
            targetUnitPrice:
              it.targetPrice != null ? Number(it.targetPrice) : undefined,
            customQuestion: "",
            questions: (it.questions ?? []).map((q) => ({
              id: q.id,
              text: q.text,
              answerType: q.answerType,
              required: q.required,
            })),
          }))
        : DEFAULT_FORM_VALUES.items,
    invitedSupplierIds: (l.invitations ?? [])
      .map((iv) => iv.supkeysId)
      .filter((s): s is string => !!s),
  };
}

export default function EditTenderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isLoading } = useListingDetail(id);

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }
  if (!l || !l.isOwner) {
    return (
      <Notice
        title="İhale bulunamadı"
        desc="Bu ihaleyi düzenleme yetkiniz yok."
        href="/company/satinalma/ihalelerim"
      />
    );
  }
  if (l.type !== "ALIM") {
    return (
      <Notice
        title="Bu ekran yalnızca ihaleleri düzenler"
        desc="Satış ilanları kendi düzenleme ekranından güncellenir."
        href={`/company/ilan/${id}`}
      />
    );
  }
  if (!l.canEdit) {
    return (
      <Notice
        title="Düzenlenemez"
        desc="Bu ihaleye teklif verilmiş veya kapanmış; içerik değiştirilemez."
        href={`/company/ilan/${id}`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <TenderWizard
        mode="edit"
        listingId={id}
        initialValues={mapDetailToForm(l)}
      />
      {/* İhale dosyaları — burada yönetilir (detay sayfası salt-okunur). */}
      <div className="mx-auto max-w-3xl">
        <FilesTab listingId={id} isOwner canEdit />
      </div>
    </div>
  );
}

function Notice({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
      <Text className="text-sm text-zinc-500">{desc}</Text>
      <Button href={href} outline>
        Geri Dön
      </Button>
    </div>
  );
}
