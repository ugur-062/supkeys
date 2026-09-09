"use client";

import { RequestDefaultsForm, VISIBILITY_LABELS } from "@/components/tenders/request-defaults-form";
import { useAddresses } from "@/hooks/use-company-addresses";
import { DELIVERY_TERM_LABELS, PAYMENT_CATEGORY_LABELS, formatPaymentPlan } from "@/lib/tenders/labels";
import type { DeliveryTerm, PaymentCategory } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import type { RequestDefaults } from "@rothern/shared";
import { useState } from "react";

type Section = "scope" | "delivery" | "payment" | "currency" | "bids" | "rules";

/**
 * ŞARTLAR PANELİ — ticari profilin özeti + satır içi "değiştir" (2026-09-09).
 * Kararı bir kez verdirir: her satır profilden gelir, yalnız istenen satır
 * açılır. "Varsayılan yap" bu talebin şartlarını profile yazar.
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
  const [open, setOpen] = useState<Section | null>(null);
  const addresses = useAddresses();
  const rows: { key: Section; label: string; text: string }[] = [
    { key: "scope", label: "Kapsam", text: value.isInternational ? "Uluslararası" : "Yurtiçi" },
    { key: "delivery", label: "Teslim şekli", text: value.deliveryTerm ? (DELIVERY_TERM_LABELS[value.deliveryTerm as DeliveryTerm] ?? value.deliveryTerm).split(" — ")[0] : "Seçilmedi" },
    {
      key: "payment",
      label: "Ödeme",
      text: formatPaymentPlan({
        paymentCategory: value.paymentCategory as PaymentCategory,
        advancePercent: value.advancePercent,
        paymentDays: value.paymentDays,
        lcType: value.lcType as "SIGHT" | "USANCE" | null,
        lcConfirmed: false,
      }) || PAYMENT_CATEGORY_LABELS[value.paymentCategory as PaymentCategory],
    },
    { key: "currency", label: "Para birimi", text: `${value.primaryCurrency}${value.allowedCurrencies.length > 1 ? ` (+${value.allowedCurrencies.filter((c) => c !== value.primaryCurrency).join(", ")})` : ""}` },
    { key: "bids", label: "Teklif kuralı", text: `${value.isSealedBid ? "Kapalı zarf" : "Açık"} · ${value.bidVisibility === "OWN_RANK" ? "sıralamasını görür" : value.bidVisibility === "OWN_ONLY" ? "yalnız kendi teklifi" : "en iyi teklif açık"}` },
    { key: "rules", label: "Beklenti", text: [value.requireAllItems ? "tüm kalemler" : null, value.requireBidDocument ? "belge zorunlu" : null].filter(Boolean).join(" · ") || "Ek şart yok" },
  ];
  void addresses;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-950">Şartlar</p>
        <span className="text-[11px] text-zinc-500">
          {source === "saved" ? "Talep şartlarınızdan" : source === "last_listing" ? "Son talebinizden" : "Platform varsayılanı"}
        </span>
      </div>
      <dl className="mt-3 divide-y divide-zinc-950/5">
        {rows.map((r) => (
          <div key={r.key} className="py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{r.label}</dt>
                <dd className={cn("truncate text-sm", r.text === "Seçilmedi" ? "text-amber-700" : "text-zinc-900")}>{r.text}</dd>
              </div>
              <button
                type="button"
                onClick={() => setOpen(open === r.key ? null : r.key)}
                className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
              >
                {open === r.key ? "kapat" : "değiştir"}
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
      {canSave ? (
        <button
          type="button"
          onClick={onSaveDefaults}
          disabled={saving}
          className="mt-3 w-full rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? "Kaydediliyor…" : source === "saved" ? "Bu şartları varsayılan yap" : "Bu şartları kaydet — bir daha sorma"}
        </button>
      ) : null}
    </div>
  );
}
