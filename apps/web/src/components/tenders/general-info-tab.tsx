"use client";

import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import { useCategoriesByIds } from "@/hooks/use-categories";
import type { ListingDetail } from "@/hooks/use-company-listings";
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
import { cn } from "@/lib/utils";
import {
  FileText,
  Gavel,
  Lock,
  ShieldCheck,
  Truck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const fmt = formatDateTime;

const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "Herkese Açık",
  CONNECTIONS: "Bağlantılar",
  PRIVATE: "Davetli (Kapalı)",
};

const BID_VISIBILITY_LABELS: Record<string, string> = {
  OWN_ONLY: "Sadece kendi teklifi",
  BEST_PRICE: "Sadece en iyi teklif",
  OWN_RANK: "Sadece kendi sıralaması",
  BEST_AND_OWN_RANK: "En iyi teklif + kendi sıralaması",
  ALL: "Tüm teklifler ve sıralama",
};

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
          <Icon className="h-4 w-4 text-zinc-700" />
        </div>
        <h3 className="font-semibold text-zinc-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Fact({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-zinc-900">
        {children}
      </dd>
    </div>
  );
}

function RuleChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-400 line-through decoration-zinc-300",
      )}
    >
      {label}
    </span>
  );
}

export function GeneralInfoTab({ l }: { l: ListingDetail }) {
  const categories = useCategoriesByIds(l.categoryIds ?? []);
  const cur = (l.primaryCurrency as Currency) ?? "TRY";
  // İzinli TÜM birimler gösterilir (ana birim önde) — yalnız ana birimi
  // basmak çoklu-birim ihalede "sadece TRY" yanılgısı yaratıyordu.
  const allowedCurrencies = (l.allowedCurrencies as Currency[]) ?? [];
  const currencyList = [
    cur,
    ...allowedCurrencies.filter((c) => c !== cur),
  ];

  return (
    <div className="space-y-5">
      {l.isLogistics && l.logistics ? (
        <LogisticsInfoCard
          details={l.logistics as unknown as TenderLogisticsDetails}
        />
      ) : null}

      {/* Süreç */}
      <Section title="Süreç" icon={Workflow}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label="Sahibi">{l.owner?.name ?? "—"}</Fact>
          {categories.data && categories.data.length > 0 ? (
            <Fact
              label={categories.data.length > 1 ? "Kategoriler" : "Kategori"}
              full
            >
              <ul className="space-y-0.5">
                {categories.data.map((c) => (
                  <li key={c.id} className="font-medium text-zinc-900">
                    {c.nameTr}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          <Fact label="Oluşturulma">{fmt(l.createdAt)}</Fact>
          <Fact label="Teklif Açılış">{fmt(l.bidsOpenAt)}</Fact>
          <Fact label="Teklif Kapanış">{fmt(l.closesAt)}</Fact>
          <Fact label="Kapanış Hatırlatması">
            Kapanışa 60 dk kala (otomatik) — teklif vermemiş davetlilere
          </Fact>
          <Fact
            label={
              currencyList.length > 1 ? "Para Birimleri" : "Para Birimi"
            }
          >
            <span className="flex flex-wrap items-center gap-2">
              {currencyList.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-800"
                >
                  {c} {CURRENCY_SYMBOL[c]}
                  {currencyList.length > 1 && c === cur ? (
                    <span className="ml-1 text-xs font-medium uppercase text-zinc-500">
                      ana
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          </Fact>
          <Fact label="Görünürlük">
            <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-800">
              {VISIBILITY_LABELS[l.visibility] ?? l.visibility}
            </span>
          </Fact>
          <Fact label="Kapsam">
            {l.isInternational ? "Uluslararası" : "Yurtiçi"}
          </Fact>
          <Fact label="Format">
            {l.format === "ENGLISH_AUCTION"
              ? "Pazarlık (Açık Eksiltme)"
              : "Teklif Toplama (Kapalı Zarf)"}
          </Fact>
          {l.isInternational ? (
            <Fact label="Hedef Ülkeler" full>
              {(l.targetCountries ?? []).length === 0
                ? "Tüm ülkeler"
                : (l.targetCountries ?? [])
                    .map((c) => countryName(c))
                    .join(", ")}
            </Fact>
          ) : null}
        </dl>
      </Section>

      {/* Teslim & Ödeme */}
      <Section title="Teslim & Ödeme" icon={Truck}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label="Teslim Şekli">
            {l.deliveryTerm
              ? DELIVERY_TERM_LABELS[l.deliveryTerm as DeliveryTerm]
              : "—"}
          </Fact>
          <Fact label="Ödeme">
            {formatPaymentPlan(l)}
            {/* Teklifçi şartı teklif VERMEDEN görsün: kazanırsa sipariş
                onayından önce teminat mektubu yüklemesi gerekecek. */}
            {l.requireGuaranteeLetter ? " · Teminat mektubu şartlı" : ""}
          </Fact>
          {l.paymentNote ? (
            <Fact label="Ödeme Koşulu Notu" full>
              {l.paymentNote}
            </Fact>
          ) : null}
          {l.deliveryAddress ? (
            <Fact label="Teslimat Adresi" full>
              <span className="font-medium">{l.deliveryAddress.title}</span> —{" "}
              {l.deliveryAddress.addressLine}
              {l.deliveryAddress.district
                ? `, ${l.deliveryAddress.district}`
                : ""}
              {l.deliveryAddress.city ? `, ${l.deliveryAddress.city}` : ""}
            </Fact>
          ) : null}
          {l.billingAddress ? (
            <Fact label="Fatura Adresi" full>
              <span className="font-medium">{l.billingAddress.title}</span> —{" "}
              {l.billingAddress.addressLine}
              {l.billingAddress.city ? `, ${l.billingAddress.city}` : ""}
              {l.billingAddress.taxNumber
                ? ` · VKN: ${l.billingAddress.taxNumber}`
                : ""}
            </Fact>
          ) : null}
        </dl>
      </Section>

      {/* Kurallar */}
      <Section title="Satın Alma Talebi Kuralları" icon={ShieldCheck}>
        <div className="flex flex-wrap gap-2">
          <RuleChip
            active={!!l.isSealedBid}
            label="Kapalı zarf (tedarikçiler arası gizlilik)"
          />
          <RuleChip
            active={!!l.requireAllItems}
            label="Tüm kalemlere teklif zorunlu"
          />
          <RuleChip
            active={!!l.requireBidDocument}
            label="Teklif dosyası eki zorunlu"
          />
        </div>
      </Section>

      {/* Açık Eksiltme Ayarları */}
      {l.format === "ENGLISH_AUCTION" ? (
        <Section title="Açık Eksiltme Ayarları" icon={Gavel}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
            <Fact label="Tedarikçi Görünürlüğü">
              {l.bidVisibility
                ? (BID_VISIBILITY_LABELS[l.bidVisibility] ?? "—")
                : "—"}
            </Fact>
            {/* Minimum pay kaldırıldı (2026-07-13) — kural sabit metin. */}
            <Fact label="Teklif Kuralı">
              Tur başına 1 teklif · kendi öncekinden düşük olmalı
            </Fact>
            <Fact label="Ondalık Basamak">
              {String(l.decimalPlaces ?? 2)}
            </Fact>
            <Fact label="Otomatik Süre Uzatma" full>
              {l.autoExtendOnLateBid
                ? `Son ${l.autoExtendThresholdMin} dk içinde teklif → ${l.autoExtendByMinutes} dk uzar`
                : "Kapalı"}
            </Fact>
          </dl>
        </Section>
      ) : null}

      {/* Hüküm ve Koşullar */}
      {l.terms ? (
        <Section title="Hüküm ve Koşullar" icon={FileText}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {l.terms}
          </p>
        </Section>
      ) : null}

      {/* İhale Notları (şirket içi) */}
      {l.internalNotes ? (
        <section className="rounded-2xl border border-zinc-950/5 bg-zinc-50/50 p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200/70">
              <Lock className="h-4 w-4 text-zinc-700" />
            </div>
            <h3 className="font-semibold text-zinc-900">Satın Alma Talebi Notları</h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-700">
              Şirket içi
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {l.internalNotes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
