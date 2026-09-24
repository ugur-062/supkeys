"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { formatNumber } from "@/i18n/format";
import { useActivityLabel } from "@/i18n/domain";
import { VisitsVisibilityCard } from "@/components/company/visits-visibility-card";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company/company-logo";
import { PeriodSelect } from "@/components/company/period-select";
import { MiniBars } from "@/components/company/ui/mini-bars";
import { StatTile } from "@/components/company/ui/stat-tile";
import { EmptyState, Pagination } from "@/components/list";
import { useVisitors, type ViewDays, type VisitorItem } from "@/hooks/use-company-views";
import { pctChange } from "@/lib/dashboard/delta";
import { formatDate } from "@/lib/format-date";
import {
  BuildingOffice2Icon,
  CubeIcon,
  EyeIcon,
  IdentificationIcon,
  LockClosedIcon,
  UserGroupIcon,
} from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useState } from "react";

/**
 * ZİYARET EDENLER (2026-09-05, Europages "Your Visitors"): profilinizi ve
 * ürünlerinizi inceleyen firmalar. Üstte dört eğilim kartı + günlük grafik;
 * altta kimlikli liste (Silver+; Standart'ta bulanık örnek satırlar + kilit
 * kartı). Anonim ziyaretçi = herkese açık sayfa; yalnız sayı (IP'den firma
 * tahmini YOK). Satır: kim, ne baktı (Profil / ürün çipleri), son ziyaret,
 * ziyaret sayısı; eylemler profilde.
 */
export function VisitorsView() {
  const t = useTranslations("web.panel.trade.visitorsView");
  const locale = useLocale() as Locale;
  const [days, setDays] = useState<ViewDays>(30);
  const [page, setPage] = useState(1);
  const q = useVisitors(days, page);
  const d = q.data;
  const totalPages = d ? Math.max(1, Math.ceil(d.totalItems / d.pageSize)) : 1;
  const deltaLabel = t("oncekiGuneGore", { days: days });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{t("ziyaretEdenler")}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("profiliniziVeUrunleriniziInceleyenFirmalar")}
          </p>
        </div>
        <PeriodSelect value={days} onChange={(v) => { setDays(v); setPage(1); }} />
      </div>

      {/* Gizlilik anahtarı burada (2026-09-19): "sizin ziyaretiniz onlara nasıl
          görünür" ayarı, başkalarının ziyaretini gördüğünüz sayfada. */}
      <VisitsVisibilityCard />

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-100" />)}
        </div>
      ) : q.isError || !d ? (
        <EmptyState icon={EyeIcon} title={t("ziyaretciVerisiAlinamadi")} description={t("birHataOlustuTekrarDeneyin")} variant="no-results" />
      ) : (
        <>
          <section aria-label={t("ozet")} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile icon={EyeIcon} tone="blue" label={t("toplamGoruntulenme")} value={formatNumber(d.total, locale)} deltaPct={pctChange(d.total, d.previous.total)} deltaLabel={deltaLabel} />
            <StatTile icon={IdentificationIcon} tone="zinc" label={t("profilGoruntulenmesi")} value={formatNumber(d.profileViews, locale)} />
            <StatTile icon={CubeIcon} tone="emerald" label={t("urunGoruntulenmesi")} value={formatNumber(d.productViews, locale)} />
            <StatTile
              icon={UserGroupIcon}
              tone="violet"
              label={t("kimligiBilinenFirma")}
              value={formatNumber(d.identified, locale)}
              deltaPct={pctChange(d.identified, d.previous.identified)}
              deltaLabel={deltaLabel}
              hint={d.anonymous > 0 ? t("anonimZiyaret", { anonymous: d.anonymous }) : undefined}
            />
          </section>

          {d.total > 0 ? (
            <section aria-label={t("gunlukGoruntulenme")} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-600">{t("gunlukGoruntulenme")}</p>
                <p className="text-xs text-zinc-500">{t("sonGun", { days: days })}</p>
              </div>
              <div className="mt-3">
                <MiniBars data={d.daily} height={72} accent="blue" />
              </div>
            </section>
          ) : null}

          {d.locked ? (
            <LockedList count={d.identified} />
          ) : d.items.length === 0 ? (
            <EmptyState
              icon={EyeIcon}
              title={t("buDonemdeKimligiBilinenZiyaretci")}
              description={t("profiliniziTamamlayipUrunEkledikceDaha")}
              variant="no-data"
              action={
                <Link href="/company/sirketim/profil" className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
                  {t("profiliTamamla")}
                </Link>
              }
            />
          ) : (
            <section aria-label={t("ziyaretciFirmalar")} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
              <div className="hidden grid-cols-[1fr_minmax(0,1.1fr)_7rem_7rem_7rem] gap-4 border-b border-zinc-950/5 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase md:grid">
                <span>{t("firma")}</span>
                <span>{t("baktigi")}</span>
                <span className="text-right">{t("ziyaret")}</span>
                <span className="text-right">{t("sonZiyaret")}</span>
                <span />
              </div>
              <ul className="divide-y divide-zinc-950/5" aria-label={t("ziyaretciFirmalar")}>
                {d.items.map((v) => <VisitorRow key={v.company.id} v={v} />)}
              </ul>
              {totalPages > 1 ? (
                <div className="border-t border-zinc-950/5 px-5 py-3">
                  <Pagination page={d.page} totalPages={totalPages} total={d.totalItems} pageSize={d.pageSize} onPageChange={setPage} variant="bare" />
                </div>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function LockedList({ count }: { count: number }) {
  const t = useTranslations("web.panel.trade.visitorsView");
  return (
    <section aria-label={t("kimlikliZiyaretciListesiKilitli")} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      <ul className="divide-y divide-zinc-950/5 select-none blur-[3px]" aria-hidden>
        {["Anadolu Metal San.", t("egeTekstilAS"), "Karadeniz Enerji Ltd."].map((n, i) => (
          <li key={n} className="flex items-center gap-4 px-5 py-4">
            <span className="size-10 rounded-xl bg-zinc-200" />
            <span className="flex-1">
              <span className="block h-3.5 w-40 rounded bg-zinc-200" />
              <span className="mt-2 block h-3 w-24 rounded bg-zinc-100" />
            </span>
            <span className="h-3.5 w-16 rounded bg-zinc-200" />
            <span className="sr-only">{`${n} ${i}`}</span>
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <LockClosedIcon aria-hidden className="mx-auto mb-2 size-7 text-amber-500" />
          <p className="font-semibold text-amber-900">
            {count > 0 ? t("firmaProfiliniziInceledi", { n: count }) : t("kimlikliZiyaretciListesiSilverVe")}
          </p>
          <p className="mt-1 text-sm text-amber-800">{t("firmaAdiSehirFaaliyetTipi")}</p>
          <Link href="/company/premium" className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            {t("paketleriGor")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function VisitorRow({ v }: { v: VisitorItem }) {
  const t = useTranslations("web.panel.trade.visitorsView");
  const locale = useLocale() as Locale;
  const activityLabel = useActivityLabel();
  const c = v.company;
  const href = c.rothernId ? `/company/firma/${c.rothernId}` : undefined;
  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_minmax(0,1.1fr)_7rem_7rem_7rem] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <CompanyLogo
          src={c.logoUrl}
          alt=""
          className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-zinc-950/10"
          fallback={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
              <BuildingOffice2Icon aria-hidden className="size-5 text-zinc-400" />
            </span>
          }
        />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-zinc-950">
            {href ? <Link href={href} className="hover:underline">{c.name}</Link> : <span>{c.name}</span>}
            {c.verified ? (
              <Badge tone="verified" size="sm" className="px-1">
                <span className="sr-only">{t("dogrulanmisFirma")}</span>
              </Badge>
            ) : null}
            {v.connected ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">{t("baglantili")}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {[c.city, ...c.activities.slice(0, 2).map((a) => activityLabel(a))].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="sr-only">{t("baktigi2")} </span>
        {v.profileViews > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
            <IdentificationIcon aria-hidden className="size-3.5 text-zinc-500" />
            {t("profil")}
          </span>
        ) : null}
        {v.products.map((p) => (
          <span key={p.id} className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
            <CubeIcon aria-hidden className="size-3.5 text-emerald-600" />
            <span className="truncate">{p.name}</span>
          </span>
        ))}
      </p>
      <p className="text-sm font-semibold tabular-nums text-zinc-950 md:text-right">
        {v.visits} <span className="text-xs font-normal text-zinc-500">{t("ziyaretBirim")}</span>
      </p>
      <p className="text-xs text-zinc-500 md:text-right">{formatDate(v.lastViewedAt, "short", locale)}</p>
      <div className="md:text-right">
        {href ? (
          <Link href={href} className="inline-flex rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50">
            {t("profiliGor")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
