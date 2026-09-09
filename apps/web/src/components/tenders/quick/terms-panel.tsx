"use client";

import { RequestDefaultsForm, VISIBILITY_LABELS } from "@/components/tenders/request-defaults-form";
import { DELIVERY_TERM_LABELS, PAYMENT_CATEGORY_LABELS, formatPaymentPlan } from "@/lib/tenders/labels";
import type { DeliveryTerm, PaymentCategory } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import type { RequestDefaults } from "@rothern/shared";
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
  const [open, setOpen] = useState<Section | "all" | null>(null);
  const delivery = value.deliveryTerm ? (DELIVERY_TERM_LABELS[value.deliveryTerm as DeliveryTerm] ?? value.deliveryTerm).split(" — ")[0] : null;
  const payment =
    formatPaymentPlan({
      paymentCategory: value.paymentCategory as PaymentCategory,
      advancePercent: value.advancePercent,
      paymentDays: value.paymentDays,
      lcType: value.lcType as "SIGHT" | "USANCE" | null,
      lcConfirmed: false,
    }) || PAYMENT_CATEGORY_LABELS[value.paymentCategory as PaymentCategory];
  const currency = `${value.primaryCurrency}${value.allowedCurrencies.length > 1 ? ` +${value.allowedCurrencies.filter((c) => c !== value.primaryCurrency).join(", ")}` : ""}`;
  const bidRule = `${value.isSealedBid ? "Kapalı zarf" : "Açık teklif"} · ${
    value.bidVisibility === "OWN_RANK" ? "tedarikçi sırasını görür" : value.bidVisibility === "OWN_ONLY" ? "yalnız kendi teklifini görür" : "en iyi teklif açık"
  }`;
  const expectations = [value.requireAllItems ? "tüm kalemlere teklif" : null, value.requireBidDocument ? "belge zorunlu" : null].filter(Boolean).join(" · ");

  const rows: { key: Section; icon: typeof TruckIcon; label: string; text: string | null; missing?: boolean }[] = [
    { key: "scope", icon: GlobeAltIcon, label: "Kapsam", text: value.isInternational ? "Uluslararası" : "Yurtiçi" },
    { key: "delivery", icon: TruckIcon, label: "Teslim şekli", text: delivery, missing: !delivery },
    { key: "payment", icon: CreditCardIcon, label: "Ödeme koşulu", text: payment },
    { key: "currency", icon: BanknotesIcon, label: "Para birimi", text: currency },
    { key: "bids", icon: LockClosedIcon, label: "Teklif kuralı", text: bidRule },
    { key: "rules", icon: ClipboardDocumentCheckIcon, label: "Tekliften beklenti", text: expectations || "Ek şart yok" },
  ];
  const missing = rows.filter((r) => r.missing).length;
  const summaryLine = [value.isInternational ? "Uluslararası" : "Yurtiçi", delivery ?? "teslim şekli seçilmedi", payment, value.primaryCurrency, value.isSealedBid ? "kapalı zarf" : "açık"].join(" · ");

  return (
    <section aria-labelledby="sartlar-baslik" className={cn("overflow-hidden rounded-2xl bg-white shadow-sm ring-1", missing ? "ring-red-500/40" : "ring-zinc-950/5")}>
      {/* Başlık bandı — koyu mavi: sağ rayda gözden kaçmasın. */}
      <div className="bg-blue-700 px-5 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="sartlar-baslik" className="text-sm font-semibold">
              Ticari şartlar
            </p>
            <p className="mt-0.5 text-[11px] text-blue-100">Bu talebe uygulanır — tedarikçi teklifini bunlara göre verir.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(open === "all" ? null : "all")}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25"
          >
            <PencilSquareIcon aria-hidden className="size-3.5" />
            {open === "all" ? "Kapat" : "Tümünü düzenle"}
          </button>
        </div>
        <p className="mt-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-blue-50">{summaryLine}</p>
      </div>

      {missing ? (
        <p className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-2 text-xs font-medium text-red-800">
          <ExclamationCircleIcon aria-hidden className="size-4" />
          Teslim şekli seçilmeden talep yayımlanamaz.
        </p>
      ) : null}

      {open === "all" ? (
        <div className="border-b border-zinc-950/5 bg-zinc-50 p-4">
          <RequestDefaultsForm value={value} onChange={onChange} compact />
        </div>
      ) : (
        <dl className="divide-y divide-zinc-950/5 px-5">
          {rows.map((r) => (
            <div key={r.key} className="py-2.5">
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", r.missing ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700")}>
                  <r.icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{r.label}</dt>
                  <dd className={cn("text-sm font-medium", r.missing ? "text-red-700" : "text-zinc-950")}>{r.text ?? "Seçilmedi — gerekli"}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(open === r.key ? null : r.key)}
                  className={cn("shrink-0 text-xs font-semibold hover:underline", r.missing ? "text-red-700" : "text-blue-700")}
                >
                  {open === r.key ? "kapat" : r.missing ? "seç" : "değiştir"}
                </button>
              </div>
              {open === r.key ? (
                <div className="mt-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
                  <RequestDefaultsForm value={value} onChange={onChange} compact only={[r.key]} />
                </div>
              ) : null}
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-950/5 bg-zinc-50 px-5 py-3">
        <span className="text-[11px] text-zinc-500">
          {source === "saved" ? "Kaynak: talep şartlarınız" : source === "last_listing" ? "Kaynak: son talebiniz" : "Kaynak: platform varsayılanı"}
        </span>
        {canSave ? (
          <button type="button" onClick={onSaveDefaults} disabled={saving || !!missing} className="rounded-full bg-zinc-950 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : source === "saved" ? "Varsayılan yap" : "Şartları kaydet"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export { VISIBILITY_LABELS };
