"use client";

import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
} from "@/lib/tenders/labels";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Check, X } from "lucide-react";

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-brand-900 break-words">{children}</dd>
    </div>
  );
}

function RuleItem({ active, label }: { active: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {active ? (
        <Check className="h-4 w-4 text-success-600" />
      ) : (
        <X className="h-4 w-4 text-slate-400" />
      )}
      <span className={active ? "text-brand-900" : "text-slate-500"}>
        {label}
      </span>
    </li>
  );
}

export function SupplierGeneralInfoTab({
  tender,
}: {
  tender: SupplierTenderDetail;
}) {
  return (
    <div className="space-y-5">
      <section className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Süreç
          </h3>
          <dl className="space-y-3">
            <InfoRow label="Yayın Tarihi">{fmt(tender.publishedAt)}</InfoRow>
            <InfoRow label="Teklif Açılış">{fmt(tender.bidsOpenAt)}</InfoRow>
            <InfoRow label="Teklif Kapanış">{fmt(tender.bidsCloseAt)}</InfoRow>
            <InfoRow label="Para Birimi">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">
                  {tender.primaryCurrency}{" "}
                  {CURRENCY_SYMBOL[tender.primaryCurrency]}
                </span>
                {tender.allowedCurrencies.length > 1 ? (
                  <span className="text-xs text-slate-500">
                    Kabul edilen: {tender.allowedCurrencies.join(", ")}
                  </span>
                ) : null}
              </div>
            </InfoRow>
            <InfoRow label="Ondalık Hassasiyet">
              {tender.decimalPlaces} hane
            </InfoRow>
          </dl>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Teslim & Ödeme
          </h3>
          <dl className="space-y-3">
            <InfoRow label="Teslim Şekli">
              {tender.deliveryTerm
                ? DELIVERY_TERM_LABELS[tender.deliveryTerm]
                : "—"}
            </InfoRow>
            <InfoRow label="Teslimat Adresi">
              <span className="whitespace-pre-wrap">
                {tender.deliveryAddress || "—"}
              </span>
            </InfoRow>
            <InfoRow label="Ödeme">
              {PAYMENT_TERM_LABELS[tender.paymentTerm]}
              {tender.paymentTerm === "DEFERRED" && tender.paymentDays
                ? ` — ${tender.paymentDays} gün`
                : ""}
            </InfoRow>
          </dl>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          İhale Kuralları
        </h3>
        <ul className="space-y-2">
          <RuleItem
            active={tender.isSealedBid}
            label="Kapalı zarf — diğer teklifleri göremezsiniz"
          />
          <RuleItem
            active={tender.requireAllItems}
            label="Tüm kalemlere teklif zorunlu"
          />
          <RuleItem
            active={tender.requireBidDocument}
            label="Teklif dosyası eki zorunlu"
          />
        </ul>
      </section>

      {tender.termsAndConditions ? (
        <section className="card p-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hüküm ve Koşullar
          </h3>
          <p className="text-sm text-brand-900 whitespace-pre-wrap leading-relaxed">
            {tender.termsAndConditions}
          </p>
        </section>
      ) : null}
    </div>
  );
}
