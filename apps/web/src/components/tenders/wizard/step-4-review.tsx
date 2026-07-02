"use client";

import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import { useConnections } from "@/hooks/use-company-connections";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { countryName } from "@supkeys/shared";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
} from "@/lib/tenders/labels";
import type {
  Currency,
  DeliveryTerm,
  TenderLogisticsDetails,
} from "@/lib/tenders/types";
import { formatDateTime } from "@/lib/tenders/date";
import { Pencil } from "lucide-react";
import { useFormContext } from "react-hook-form";

interface Props {
  onEditStep: (step: 1 | 2 | 3) => void;
}

const fmtDate = formatDateTime;

/** Adım 4 — Özet & Yayınla. Tüm form özeti, bölüm-bölüm düzenle linkli. */
export function Step4Review({ onEditStep }: Props) {
  const { watch } = useFormContext<TenderFormData>();
  const d = watch();
  const connections = useConnections();

  const invited = (d.invitedSupplierIds ?? [])
    .map(
      (code) =>
        (connections.data ?? []).find((c) => c.company.supkeysId === code)
          ?.company.name ?? code,
    )
    .filter(Boolean);

  const sym = CURRENCY_SYMBOL[d.primaryCurrency as Currency] ?? "";

  return (
    <div className="space-y-5">
      <Section title="Genel Bilgi" onEdit={() => onEditStep(1)}>
        <Row label="İhale Adı" value={d.title || "—"} />
        <Row
          label="Tip"
          value={
            d.listingType === "SATIS"
              ? d.type === "ENGLISH_AUCTION"
                ? "Satış İhalesi — İngiliz Usulü Açık Artırma (en yüksek kazanır)"
                : "Satış İhalesi — RFQ Teklif Toplama (en yüksek kazanır)"
              : d.type === "ENGLISH_AUCTION"
                ? "İngiliz Usulü Açık Eksiltme"
                : "RFQ (Teklif Toplama)"
          }
        />
        {d.listingType === "SATIS" ? (
          <>
            <Row
              label="Taban Fiyat"
              value={
                d.minPrice != null
                  ? `${d.minPrice.toLocaleString("tr-TR")} ${sym}`
                  : "—"
              }
            />
            <Row
              label="Hemen-Al Fiyatı"
              value={
                d.buyNowPrice != null
                  ? `${d.buyNowPrice.toLocaleString("tr-TR")} ${sym}`
                  : "Yok"
              }
            />
          </>
        ) : null}
        <Row label="Kapsam" value={d.isInternational ? "Uluslararası" : "Yurtiçi"} />
        {d.isInternational ? (
          <Row
            label="Hedef Ülkeler"
            value={
              (d.targetCountries ?? []).length === 0
                ? "Tüm ülkeler"
                : (d.targetCountries ?? [])
                    .map((c) => countryName(c))
                    .join(", ")
            }
          />
        ) : null}
        <Row label="Görünürlük" value={d.visibility === "PUBLIC" ? "Herkese Açık" : "Davetli"} />
        {d.description ? <Row label="Açıklama" value={d.description} /> : null}
        {d.keywords?.length ? (
          <Row label="Anahtar Kelimeler" value={d.keywords.join(", ")} />
        ) : null}
        <Row
          label="Para Birimi"
          value={`${d.primaryCurrency}${
            d.allowedCurrencies?.length > 1
              ? ` (+${d.allowedCurrencies.length - 1})`
              : ""
          }`}
        />
        {d.deliveryTerm ? (
          <Row
            label="Teslim Şekli"
            value={DELIVERY_TERM_LABELS[d.deliveryTerm as DeliveryTerm]}
          />
        ) : null}
        <Row
          label="Ödeme"
          value={`${PAYMENT_TERM_LABELS[d.paymentTerm]}${
            d.paymentTerm === "DEFERRED" && d.paymentDays
              ? ` (${d.paymentDays} gün)`
              : ""
          }`}
        />
        <Row label="Kapanış" value={fmtDate(d.bidsCloseAt)} />
        {d.bidsOpenAt ? <Row label="Açılış" value={fmtDate(d.bidsOpenAt)} /> : null}
      </Section>

      {d.isLogistics && d.logistics ? (
        <LogisticsInfoCard
          details={d.logistics as TenderLogisticsDetails}
        />
      ) : null}

      <Section title={`Kalemler (${d.items?.length ?? 0})`} onEdit={() => onEditStep(2)}>
        <div className="overflow-hidden rounded-lg border border-zinc-950/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kalem</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-right font-medium">Hedef Fiyat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(d.items ?? []).map((it, i) => (
                <tr key={it.materialCode || `${it.name}-${i}`}>
                  <td className="px-3 py-2 text-zinc-900">{it.name || "—"}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {it.quantity} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-600">
                    {it.targetUnitPrice != null
                      ? `${sym}${it.targetUnitPrice.toLocaleString("tr-TR")}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Davetli Firmalar (${invited.length})`} onEdit={() => onEditStep(3)}>
        {invited.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Davetli firma yok — sonra davet gönderebilirsin.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {invited.map((name) => (
              <span
                key={name}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
        >
          <Pencil className="h-3 w-3" />
          Düzenle
        </button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-900">{value}</span>
    </div>
  );
}
