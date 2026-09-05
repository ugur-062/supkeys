"use client";

import { CompanyLogo } from "@/components/company/company-logo";
import { PeriodSelect } from "@/components/company/period-select";
import { EmptyState, Pagination } from "@/components/list";
import { useVisitors, type ViewDays, type VisitorItem } from "@/hooks/use-company-views";
import { formatDate } from "@/lib/format-date";
import { companyActivityLabel } from "@rothern/shared";
import { CheckBadgeIcon, EyeIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * ZİYARET EDENLER (2026-09-05, Europages "Your Visitors"): profilinizi ve
 * ürünlerinizi inceleyen firmalar. Sayılar herkese; kimlikli liste Bronz+
 * (Standart pakette satırlar kilitli, kaç firma olduğu söylenir). Anonim
 * ziyaretçi = herkese açık sayfadan gelen; yalnız sayı (IP'den firma tahmini
 * YOK). Her satır: kim, ne baktı (profil / ürün adları), ne zaman, kaç kez;
 * eylemler profile gider (bağlantı daveti ve mesaj orada).
 */
export function VisitorsView() {
  const [days, setDays] = useState<ViewDays>(30);
  const [page, setPage] = useState(1);
  const q = useVisitors(days, page);
  const d = q.data;
  const totalPages = d ? Math.max(1, Math.ceil(d.totalItems / d.pageSize)) : 1;

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
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />)}
        </div>
      ) : q.isError || !d ? (
        <EmptyState icon={EyeIcon} title="Ziyaretçi verisi alınamadı." description="Bir hata oluştu — tekrar deneyin." variant="no-results" />
      ) : (
        <>
          <section aria-label="Özet" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Toplam görüntülenme" value={d.total} />
            <Stat label="Profil görüntülenmesi" value={d.profileViews} />
            <Stat label="Ürün görüntülenmesi" value={d.productViews} />
            <Stat label="Kimliği bilinen firma" value={d.identified} hint={d.anonymous > 0 ? `+ ${d.anonymous} anonim ziyaret` : undefined} />
          </section>

          {d.locked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
              <LockClosedIcon aria-hidden className="mx-auto mb-2 size-7 text-amber-500" />
              <p className="font-medium text-amber-900">
                {d.identified > 0
                  ? `${d.identified} firma profilinizi inceledi — kim olduklarını görmek için paketinizi yükseltin.`
                  : "Kimlikli ziyaretçi listesi Bronz ve üzeri paketlerde."}
              </p>
              <p className="mt-1 text-sm text-amber-800">Firma adı, şehir, faaliyet tipi ve hangi ürünlere baktıkları paketle açılır.</p>
              <Link href="/company/ayarlar" className="mt-4 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                Paketleri gör
              </Link>
            </div>
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
            <>
              <ul className="divide-y divide-zinc-950/5 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5" aria-label="Ziyaretçi firmalar">
                {d.items.map((v) => <VisitorRow key={v.company.id} v={v} />)}
              </ul>
              {totalPages > 1 ? (
                <Pagination page={d.page} totalPages={totalPages} total={d.totalItems} pageSize={d.pageSize} onPageChange={setPage} variant="bare" />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5">
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">{value.toLocaleString("tr-TR")}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function VisitorRow({ v }: { v: VisitorItem }) {
  const c = v.company;
  const href = c.rothernId ? `/company/firma/${c.rothernId}` : undefined;
  const looked = [
    v.profileViews > 0 ? "Profil" : null,
    ...v.products.map((p) => p.name),
  ].filter((x): x is string => !!x);
  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3">
      <CompanyLogo
        src={c.logoUrl}
        alt=""
        className="size-10 rounded-xl object-cover ring-1 ring-zinc-950/10"
        fallback={<span className="flex size-10 items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-600">{c.name.slice(0, 1)}</span>}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-zinc-950">
          {href ? <Link href={href} className="hover:underline">{c.name}</Link> : <span>{c.name}</span>}
          {c.verified ? <CheckBadgeIcon aria-hidden className="size-4 text-emerald-600" /> : null}
          {v.connected ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Bağlantılı</span> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {[c.city, ...c.activities.slice(0, 2).map((a) => companyActivityLabel(a))].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          <span className="text-zinc-500">Baktığı: </span>
          {looked.join(", ")}
        </p>
      </div>
      <div className="text-right text-xs text-zinc-500">
        <p className="text-sm font-semibold tabular-nums text-zinc-950">{v.visits} ziyaret</p>
        <p>Son: {formatDate(v.lastViewedAt, "short")}</p>
      </div>
      {href ? (
        <Link href={href} className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50">
          Profili gör
        </Link>
      ) : null}
    </li>
  );
}
