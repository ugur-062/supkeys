"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import { useCategoriesByIds } from "@/hooks/use-categories";
import type { ListingDetail } from "@/hooks/use-company-listings";
import {
  countryDisplayName,
  useDeliveryTermLabel,
  useFormatPaymentPlan,
  useScopeLabel,
} from "@/i18n/domain";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency, TenderLogisticsDetails } from "@/lib/tenders/types";
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
  const t = useTranslations("web.panel.requests.generalInfoTab");
  const locale = useLocale() as Locale;
  const scopeLabel = useScopeLabel();
  const deliveryTermLabel = useDeliveryTermLabel();
  const formatPaymentPlan = useFormatPaymentPlan();
  // Görünürlük / tedarikçi görünürlüğü kodları → katalog (bilinmeyen kod ham).
  const visibilityLabel = (v: string) => (t.has(`visibility.${v}` as never) ? t(`visibility.${v}` as never) : v);
  const bidVisibilityLabel = (v: string) => (t.has(`bidVisibility.${v}` as never) ? t(`bidVisibility.${v}` as never) : "—");
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
      <Section title={t("surec")} icon={Workflow}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label={t("sahibi")}>{l.owner?.name ?? "—"}</Fact>
          {categories.data && categories.data.length > 0 ? (
            <Fact
              label={categories.data.length > 1 ? t("kategoriler") : t("kategori")}
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
          <Fact label={t("olusturulma")}>{fmt(l.createdAt)}</Fact>
          <Fact label={t("teklifAcilis")}>{fmt(l.bidsOpenAt)}</Fact>
          <Fact label={t("teklifKapanis")}>{fmt(l.closesAt)}</Fact>
          <Fact label={t("kapanisHatirlatmasi")}>
            {t("kapanisa60DkKalaOtomatik")}
          </Fact>
          <Fact
            label={
              currencyList.length > 1 ? t("paraBirimleri") : t("paraBirimi")
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
                      {t("ana")}
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          </Fact>
          <Fact label={t("gorunurluk")}>
            <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-800">
              {visibilityLabel(l.visibility)}
            </span>
          </Fact>
          <Fact label={t("gorunurluk")}>
            {scopeLabel(l.targetCountries ?? [])}
          </Fact>
          <Fact label={t("format")}>
            {l.format === "ENGLISH_AUCTION"
              ? t("pazarlikAcikEksiltme")
              : t("teklifToplamaKapaliZarf")}
          </Fact>
          {(l.targetCountries ?? []).length > 2 ? (
            <Fact label={t("gorunurlukUlkeleri")} full>
              {(l.targetCountries ?? []).map((c) => countryDisplayName(c, locale)).join(", ")}
            </Fact>
          ) : null}
        </dl>
      </Section>

      {/* Teslim & Ödeme */}
      <Section title={t("teslimOdeme")} icon={Truck}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
          <Fact label={t("teslimSekli")}>
            {l.deliveryTerm ? deliveryTermLabel(l.deliveryTerm) : "—"}
          </Fact>
          <Fact label={t("odeme")}>
            {formatPaymentPlan(l)}
            {/* Teklifçi şartı teklif VERMEDEN görsün: kazanırsa sipariş
                onayından önce teminat mektubu yüklemesi gerekecek. */}
            {l.requireGuaranteeLetter ? t("teminatMektubuSartli") : ""}
          </Fact>
          {l.paymentNote ? (
            <Fact label={t("odemeKosuluNotu")} full>
              {l.paymentNote}
            </Fact>
          ) : null}
          {l.deliveryAddress ? (
            <Fact label={t("teslimatAdresi")} full>
              <span className="font-medium">{l.deliveryAddress.title}</span> —{" "}
              {l.deliveryAddress.addressLine}
              {l.deliveryAddress.district
                ? `, ${l.deliveryAddress.district}`
                : ""}
              {l.deliveryAddress.city ? `, ${l.deliveryAddress.city}` : ""}
            </Fact>
          ) : null}
          {l.billingAddress ? (
            <Fact label={t("faturaAdresi")} full>
              <span className="font-medium">{l.billingAddress.title}</span> —{" "}
              {l.billingAddress.addressLine}
              {l.billingAddress.city ? `, ${l.billingAddress.city}` : ""}
              {l.billingAddress.taxNumber
                ? t("vkn", { taxNumber: l.billingAddress.taxNumber })
                : ""}
            </Fact>
          ) : null}
        </dl>
      </Section>

      {/* Kurallar */}
      <Section title={t("satinAlmaTalebiKurallari")} icon={ShieldCheck}>
        <div className="flex flex-wrap gap-2">
          <RuleChip
            active={!!l.isSealedBid}
            label={t("kapaliZarfTedarikcilerArasiGizlilik")}
          />
          <RuleChip
            active={!!l.requireAllItems}
            label={t("tumKalemlereTeklifZorunlu")}
          />
          <RuleChip
            active={!!l.requireBidDocument}
            label={t("teklifDosyasiEkiZorunlu")}
          />
        </div>
      </Section>

      {/* Açık Eksiltme Ayarları */}
      {l.format === "ENGLISH_AUCTION" ? (
        <Section title={t("acikEksiltmeAyarlari")} icon={Gavel}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
            <Fact label={t("tedarikciGorunurlugu")}>
              {l.bidVisibility ? bidVisibilityLabel(l.bidVisibility) : "—"}
            </Fact>
            {/* Minimum pay kaldırıldı (2026-07-13) — kural sabit metin. */}
            <Fact label={t("teklifKurali")}>
              {t("turBasina1TeklifKendi")}
            </Fact>
            <Fact label={t("ondalikBasamak")}>
              {String(l.decimalPlaces ?? 2)}
            </Fact>
            <Fact label={t("otomatikSureUzatma")} full>
              {l.autoExtendOnLateBid
                ? t("sonDkIcindeTeklifDk", { autoExtendThresholdMin: l.autoExtendThresholdMin ?? 0, autoExtendByMinutes: l.autoExtendByMinutes ?? 0 })
                : t("kapali")}
            </Fact>
          </dl>
        </Section>
      ) : null}

      {/* Hüküm ve Koşullar */}
      {l.terms ? (
        <Section title={t("hukumVeKosullar")} icon={FileText}>
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
            <h3 className="font-semibold text-zinc-900">{t("satinAlmaTalebiNotlari")}</h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-700">
              {t("sirketIci")}
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
