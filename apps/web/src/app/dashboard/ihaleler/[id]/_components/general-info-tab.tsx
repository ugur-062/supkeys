"use client";

import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
} from "@/lib/tenders/labels";
import type { TenderAddressSnapshot, TenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Check, Lock, X } from "lucide-react";

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

export function GeneralInfoTab({ tender }: { tender: TenderDetail }) {
  return (
    <div className="space-y-5">
      <section className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Süreç
          </h3>
          <dl className="space-y-3">
            <InfoRow label="Sahibi">
              {tender.createdBy.firstName} {tender.createdBy.lastName}
            </InfoRow>
            {tender.categories && tender.categories.length > 0 ? (
              <InfoRow
                label={
                  tender.categories.length > 1 ? "Kategoriler" : "Kategori"
                }
              >
                <ul className="space-y-0.5">
                  {tender.categories.map((c) => (
                    <li key={c.id} className="text-brand-900 font-medium">
                      {c.breadcrumb}
                    </li>
                  ))}
                </ul>
              </InfoRow>
            ) : null}
            <InfoRow label="Oluşturulma">{fmt(tender.createdAt)}</InfoRow>
            <InfoRow label="Yayın Tarihi">{fmt(tender.publishedAt)}</InfoRow>
            <InfoRow label="Teklif Açılış">{fmt(tender.bidsOpenAt)}</InfoRow>
            <InfoRow label="Teklif Kapanış">{fmt(tender.bidsCloseAt)}</InfoRow>
            <InfoRow label="Para Birimi">
              <span className="font-semibold">
                {tender.primaryCurrency} {CURRENCY_SYMBOL[tender.primaryCurrency]}
              </span>
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
            {tender.billingAddressSnapshot ? (
              <InfoRow label="Fatura Adresi">
                <AddressSnapshotDisplay
                  snapshot={tender.billingAddressSnapshot}
                />
              </InfoRow>
            ) : null}
            <InfoRow label="Teslimat Adresi">
              {tender.deliveryAddressSnapshot ? (
                <AddressSnapshotDisplay
                  snapshot={tender.deliveryAddressSnapshot}
                />
              ) : (
                <span className="whitespace-pre-wrap">
                  {tender.deliveryAddress || "—"}
                </span>
              )}
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
          <RuleItem active={tender.isSealedBid} label="Kapalı zarf (tedarikçiler arası gizlilik)" />
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

      {/* V2-7 — İngiliz Usulü açık eksiltme ayarları (sadece bu tipte göster) */}
      {tender.type === "ENGLISH_AUCTION" ? (
        <section className="card p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Açık Eksiltme Ayarları
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <InfoRow label="Tedarikçi Görünürlüğü">
              {{
                OWN_ONLY: "Sadece kendi teklifi",
                BEST_PRICE: "Sadece en iyi teklif",
                OWN_RANK: "Sadece kendi sıralaması",
                BEST_AND_OWN_RANK: "En iyi teklif + kendi sıralaması",
                ALL: "Tüm teklifler ve sıralama",
              }[tender.bidVisibility] ?? "—"}
            </InfoRow>
            <InfoRow label="Min. Fiyat Azaltma">
              {tender.priceDecrementType && tender.priceDecrementValue
                ? tender.priceDecrementType === "PERCENT"
                  ? `%${Number(tender.priceDecrementValue)} (kendi son teklifine göre)`
                  : `${Number(tender.priceDecrementValue)} ${tender.primaryCurrency} (kendi son teklifine göre)`
                : "—"}
            </InfoRow>
            <InfoRow label="Ondalık Basamak">{String(tender.decimalPlaces)}</InfoRow>
            <InfoRow label="Otomatik Süre Uzatma">
              {tender.autoExtendOnLateBid
                ? `Son ${tender.autoExtendThresholdMin}dk içinde teklif → ${tender.autoExtendByMinutes}dk uzar`
                : "Kapalı"}
            </InfoRow>
          </dl>
        </section>
      ) : null}

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

      {tender.internalNotes ? (
        <section className="card p-5 space-y-2 bg-slate-50/40">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              İhale Notları
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-semibold uppercase tracking-wide">
              <Lock className="h-2.5 w-2.5" />
              Şirket içi
            </span>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {tender.internalNotes}
          </p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * E.7.B — Tender oluşturma anında snapshot'lanmış adresi formatlı göster.
 * Adres sonradan değişse veya silinse bile burada eski hali kalır.
 */
function AddressSnapshotDisplay({
  snapshot,
}: {
  snapshot: TenderAddressSnapshot;
}) {
  return (
    <div className="space-y-0.5 text-sm">
      <p className="font-semibold text-brand-900">{snapshot.title}</p>
      <p className="text-slate-700 whitespace-pre-line">
        {snapshot.fullAddress}
      </p>
      <p className="text-slate-600">
        {snapshot.district} / {snapshot.city}
        {snapshot.postalCode ? ` · ${snapshot.postalCode}` : ""}
      </p>
      {snapshot.taxOffice && snapshot.taxNumber ? (
        <p className="text-xs text-slate-500 mt-1">
          Vergi Dairesi: {snapshot.taxOffice} · VKN: {snapshot.taxNumber}
        </p>
      ) : null}
      {snapshot.contactName ? (
        <p className="text-xs text-slate-500">
          İletişim: {snapshot.contactName}
          {snapshot.contactPhone ? ` · ${snapshot.contactPhone}` : ""}
        </p>
      ) : null}
    </div>
  );
}
