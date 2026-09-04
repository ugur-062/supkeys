"use client";

import { entityLabels } from "@/lib/company/terms";

import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import { useConnections } from "@/hooks/use-company-connections";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { countryName } from "@rothern/shared";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  formatPaymentPlan,
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
  /** Create modu: yayın/taslakta yüklenecek staged döküman sayısı. */
  stagedDocsCount?: number;
}

const fmtDate = formatDateTime;

/** Adım 4 — Özet & Yayınla. Tüm form özeti, bölüm-bölüm düzenle linkli. */
export function Step4Review({ onEditStep, stagedDocsCount }: Props) {
  const { watch } = useFormContext<TenderFormData>();
  const d = watch();
  const L = entityLabels();
  const coverItem = (d.items ?? []).find((it) => (it.images?.length ?? 0) > 0);
  const connections = useConnections();

  const invited = (d.invitedSupplierIds ?? [])
    .map(
      (code) =>
        (connections.data ?? []).find((c) => c.company.rothernId === code)
          ?.company.name ?? code,
    )
    .filter(Boolean);

  const sym = CURRENCY_SYMBOL[d.primaryCurrency as Currency] ?? "";

  return (
    <div className="space-y-5">
      <Section title="Genel Bilgi" onEdit={() => onEditStep(2)}>
        <Row label={`${L.entityShort} Adı`} value={d.title || "—"} />
        {/* Kapak: katalogdan eklenen İLK ürünün görselinden türer; kullanıcı
            burada görür. TODO(2b-ikinci aşama): "Kapağı değiştir" ile
            katalogdaki başka bir ürün görseli seçilebilsin. */}
        {coverItem ? (
          <Row label="Kapak" value={`${coverItem.name} görselinden`} />
        ) : null}
        <Row
          label="Tip"
          value={
            d.type === "ENGLISH_AUCTION"
              ? "Pazarlık (Açık Eksiltme)"
              : "Teklif Toplama (Kapalı Zarf)"
          }
        />
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
        {/* Tüm birimler açık yazılır (ana birim önde) — "(+2)" kısaltması
            hangi birimlerin seçili olduğunu gizliyordu. */}
        <Row
          label={
            (d.allowedCurrencies?.length ?? 0) > 1
              ? "Para Birimleri"
              : "Para Birimi"
          }
          value={[
            d.primaryCurrency,
            ...(d.allowedCurrencies ?? []).filter(
              (c) => c !== d.primaryCurrency,
            ),
          ].join(", ")}
        />
        {d.deliveryTerm ? (
          <Row
            label="Teslim Şekli"
            value={DELIVERY_TERM_LABELS[d.deliveryTerm as DeliveryTerm]}
          />
        ) : null}
        <Row label="Ödeme" value={formatPaymentPlan(d)} />
        <Row label="Kapanış" value={fmtDate(d.bidsCloseAt)} />
        {d.bidsOpenAt ? <Row label="Açılış" value={fmtDate(d.bidsOpenAt)} /> : null}
        {stagedDocsCount != null && stagedDocsCount > 0 ? (
          <Row
            label={L.docs}
            value={`${stagedDocsCount} dosya — yayınlanınca yüklenecek`}
          />
        ) : null}
      </Section>

      {d.isLogistics && d.logistics ? (
        <LogisticsInfoCard
          details={d.logistics as TenderLogisticsDetails}
        />
      ) : null}

      <Section title={`Kalemler (${d.items?.length ?? 0})`} onEdit={() => onEditStep(1)}>
        <div className="overflow-x-auto rounded-lg border border-zinc-950/10">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Kalem</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Miktar</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Hedef Fiyat
                </th>
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
            {/* PUBLIC'te davetsizlik doğal durumdur — "davetli yok" uyarı gibi
                okunuyordu; ihalenin zaten herkese açık olduğu söylenir. */}
            {d.visibility === "PUBLIC"
              ? `${L.entity} herkese açık — davet gerekmez; kategorinize uygun premium ${L.counterpartyPluralLower} görüp teklif verebilir. İsterseniz sonradan da davet gönderebilirsiniz.`
              : "Davetli firma yok — sonra davet gönderebilirsiniz."}
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
