"use client";

import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
  PAYMENT_TIMING_LABELS,
} from "@/lib/tenders/labels";
import type { TenderAddressSnapshot, TenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Check,
  FileText,
  Gavel,
  Lock,
  MapPin,
  ShieldCheck,
  Truck,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

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
    <section className="rounded-2xl border border-zinc-950/5 bg-white p-5 md:p-6">
      <div className="mb-5 flex items-center gap-2.5">
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
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-zinc-900 break-words">
        {children}
      </dd>
    </div>
  );
}

function RuleChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-400 line-through decoration-zinc-300",
      )}
    >
      {active ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      {label}
    </span>
  );
}

export function GeneralInfoTab({ tender }: { tender: TenderDetail }) {
  return (
    <div className="space-y-5">
      {tender.isLogistics && tender.logisticsDetails ? (
        <LogisticsInfoCard details={tender.logisticsDetails} />
      ) : null}

      {/* Süreç */}
      <Section title="Süreç" icon={Workflow}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label="Sahibi">
            {tender.createdBy.firstName} {tender.createdBy.lastName}
          </Fact>
          {tender.categories && tender.categories.length > 0 ? (
            <Fact
              label={tender.categories.length > 1 ? "Kategoriler" : "Kategori"}
              full
            >
              <ul className="space-y-0.5">
                {tender.categories.map((c) => (
                  <li key={c.id} className="font-medium text-zinc-900">
                    {c.breadcrumb}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          <Fact label="Oluşturulma">{fmt(tender.createdAt)}</Fact>
          <Fact label="Yayın Tarihi">{fmt(tender.publishedAt)}</Fact>
          <Fact label="Teklif Açılış">{fmt(tender.bidsOpenAt)}</Fact>
          <Fact label="Teklif Kapanış">{fmt(tender.bidsCloseAt)}</Fact>
          <Fact label="Para Birimi">
            <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-800">
              {tender.primaryCurrency} {CURRENCY_SYMBOL[tender.primaryCurrency]}
            </span>
          </Fact>
        </dl>
      </Section>

      {/* Teslim & Ödeme */}
      <Section title="Teslim & Ödeme" icon={Truck}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label="Teslim Şekli">
            {tender.deliveryTerm
              ? DELIVERY_TERM_LABELS[tender.deliveryTerm]
              : "—"}
          </Fact>
          <Fact label="Ödeme">
            {PAYMENT_TERM_LABELS[tender.paymentTerm]}
            {tender.paymentTerm === "DEFERRED" && tender.paymentDays
              ? ` — ${tender.paymentDays} gün`
              : ""}
            {` · ${PAYMENT_TIMING_LABELS[tender.paymentTiming]}`}
          </Fact>
          <Fact label="Teslimat Adresi" full>
            {tender.deliveryAddressSnapshot ? (
              <AddressSnapshotDisplay
                snapshot={tender.deliveryAddressSnapshot}
              />
            ) : (
              <span className="whitespace-pre-wrap">
                {tender.deliveryAddress || "—"}
              </span>
            )}
          </Fact>
          {tender.billingAddressSnapshot ? (
            <Fact label="Fatura Adresi" full>
              <AddressSnapshotDisplay
                snapshot={tender.billingAddressSnapshot}
              />
            </Fact>
          ) : null}
        </dl>
      </Section>

      {/* Kurallar */}
      <Section title="İhale Kuralları" icon={ShieldCheck}>
        <div className="flex flex-wrap gap-2">
          <RuleChip
            active={tender.isSealedBid}
            label="Kapalı zarf (tedarikçiler arası gizlilik)"
          />
          <RuleChip
            active={tender.requireAllItems}
            label="Tüm kalemlere teklif zorunlu"
          />
          <RuleChip
            active={tender.requireBidDocument}
            label="Teklif dosyası eki zorunlu"
          />
        </div>
      </Section>

      {/* V2-7 — İngiliz Usulü açık eksiltme ayarları (sadece bu tipte göster) */}
      {tender.type === "ENGLISH_AUCTION" ? (
        <Section title="Açık Eksiltme Ayarları" icon={Gavel}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
            <Fact label="Tedarikçi Görünürlüğü">
              {{
                OWN_ONLY: "Sadece kendi teklifi",
                BEST_PRICE: "Sadece en iyi teklif",
                OWN_RANK: "Sadece kendi sıralaması",
                BEST_AND_OWN_RANK: "En iyi teklif + kendi sıralaması",
                ALL: "Tüm teklifler ve sıralama",
              }[tender.bidVisibility] ?? "—"}
            </Fact>
            <Fact label="Min. Fiyat Azaltma">
              {tender.priceDecrementType && tender.priceDecrementValue
                ? tender.priceDecrementType === "PERCENT"
                  ? `%${Number(tender.priceDecrementValue)} (son teklife göre)`
                  : `${Number(tender.priceDecrementValue)} ${tender.primaryCurrency} (son teklife göre)`
                : "—"}
            </Fact>
            <Fact label="Ondalık Basamak">
              {String(tender.decimalPlaces)}
            </Fact>
            <Fact label="Otomatik Süre Uzatma" full>
              {tender.autoExtendOnLateBid
                ? `Son ${tender.autoExtendThresholdMin} dk içinde teklif → ${tender.autoExtendByMinutes} dk uzar`
                : "Kapalı"}
            </Fact>
          </dl>
        </Section>
      ) : null}

      {tender.termsAndConditions ? (
        <Section title="Hüküm ve Koşullar" icon={FileText}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {tender.termsAndConditions}
          </p>
        </Section>
      ) : null}

      {tender.internalNotes ? (
        <section className="rounded-2xl border border-zinc-950/5 bg-zinc-50/50 p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200/70">
              <Lock className="h-4 w-4 text-zinc-700" />
            </div>
            <h3 className="font-semibold text-zinc-900">İhale Notları</h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
              Şirket içi
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
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
    <div className="flex items-start gap-2">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="space-y-0.5 text-sm font-normal">
        <p className="font-semibold text-zinc-900">{snapshot.title}</p>
        <p className="whitespace-pre-line text-zinc-700">
          {snapshot.fullAddress}
        </p>
        <p className="text-zinc-600">
          {snapshot.district} / {snapshot.city}
          {snapshot.postalCode ? ` · ${snapshot.postalCode}` : ""}
        </p>
        {snapshot.taxOffice && snapshot.taxNumber ? (
          <p className="mt-1 text-xs text-slate-500">
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
    </div>
  );
}
