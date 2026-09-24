"use client";

import { useTranslations } from "next-intl";
import { RequestDefaultsForm } from "@/components/tenders/request-defaults-form";
import { useDeliveryTermLabel, useFormatPaymentPlan, usePaymentCategoryLabel, useScopeLabel } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { sellerDoorPriceWarning, type RequestDefaults } from "@rothern/shared";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  CreditCardIcon,
  ExclamationCircleIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PencilSquareIcon,
  TruckIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";

type Section = "scope" | "delivery" | "payment" | "currency" | "bids" | "rules";

/**
 * TİCARİ ŞARTLAR PANELİ — sağ rayda, gözden kaçmayacak (2026-09-09 v3).
 *
 * Koyu mavi başlık bandı + tek satır özet cümle; her şart ikonlu satır,
 * EKSİK şart (teslim şekli seçilmemiş) kırmızı ve yayın öncesi uyarır.
 * Satır "değiştir" yalnız o bölümü açar; "Tümünü düzenle" hepsini. "Şartları
 * kaydet" bu talebin şartlarını profile yazar (sonraki taleplerde sorulmaz).
 */
export function TermsPanel({
  value,
  onChange,
  onSaveDefaults,
  saving,
  canSave,
  source,
}: {
  value: RequestDefaults;
  onChange: (next: RequestDefaults) => void;
  onSaveDefaults: () => void;
  saving: boolean;
  canSave: boolean;
  source: "saved" | "last_listing" | "none";
}) {
  const t = useTranslations("web.panel.requests.termsPanel");
  const deliveryTermLabel = useDeliveryTermLabel();
  const paymentCategoryLabel = usePaymentCategoryLabel();
  const formatPaymentPlan = useFormatPaymentPlan();
  const scopeLabel = useScopeLabel();
  const [open, setOpen] = useState<Section | "all" | null>(null);
  const { company } = useCompanyAuth();
  const ownerCountry = company?.country ?? "TR";
  // Teslim noktası tedarikçi kapısı + birden fazla ülkeye açık → teklifler aynı ölçekte olmaz.
  const priceWarning = sellerDoorPriceWarning(value.targetCountries ?? [], ownerCountry, value.deliveryTerm);
  // Teslim şekli etiketi "kısa ad — açıklama" biçimindedir; satırda yalnız kısa ad.
  const delivery = value.deliveryTerm ? deliveryTermLabel(value.deliveryTerm).split(" — ")[0] : null;
  const payment =
    formatPaymentPlan({
      paymentCategory: value.paymentCategory,
      advancePercent: value.advancePercent,
      paymentDays: value.paymentDays,
      lcType: value.lcType,
      lcConfirmed: false,
    }) || paymentCategoryLabel(value.paymentCategory);
  const currency = `${value.primaryCurrency}${value.allowedCurrencies.length > 1 ? ` +${value.allowedCurrencies.filter((c) => c !== value.primaryCurrency).join(", ")}` : ""}`;
  const bidRule = [
    value.isSealedBid ? t("kapaliZarfKurali") : t("acikTeklifKurali"),
    value.bidVisibility === "OWN_RANK" ? t("tedarikciSirasiniGorur") : value.bidVisibility === "OWN_ONLY" ? t("yalnizKendiTeklifiniGorur") : t("enIyiTeklifAcik"),
  ].join(" · ");
  const expectations = [value.requireAllItems ? t("tumKalemlereTeklif") : null, value.requireBidDocument ? t("belgeZorunlu") : null].filter(Boolean).join(" · ");
  const scope = scopeLabel(value.targetCountries ?? [], ownerCountry);

  const rows: { key: Section; icon: typeof TruckIcon; label: string; text: string | null; missing?: boolean }[] = [
    { key: "scope", icon: GlobeAltIcon, label: t("gorunurlukUlkesi"), text: scope },
    { key: "delivery", icon: TruckIcon, label: t("teslimSekli"), text: delivery, missing: !delivery },
    { key: "payment", icon: CreditCardIcon, label: t("odemeKosulu"), text: payment },
    { key: "currency", icon: BanknotesIcon, label: t("paraBirimi"), text: currency },
    { key: "bids", icon: LockClosedIcon, label: t("teklifKurali"), text: bidRule },
    { key: "rules", icon: ClipboardDocumentCheckIcon, label: t("tekliftenBeklenti"), text: expectations || t("ekSartYok") },
  ];
  const missing = rows.filter((r) => r.missing).length;
  const summaryLine = [scope, delivery ?? t("teslimSekliSecilmedi"), payment, value.primaryCurrency, value.isSealedBid ? t("kapaliZarf") : t("acik")].join(" · ");

  return (
    <section aria-labelledby="sartlar-baslik" className={cn("overflow-hidden rounded-2xl bg-white shadow-sm ring-1", missing ? "ring-red-500/40" : "ring-zinc-950/5")}>
      {/* Başlık bandı — koyu mavi: sağ rayda gözden kaçmasın. */}
      <div className="bg-blue-700 px-5 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="sartlar-baslik" className="text-sm font-semibold">
              {t("ticariSartlar")}
            </p>
            <p className="mt-0.5 text-[11px] text-blue-100">{t("buTalebeUygulanirTedarikciTeklifini")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(open === "all" ? null : "all")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-950/35 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-950/50"
          >
            <PencilSquareIcon aria-hidden className="size-3.5" />
            {open === "all" ? t("kapat") : t("tumunuDuzenle")}
          </button>
        </div>
        <p className="mt-2 rounded-lg bg-blue-950/30 px-2.5 py-1.5 text-xs text-white">{summaryLine}</p>
      </div>

      {missing ? (
        <p className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-2 text-xs font-medium text-red-800">
          <ExclamationCircleIcon aria-hidden className="size-4" />
          {t("teslimSekliSecilmedenTalepYayimlanamaz")}
        </p>
      ) : null}

      {open === "all" ? (
        <div className="border-b border-zinc-950/5 bg-zinc-50 p-4">
          <RequestDefaultsForm value={value} onChange={onChange} compact />
        </div>
      ) : (
        // Etiket/değer çifti görsel olarak dl gibi ama ikon + düğme aynı satırda:
        // dl'in doğrudan çocuğu yalnız dt/dd/div olabilir (axe definition-list) → düz div.
        <div className="divide-y divide-zinc-950/5 px-5">
          {rows.map((r) => (
            <div key={r.key} className="py-2.5">
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", r.missing ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700")}>
                  <r.icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{r.label}</div>
                  <div className={cn("text-sm font-medium", r.missing ? "text-red-700" : "text-zinc-950")}>{r.text ?? t("secilmediGerekli")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(open === r.key ? null : r.key)}
                  className={cn("shrink-0 text-xs font-semibold hover:underline", r.missing ? "text-red-700" : "text-blue-700")}
                >
                  {open === r.key ? t("kapat2") : r.missing ? t("sec") : t("degistir")}
                </button>
              </div>
              {open === r.key ? (
                <div className="mt-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
                  <RequestDefaultsForm value={value} onChange={onChange} compact only={[r.key]} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {priceWarning ? (
        <p className="mx-5 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
          {t("teslimNoktasiTedarikcininKapisiFarkli")}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-950/5 bg-zinc-50 px-5 py-3">
        <span className="text-[11px] text-zinc-500">
          {source === "saved" ? t("kaynakTalepSartlariniz") : source === "last_listing" ? t("kaynakSonTalebiniz") : t("kaynakPlatformVarsayilani")}
        </span>
        {canSave ? (
          <button type="button" onClick={onSaveDefaults} disabled={saving || !!missing} className="rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("kaydediliyor") : source === "saved" ? t("varsayilanYap") : t("sartlariKaydet")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
