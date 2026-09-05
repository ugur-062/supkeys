"use client";

import { CompanyLogo } from "@/components/company/company-logo";
import { PeriodSelect } from "@/components/company/period-select";
import { MiniBars } from "@/components/company/ui/mini-bars";
import { StatTile } from "@/components/company/ui/stat-tile";
import { EmptyState, Pagination } from "@/components/list";
import { useVisitors, type ViewDays, type VisitorItem } from "@/hooks/use-company-views";
import { pctChange } from "@/lib/dashboard/delta";
import { formatDate } from "@/lib/format-date";
import { companyActivityLabel } from "@rothern/shared";
import {
  BuildingOffice2Icon,
  CheckBadgeIcon,
  CubeIcon,
  EyeIcon,
  IdentificationIcon,
  LockClosedIcon,
  UserGroupIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * ZİYARET EDENLER (2026-09-05, Europages "Your Visitors"): profilinizi ve
 * ürünlerinizi inceleyen firmalar. Üstte dört eğilim kartı + günlük grafik;
 * altta kimlikli liste (Bronz+; Standart'ta bulanık örnek satırlar + kilit
 * kartı). Anonim ziyaretçi = herkese açık sayfa; yalnız sayı (IP'den firma
 * tahmini YOK). Satır: kim, ne baktı (Profil / ürün çipleri), son ziyaret,
 * ziyaret sayısı; eylemler profilde.
 */
export function VisitorsView() {
  const [days, setDays] = useState<ViewDays>(30);
  const [page, setPage] = useState(1);
  const q = useVisitors(days, page);
  const d = q.data;
  const totalPages = d ? Math.max(1, Math.ceil(d.totalItems / d.pageSize)) : 1;
  const deltaLabel = `Önceki ${days} güne göre`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Ziyaret Edenler</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Profilinizi ve ürünlerinizi inceleyen firmalar. Giriş yapmış üyeler adıyla, herkese açık sayfadan gelenler yalnız sayı olarak görünür.
          </p>
        </div>
        <PeriodSelect value={days} onChange={(v) => { setDays(v); setPage(1); }} />
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-100" />)}
        </div>
      ) : q.isError || !d ? (
        <EmptyState icon={EyeIcon} title="Ziyaretçi verisi alınamadı." description="Bir hata oluştu — tekrar deneyin." variant="no-results" />
      ) : (
        <>
          <section aria-label="Özet" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile icon={EyeIcon} tone="blue" label="Toplam görüntülenme" value={d.total.toLocaleString("tr-TR")} deltaPct={pctChange(d.total, d.previous.total)} deltaLabel={deltaLabel} />
            <StatTile icon={IdentificationIcon} tone="zinc" label="Profil görüntülenmesi" value={d.profileViews.toLocaleString("tr-TR")} />
            <StatTile icon={CubeIcon} tone="emerald" label="Ürün görüntülenmesi" value={d.productViews.toLocaleString("tr-TR")} />
            <StatTile
              icon={UserGroupIcon}
              tone="violet"
              label="Kimliği bilinen firma"
              value={d.identified.toLocaleString("tr-TR")}
              deltaPct={pctChange(d.identified, d.previous.identified)}
              deltaLabel={deltaLabel}
              hint={d.anonymous > 0 ? `+ ${d.anonymous} anonim ziyaret` : undefined}
            />
          </section>

          {d.total > 0 ? (
            <section aria-label="Günlük görüntülenme" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-600">Günlük görüntülenme</p>
                <p className="text-xs text-zinc-500">Son {days} gün</p>
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
              title="Bu dönemde kimliği bilinen ziyaretçi yok."
              description="Profilinizi tamamlayıp ürün ekledikçe daha çok firma sizi bulur."
              variant="no-data"
              action={
                <Link href="/company/sirketim/profil" className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
                  Profili tamamla
                </Link>
              }
            />
          ) : (
            <section aria-label="Ziyaretçi firmalar" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
              <div className="hidden grid-cols-[1fr_minmax(0,1.1fr)_7rem_7rem_7rem] gap-4 border-b border-zinc-950/5 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase md:grid">
                <span>Firma</span>
                <span>Baktığı</span>
                <span className="text-right">Ziyaret</span>
                <span className="text-right">Son ziyaret</span>
                <span />
              </div>
              <ul className="divide-y divide-zinc-950/5" aria-label="Ziyaretçi firmalar">
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
  return (
    <section aria-label="Kimlikli ziyaretçi listesi (kilitli)" className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      <ul className="divide-y divide-zinc-950/5 select-none blur-[3px]" aria-hidden>
        {["Anadolu Metal San.", "Ege Tekstil A.Ş.", "Karadeniz Enerji Ltd."].map((n, i) => (
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
            {count > 0 ? `${count} firma profilinizi inceledi` : "Kimlikli ziyaretçi listesi Bronz ve üzeri paketlerde"}
          </p>
          <p className="mt-1 text-sm text-amber-800">Firma adı, şehir, faaliyet tipi ve hangi ürünlere baktıkları paketle açılır.</p>
          <Link href="/company/ayarlar" className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            Paketleri gör
          </Link>
        </div>
      </div>
    </section>
  );
}

function VisitorRow({ v }: { v: VisitorItem }) {
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
            {c.verified ? <CheckBadgeIcon aria-hidden className="size-4 text-emerald-600" /> : null}
            {v.connected ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Bağlantılı</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {[c.city, ...c.activities.slice(0, 2).map((a) => companyActivityLabel(a))].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="sr-only">Baktığı: </span>
        {v.profileViews > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
            <IdentificationIcon aria-hidden className="size-3.5 text-zinc-500" />
            Profil
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
        {v.visits} <span className="text-xs font-normal text-zinc-500">ziyaret</span>
      </p>
      <p className="text-xs text-zinc-500 md:text-right">{formatDate(v.lastViewedAt, "short")}</p>
      <div className="md:text-right">
        {href ? (
          <Link href={href} className="inline-flex rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50">
            Profili gör
          </Link>
        ) : null}
      </div>
    </li>
  );
}
