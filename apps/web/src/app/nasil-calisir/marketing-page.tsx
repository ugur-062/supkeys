"use client";

import { OPERATOR } from "@/lib/company-info";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { PRICING_NOTE, PRICING_PLANS } from "@/lib/pricing/plans";
import type { CompanyTier } from "@/lib/company-auth/types";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChatBubbleLeftIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ClockIcon,
  CubeIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MinusSmallIcon,
  PaperClipIcon,
  PlusSmallIcon,
  ShoppingCartIcon,
  TagIcon,
  TrophyIcon,
  TruckIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { ArrowTrendingDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { signupHref } from "@/lib/public/visibility";
import { useEffect, useRef, useState } from "react";

/**
 * Paket kartları — ad/fiyat/özellikler TEK KAYNAKTAN (`lib/pricing/plans.ts`,
 * panel içi paket sayfası da oradan okur). accent: pakete hafif renk kimliği,
 * yalnız bu sayfanın sunumu — kart gövdesi monokrom kalır.
 */
const PLAN_ACCENT: Record<
  CompanyTier,
  { top: string; pill: string; check: string }
> = {
  STANDART: {
    top: "border-t-zinc-200",
    pill: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    check: "text-zinc-500",
  },
  SILVER: {
    top: "border-t-slate-400",
    pill: "bg-slate-100 text-slate-700 ring-slate-300",
    check: "text-slate-500",
  },
  GOLD: {
    top: "border-t-yellow-500/80",
    pill: "bg-yellow-50 text-yellow-800 ring-yellow-300",
    check: "text-yellow-600",
  },
};

const pricingTiers = PRICING_PLANS.map((p) => ({
  name: p.name,
  price: p.monthlyUsd,
  tagline: p.tagline,
  features: p.features,
  cta: p.cta,
  accent: PLAN_ACCENT[p.tier],
}));

const faqs = [
  {
    q: "Alıcı ve tedarikçi ayrı mı kayıt oluyor?",
    a: "Hayır. Rothern'de tek firma hesabı var; aynı hesap hem alış hem satış yapar. Kişilere atadığınız roller (satın alma / satış) neyi görüp yapabileceğini belirler.",
  },
  {
    q: "Tedarikçiler birbirinin teklifini görür mü?",
    a: "Asla. Kapalı zarf: her tedarikçi yalnızca kendi teklifini görür. İlan sahibi tüm teklifleri görür ve en iyisini kazandırır.",
  },
  {
    q: "Standart üyelikle ne yapabilirim?",
    a: `Profilinizi yayınlar, ${PRODUCT_LIMITS.STANDART} ürüne kadar vitrin açar, firmaları keşfeder ve davet edildiğiniz ya da bağlantılı firmaların taleplerine teklif verirsiniz. Herkese açık talepleri görmek ve teklif vermek, bağlantı daveti göndermek, gelen bilgi taleplerinde alıcı kimliğini görüp yanıtlamak ve “Doğrulanmış” rozeti Silver ile; kendi satın alma talebinizi açmak Gold ile gelir.`,
  },
  {
    q: "Platform paraya aracılık ediyor mu?",
    a: "Hayır. Ödeme taraflar arasında doğrudan yapılır; Rothern paraya aracılık etmez; ödeme yalnızca 'ödendi' ya da 'ödeme bekleniyor' olarak işaretlenir. Koltuk başına ücret yoktur.",
  },
  {
    q: "Siparişten sonra ne oluyor?",
    a: "Kazandırma anında sipariş oluşur (satıcı→alıcı). Gönderim ve teslim adımlarını panelden takip eder, teslim belgesini (irsaliye/konşimento) yükler, ödemeyi 'ödendi' olarak işaretlersiniz. Ödeme taraflar arasında yapılır.",
  },
];





function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function ListingWizardPreview() {
  // Mockup (2026-09-18): kart başlığı ikon rozetli, sağda adım sayacı;
  // seçili seçenekler mavi çerçeve — Yurtiçi'nde BAYRAK YOK (kullanıcı).
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <DocumentTextIcon className="size-6" />
          </span>
          <div>
            <div className="text-base font-semibold text-zinc-950">Yeni ilan</div>
            <div className="text-xs text-zinc-500">Kapsam → Tür → Format → Detay</div>
          </div>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">1 / 4</span>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <div className="text-xs font-medium text-zinc-600">Kapsam</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50/60 px-3 py-2.5 text-sm font-medium text-blue-700">
              <MapPinIcon className="size-4" />
              Yurtiçi
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-500">
              <GlobeAltIcon className="size-4" />
              Uluslararası
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-600">Tür</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50/60 px-3 py-2.5 text-sm font-medium text-blue-700">
              <ShoppingCartIcon className="size-4" />
              Alış
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-500">
              <TagIcon className="size-4" />
              Satış
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white">
        Devam <span aria-hidden>→</span>
      </div>
    </div>
  );
}

function BidsPreview() {
  const bids = [
    { n: "Firma B", a: "11.900 ₺", best: true },
    { n: "Firma A", a: "12.500 ₺", best: false },
    { n: "Firma C", a: "13.200 ₺", best: false },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3 border-b border-zinc-100 bg-blue-50/50 px-6 py-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <ShoppingCartIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">Alıcı için</div>
          <div className="text-xs text-zinc-500">İhtiyacın için en iyi teklifi bul</div>
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">Gelen Teklifler</div>
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
            <LockClosedIcon className="size-3.5" /> Kapalı zarf
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {bids.map((b) => (
            <div
              key={b.n}
              className={`flex items-center justify-between rounded-xl border px-3 py-3 ${
                b.best ? "border-emerald-300 bg-emerald-50" : "border-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`flex size-8 items-center justify-center rounded-lg ${b.best ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                  {b.best ? <TrophyIcon className="size-4" /> : <BuildingOfficeIcon className="size-4" />}
                </span>
                {b.best ? (
                  <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">EN İYİ</span>
                ) : null}
                <span className="text-sm font-medium text-zinc-800">{b.n}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold tabular-nums text-zinc-900">{b.a}</span>
                {b.best ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Al</span>
                ) : null}
                <ChevronRightIcon className="size-4 text-zinc-400" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <InformationCircleIcon className="size-4 text-zinc-400" /> Tedarikçiler birbirinin teklifini görmez.
        </p>
      </div>
    </div>
  );
}

function ShowcasePreview() {
  // Satış tarafı artık ÜRÜN VİTRİNİ: firma ürününü fiyat + minimum siparişle
  // yayımlar, alıcı bilgi talebi gönderir. (Satış ilanı 2026-09-04'te kaldırıldı.)
  const inquiries = [
    { n: "Alıcı X", t: "Numune ve teslim süresi?", when: "2 saat önce", fresh: false },
    { n: "Alıcı Y", t: "500 adet için fiyat?", when: "5 saat önce", fresh: true },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3 border-b border-zinc-100 bg-emerald-50/50 px-6 py-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <BuildingStorefrontIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">Tedarikçi için</div>
          <div className="text-xs text-zinc-500">Ürünlerini alıcılara ulaştır</div>
        </div>
      </div>
      <div className="p-6">
        <div className="flex gap-4">
          {/* Ürün görseli: CC0 kategori fotoğrafı (metal blok — 11000000). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/categories/11000000.webp" alt="" className="size-28 shrink-0 rounded-xl object-cover ring-1 ring-zinc-950/5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Ürün</div>
                <div className="text-sm font-semibold text-zinc-900">Bakır levha 2 mm · 1000×2000</div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Yayında
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-100">
                <CircleStackIcon className="size-5 text-zinc-500" />
                <div>
                  <div className="text-[11px] text-zinc-500">Fiyat</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">860 ₺ / kg</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-100">
                <CubeIcon className="size-5 text-zinc-500" />
                <div>
                  <div className="text-[11px] text-zinc-500">Min. sipariş</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">250 kg</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">Gelen bilgi talepleri</div>
          <span className="text-xs font-medium text-emerald-700">Tümünü gör →</span>
        </div>
        <div className="mt-2 space-y-2">
          {inquiries.map((q) => (
            <div
              key={q.n}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                q.fresh ? "border-emerald-300 bg-emerald-50" : "border-zinc-200"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${q.fresh ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                  <BuildingOfficeIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900">{q.n}</div>
                  <div className="truncate text-xs text-zinc-500">{q.t}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-zinc-500">{q.when}</span>
                {q.fresh ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">
                    <ChatBubbleLeftIcon className="size-3.5" /> Yanıtla
                  </span>
                ) : (
                  <ChevronRightIcon className="size-4 text-zinc-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function OrderTimelinePreview() {
  const tl = [
    { t: "Sipariş oluştu", d: "12 Mar 2024, 09:22", state: "done" },
    { t: "Sipariş gönderildi", d: "13 Mar 2024, 14:10", state: "done" },
    { t: "Teslim alındı", d: "15 Mar 2024, 10:45", state: "active" },
    { t: "Tamamlandı", d: "—", state: "todo" },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <TruckIcon className="size-6" />
          </span>
          <div className="tabular-nums text-base font-semibold text-zinc-950">ROT-ORD-000128</div>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Teslimde</span>
      </div>
      <ol className="mt-5 space-y-0">
        {tl.map((st, i) => (
          <li key={st.t} className="relative flex gap-3 pb-5 last:pb-0">
            {i < tl.length - 1 ? (
              <span aria-hidden className={`absolute top-6 left-3 h-[calc(100%-1.5rem)] w-0.5 ${st.state === "done" ? "bg-emerald-500" : "bg-zinc-200"}`} />
            ) : null}
            <span
              className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                st.state === "done"
                  ? "bg-emerald-500 text-white"
                  : st.state === "active"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {st.state === "done" ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <div>
              <div className={`text-sm ${st.state === "todo" ? "text-zinc-500" : "font-medium text-zinc-900"}`}>{st.t}</div>
              <div className="text-xs text-zinc-500">{st.d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-600">
          <PaperClipIcon className="size-3.5" /> Teslim belgesi
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          <ClockIcon className="size-3.5" /> Ödeme bekleniyor
        </span>
      </div>
    </div>
  );
}

function DiscoverPreview() {
  const firms = [
    { n: "Üçüncü Firma", s: "Çelik · İstanbul", m: 3 },
    { n: "Anadolu Metal", s: "Bakır · Bursa", m: 2 },
    { n: "Global Tedarik", s: "Lojistik · İzmir", m: 1 },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UsersIcon className="size-6" />
          </span>
          <div>
            <div className="text-base font-semibold text-zinc-950">Keşfet</div>
            <div className="text-xs text-zinc-500">Kategori eşleşmeli firmalar</div>
          </div>
        </div>
        <span className="text-xs font-medium text-blue-600">Tümünü gör →</span>
      </div>
      <div className="mt-5 space-y-2">
        {firms.map((f) => (
          <div key={f.n} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                <BuildingOfficeIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">{f.n}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                  <span>{f.s}</span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{f.m} eşleşme</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Bağlan</span>
              <ChevronRightIcon className="size-4 text-zinc-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionsPreview() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="text-sm font-semibold text-zinc-900">Bağlantılar</div>
      <div className="mt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
          Gelen davet
        </div>
        <div className="mt-1.5 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <span className="text-xs font-medium text-zinc-800">
            Mavi Lojistik A.Ş.
          </span>
          <span className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white">
            Kabul Et
          </span>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-zinc-500">
          Bağlı firmalar
        </div>
        <div className="mt-1.5 space-y-1.5">
          {["Üçüncü Firma", "Anadolu Metal"].map((n) => (
            <div
              key={n}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"
            >
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-zinc-700">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublicProfilePreview() {
  const tenders = [
    { t: "Uluslararası çelik alımı", b: "Teklif Toplama", c: "bg-blue-50 text-blue-700" },
    { t: "Fazla bakır satışı", b: "Satış", c: "bg-emerald-50 text-emerald-700" },
    { t: "Hurda eksiltmesi", b: "Pazarlık", c: "bg-amber-50 text-amber-700" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <span className="size-3 rounded-full bg-red-400" />
        <span className="size-3 rounded-full bg-amber-400" />
        <span className="size-3 rounded-full bg-emerald-400" />
        <div className="ml-3 hidden h-5 max-w-xs flex-1 rounded bg-zinc-200/70 sm:block" />
      </div>
      <div className="h-20 bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500" />
      <div className="px-6 pb-6">
        <div className="-mt-8">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white ring-4 ring-white">
            DÇ
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-bold text-zinc-900">
              Demo Çelik A.Ş.
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckIcon className="size-3" />
              Doğrulanmış
            </span>
          </div>
          <div className="mt-0.5 text-sm text-zinc-500">
            Metal & Çelik · İstanbul, Türkiye
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Çelik", "Bakır", "Alüminyum", "İthalat"].map((t) => (
            <span
              key={t}
              className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm/6 text-zinc-600">
          20 yıllık tedarik tecrübesiyle yurtiçi ve uluslararası metal
          ticareti. Açık satın alma taleplerimize teklif verin.
        </p>
        <div className="mt-5 text-xs font-medium text-zinc-500">
          Açık satın alma talepleri
        </div>
        <div className="mt-1.5 space-y-1.5">
          {tenders.map((x) => (
            <div
              key={x.t}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
            >
              <span className="truncate text-xs font-medium text-zinc-800">
                {x.t}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${x.c}`}
              >
                {x.b}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignupPreview() {
  const roles = [
    { n: "Yönetici", on: true },
    { n: "Satın alma", on: true },
    { n: "Satış", on: true },
    { n: "Onaylayıcı", on: false },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="text-sm font-semibold text-zinc-900">Firma Hesabı</div>
      <div className="mt-0.5 text-xs text-zinc-500">
        Hem al, hem sat — tek hesap
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-zinc-500">Firma adı</div>
          <div className="mt-1 flex h-9 items-center rounded-lg bg-zinc-100 px-3 text-sm text-zinc-700">
            Demo Çelik A.Ş.
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500">E-posta</div>
          <div className="mt-1 flex h-9 items-center rounded-lg bg-zinc-100 px-3 text-sm text-zinc-700">
            info@democelik.com
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500">Roller</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r.n}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  r.on
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-zinc-200 text-zinc-500"
                }`}
              >
                {r.n}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 w-full rounded-lg bg-blue-600 py-2 text-center text-sm font-semibold text-white">
        Kaydol
      </div>
    </div>
  );
}

const HERO_STEPS = [
  { n: "01", title: "Keşfet", body: "Doğrulanmış firmaları ve ürünleri incele", tone: "bg-blue-50 text-blue-700" },
  { n: "02", title: "Bağlantı kur", body: "Doğrudan firmalarla iletişime geç", tone: "bg-emerald-50 text-emerald-700" },
  { n: "03", title: "Ticaret yap", body: "Güvenle alım yap, ürünlerini sat", tone: "bg-violet-50 text-violet-700" },
] as const;

/** Hero kenar dekoru — yumuşak daireler, ikon rozetleri, nokta desenleri (aria-hidden). */
function HeroDecorations() {
  const dots = "radial-gradient(currentColor 1.5px, transparent 1.5px)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden select-none lg:block">
      <div className="absolute top-8 -left-40 size-[34rem] rounded-full bg-blue-100/60 blur-2xl" />
      <div className="absolute -right-40 top-16 size-[32rem] rounded-full bg-emerald-100/60 blur-2xl" />
      <div className="absolute top-36 left-[10%] size-[22rem] rounded-full border border-blue-200/60" />
      <div className="absolute -right-6 top-24 size-[24rem] rounded-full border border-emerald-200/60" />
      <span className="absolute top-[30%] left-[9%] flex size-20 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg shadow-blue-900/10 ring-1 ring-blue-100">
        <MagnifyingGlassIcon className="size-8" />
      </span>
      <span className="absolute top-[68%] left-[7%] flex size-20 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg shadow-blue-900/10 ring-1 ring-blue-100">
        <UsersIcon className="size-8" />
      </span>
      <span className="absolute top-[28%] right-[9%] flex size-20 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100">
        <ChartBarIcon className="size-8" />
      </span>
      <span className="absolute top-[66%] right-[7%] flex size-20 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100">
        <ShoppingCartIcon className="size-8" />
      </span>
      <div className="absolute top-[78%] left-[12%] h-16 w-16 text-zinc-300" style={{ backgroundImage: dots, backgroundSize: "14px 14px" }} />
      <div className="absolute top-[48%] right-[5%] h-16 w-16 text-zinc-300" style={{ backgroundImage: dots, backgroundSize: "14px 14px" }} />
    </div>
  );
}

const FEATURE_TOP = [
  { icon: BuildingStorefrontIcon, title: "Ürününü vitrinde yayınla", body: "Ürünlerini fiyat ve minimum sipariş bilgisiyle yayınla, alıcılardan bilgi talebi topla.", preview: <ShowcasePreview /> },
  { icon: ShoppingCartIcon, title: "İhtiyacına en uygun teklifi al", body: "Talep aç, kapalı zarf teklifleri topla ve en uygun seçeneği değerlendir.", preview: <BidsPreview /> },
];
const FEATURE_BOTTOM = [
  { icon: DocumentTextIcon, title: "İlanı saniyede aç", body: "Kapsam, tür ve format adım adım — yanlış kurulum imkânsız.", preview: <ListingWizardPreview /> },
  { icon: TruckIcon, title: "Sipariş'ten teslime", body: "Kargo, teslim ve ödeme durumu; teslim belgesiyle tek panelde.", preview: <OrderTimelinePreview /> },
  { icon: UsersIcon, title: "Keşfet & bağlan", body: "Kategori eşleşmeli firma keşfi — yurtiçi ya da 98 ülkede.", preview: <DiscoverPreview /> },
];

export default function HomePage() {
  return (
    <PublicLayout>
      {/* HERO (2026-09-18, kullanıcı mockup'ı "nasıl çalışır kısmını direkt
          böyle yap"): rozet · iki renkli iki satırlık başlık (Hem al MAVİ,
          hem sat YEŞİL) · alt cümle · iki CTA (alıcı dolgulu mavi, tedarikçi
          çerçeveli) · 01/02/03 adım şeridi. Kenarlarda yumuşak mavi/yeşil
          daireler, ikon rozetleri ve nokta desenleri — dekoratif, aria-hidden,
          yalnız geniş ekranda. Ürün önizlemesi (AppPreview) ve TrustBand bu
          hero'nun içinden ÇIKTI; üç adım şeridi TrustBand'in yerine geçer. */}
      <section className="relative isolate overflow-hidden bg-white px-6 pt-24 pb-20 sm:pt-28 lg:px-8">
        <HeroDecorations />
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm/6 font-medium text-zinc-700 ring-1 ring-zinc-950/10">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              B2B ticaretin tek platformu
            </span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-7xl">
            <span className="block">
              <span className="text-blue-600">Hem al</span>
              <span className="text-zinc-950">, </span>
              <span className="text-emerald-600">hem sat.</span>
            </span>
            <span className="block text-zinc-950">Tek platformda.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-600 sm:text-xl/8">
            Doğrulanmış firmaları keşfedin, alım talebi oluşturun ve ürünlerinizi yeni müşterilere ulaştırın.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/urunler"
              className="rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Alıcı olarak keşfet
            </Link>
            <Link
              href={signupHref("vitrin")}
              className="rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-950/60 transition hover:bg-zinc-50"
            >
              Tedarikçi olarak başla <span aria-hidden="true">→</span>
            </Link>
          </div>

          <ol className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
            {HERO_STEPS.map((st, i) => (
              <li key={st.n} className="relative flex flex-col items-center text-center">
                {i < HERO_STEPS.length - 1 ? (
                  <span aria-hidden className="absolute top-7 left-[calc(50%+2.5rem)] hidden h-px w-[calc(100%-5rem)] bg-zinc-200 sm:block" />
                ) : null}
                <span className={`flex size-14 items-center justify-center rounded-full text-base font-semibold ${st.tone}`}>
                  {st.n}
                </span>
                <span className="mt-4 text-base font-semibold text-zinc-950">{st.title}</span>
                <span className="mt-1.5 max-w-[11rem] text-sm/6 text-zinc-500">{st.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* "Pazar & erişim" istatistik bandı KALDIRILDI (2026-09-18, kullanıcı kararı). */}

      {/* Özellikler — 2 sıra bento (2.sırada 3 sütun) */}
      <section id="ozellikler" className="relative isolate scroll-mt-24 overflow-hidden py-24 sm:py-32">
        {/* Yumuşak mavi zemin lekeleri (mockup) — dekoratif */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-40 -z-10 hidden size-[36rem] rounded-full bg-blue-100/50 blur-3xl lg:block" />
        <div aria-hidden className="pointer-events-none absolute top-1/2 -left-48 -z-10 hidden size-[30rem] rounded-full bg-blue-50 blur-3xl lg:block" />
        <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
          <h2 className="text-base/7 font-semibold text-zinc-500">Eksiksiz ticaret</h2>
          <p className="mt-2 max-w-3xl text-4xl font-bold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
            Satın alma talebinden teslimata kadar tek platform
          </p>

          {/* 2026-09-18 mockup: üstte iki büyük kart (Tedarikçi · Alıcı), altta
              üç kart; her kartın altında ikon rozetli başlık + açıklama. */}
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {FEATURE_TOP.map((f) => (
              <div key={f.title}>
                <div className="rounded-3xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80">{f.preview}</div>
                <div className="mt-6 flex items-start gap-4 px-2">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <f.icon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-zinc-950">{f.title}</h3>
                    <p className="mt-1 text-sm/6 text-zinc-600">{f.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {FEATURE_BOTTOM.map((f) => (
              <div key={f.title}>
                <div className="rounded-3xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80">{f.preview}</div>
                <div className="mt-6 flex items-start gap-4 px-2">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <f.icon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-zinc-950">{f.title}</h3>
                    <p className="mt-1 text-sm/6 text-zinc-600">{f.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tek panelde her şey — ekip & ağ */}
      <section
        id="nasil"
        className="scroll-mt-24 border-y border-zinc-200 bg-zinc-50 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-base/7 font-semibold text-zinc-500">
              Tek panelde her şey
            </h2>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              Ticaretin ötesinde, tam kontrol
            </p>
          </div>

          <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
            {/* Ekip & roller */}
            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                  Ekibini davet et, rolleri ata
                </h3>
                <p className="mt-4 text-lg/8 text-zinc-600">
                  Yönetici, satın alma, satış, onaylayıcı rolleri — sınırsız
                  kullanıcı, kullanıcı-başı ücret yok. İş çıkışında erişim tek tıkla
                  kapanır.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Rol bazlı yetki ve görünürlük",
                    "Sınırsız kullanıcı & rol",
                    "Güvenli hesap kapatma (iş çıkışı)",
                  ].map((b) => (
                    <li key={b} className="flex gap-x-3 text-zinc-700">
                      <CheckIcon
                        aria-hidden="true"
                        className="h-6 w-5 flex-none text-zinc-900"
                      />
                      <span className="text-base">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-zinc-100 to-white"
                />
                <SignupPreview />
              </div>
            </Reveal>

            {/* Bağlantı ağı */}
            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="lg:order-last">
                <h3 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                  Ağını yönet, güvenle bağlan
                </h3>
                <p className="mt-4 text-lg/8 text-zinc-600">
                  Davet gönderin ya da kabul edin, bağlantı ağınızı büyütün. Bağlandığınız
                  firmalarla çevre-içi ticaret yapın; istemediğiniz firmayı
                  engelleyin.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Davet → kabul ile bağlantı",
                    "Çevre-içi kapalı ilan paylaşımı",
                    "Şikayet & engelleme ile güven",
                  ].map((b) => (
                    <li key={b} className="flex gap-x-3 text-zinc-700">
                      <CheckIcon
                        aria-hidden="true"
                        className="h-6 w-5 flex-none text-zinc-900"
                      />
                      <span className="text-base">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-zinc-100 to-white"
                />
                <ConnectionsPreview />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Herkese açık profil */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-base/7 font-semibold text-zinc-500">Vitrin</h2>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
                Herkese açık profiliniz, dijital vitrininiz
              </p>
              <p className="mt-6 text-lg/8 text-zinc-600">
                Premium üyelikte firmanız herkese açık bir profile kavuşur:
                doğrulanmış rozet, sektörleriniz, hakkında metniniz ve açık
                satın alma talepleriniz. Alıcılar sizi bulur, taleplerinize teklif verir.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Doğrulanmış firma rozeti",
                  "Sektör & konum etiketleri",
                  "Açık satın alma talepleriniz tek sayfada",
                ].map((b) => (
                  <li key={b} className="flex gap-x-3 text-zinc-700">
                    <CheckIcon
                      aria-hidden="true"
                      className="h-6 w-5 flex-none text-zinc-900"
                    />
                    <span className="text-base">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Reveal className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-zinc-100 to-white"
              />
              <PublicProfilePreview />
            </Reveal>
          </div>
        </div>
      </section>

      {/* İhale türleri — ayrı section */}
      <section className="border-y border-zinc-200 bg-zinc-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-base/7 font-semibold text-zinc-500">
              Satın Alma Talebi türleri
            </h2>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              Her ihtiyaca uygun format
            </p>
            <p className="mt-6 text-lg/8 text-zinc-600">
              Teklif toplama ya da pazarlık (açık eksiltme); doğru formatı seç,
              kazandırma öncesi onay zincirini panel yönetsin.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:mt-20 sm:grid-cols-2">
            {/* RFQ — kapalı zarf */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="space-y-1.5 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="text-xs text-zinc-500">Firma A</span>
                  {/* Noktalar GÖRÜNÜR metin: axe `aria-hidden` olsa da kontrast arar ve
                      haklı — gören kullanıcı da okuyor. zinc-500 hâlâ "maskeli"
                      duruyor ama 4,83:1. */}
                  <span className="text-xs text-zinc-500" aria-hidden>••• ₺</span>
                  <span className="sr-only">Fiyat gizli (kapalı zarf)</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-1.5 ring-1 ring-emerald-200">
                  <span className="text-xs font-medium text-emerald-800">
                    Firma B
                  </span>
                  <span className="text-xs font-semibold text-emerald-900">
                    11.900 ₺
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="text-xs text-zinc-500">Firma C</span>
                  {/* Noktalar GÖRÜNÜR metin: axe `aria-hidden` olsa da kontrast arar ve
                      haklı — gören kullanıcı da okuyor. zinc-500 hâlâ "maskeli"
                      duruyor ama 4,83:1. */}
                  <span className="text-xs text-zinc-500" aria-hidden>••• ₺</span>
                  <span className="sr-only">Fiyat gizli (kapalı zarf)</span>
                </div>
              </div>
              <span className="mt-5 inline-flex w-fit rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                Alış · Teklif Toplama
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                Kapalı zarf
              </h3>
              <p className="mt-1.5 text-sm/6 text-zinc-600">
                Tedarikçiler birbirini görmeden teklif verir; en iyisini
                kazandırırsınız.
              </p>
            </div>

            {/* Pazarlık — eksiltme */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex h-16 items-end gap-2">
                  <div className="flex-1 rounded-t bg-amber-400/80" style={{ height: "100%" }} />
                  <div className="flex-1 rounded-t bg-amber-400/70" style={{ height: "74%" }} />
                  <div className="flex-1 rounded-t bg-amber-400/60" style={{ height: "54%" }} />
                  <div className="flex-1 rounded-t bg-amber-500" style={{ height: "38%" }} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Güncel teklif</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                    12.000 ₺
                    <ArrowTrendingDownIcon className="size-3.5" />
                  </span>
                </div>
              </div>
              <span className="mt-5 inline-flex w-fit rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                Alış · Eksiltme
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                Pazarlık
              </h3>
              <p className="mt-1.5 text-sm/6 text-zinc-600">
                Fiyat canlı düşer; en uygun teklif öne çıkar.
              </p>
            </div>

            {/* Ürün vitrini */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex-1 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-100">
                  <div className="text-xs text-zinc-500">Fiyat</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">
                    860 ₺ / kg
                  </div>
                </div>
                <div className="flex-1 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-100">
                  <div className="text-xs text-zinc-500">Min. sipariş</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">
                    250 kg
                  </div>
                </div>
              </div>
              <span className="mt-5 inline-flex w-fit rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Satış
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                Ürün vitrini
              </h3>
              <p className="mt-1.5 text-sm/6 text-zinc-600">
                Ürünlerini yayımla; alıcılar bulsun, bilgi talebi göndersin.
              </p>
            </div>

            {/* Onay akışları */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="space-y-1.5 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-xs font-medium text-zinc-700">
                    Satın Almacı
                  </span>
                  <span className="ml-auto text-xs text-zinc-500">
                    Talep açtı
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-xs font-medium text-zinc-700">
                    Onaylayıcı
                  </span>
                  <span className="ml-auto text-xs text-zinc-500">
                    Onayladı
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-violet-50 px-2.5 py-1.5 ring-1 ring-violet-200">
                  <span className="flex size-4 items-center justify-center">
                    <span className="size-2 animate-pulse rounded-full bg-violet-500" />
                  </span>
                  <span className="text-xs font-medium text-violet-800">
                    Yönetici
                  </span>
                  <span className="ml-auto text-xs font-semibold text-violet-700">
                    Bekliyor
                  </span>
                </div>
              </div>
              <span className="mt-5 inline-flex w-fit rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                Onay akışı
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                Onay zinciri
              </h3>
              <p className="mt-1.5 text-sm/6 text-zinc-600">
                Tutara ve türe göre kural kur; kazandırma öncesi doğru kişilerden
                sırayla onay al.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Üyelik */}
      <section id="fiyatlar" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
          <h2 className="text-base/7 font-semibold text-zinc-500">Fiyatlar</h2>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-5xl">
            Her ölçeğe uygun paket
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-stretch gap-6 px-6 sm:mt-20 lg:max-w-7xl lg:grid-cols-4 lg:px-8">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-3xl border-t-4 bg-white p-8 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-xl ${tier.accent.top}`}
            >
              <span
                className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tier.accent.pill}`}
              >
                {tier.name}
              </span>
              <p className="mt-5 flex items-baseline gap-x-2">
                {tier.price === null ? (
                  <span className="text-4xl font-semibold tracking-tight text-zinc-950">
                    Ücretsiz
                  </span>
                ) : (
                  <>
                    <span className="text-4xl font-semibold tracking-tight text-zinc-950">
                      ${tier.price}
                    </span>
                    <span className="text-sm text-zinc-500">/ay</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {tier.price === null ? "sonsuza dek" : "yıllık ödemede"}
              </p>
              <p className="mt-4 text-sm/6 text-zinc-600">{tier.tagline}</p>
              <ul
                role="list"
                className="mt-6 flex-1 space-y-3 text-sm/6 text-zinc-600"
              >
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-x-3">
                    <CheckIcon
                      aria-hidden="true"
                      className={`h-6 w-5 flex-none ${tier.accent.check}`}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/company/kayit"
                className={
                  tier.price === null
                    ? "mt-8 block rounded-lg px-3.5 py-2.5 text-center text-sm font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-300 transition hover:bg-zinc-50 hover:ring-zinc-400"
                    : "mt-8 block rounded-lg bg-blue-600 px-3.5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                }
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl px-6 text-center text-xs text-zinc-500">
          {PRICING_NOTE}
        </p>
      </section>

      {/* SSS — ortalı başlık + çok kolonlu Q&A kartları */}
      <section id="sss" className="scroll-mt-24 border-t border-zinc-200 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Sıkça sorulan sorular
            </h2>
            <p className="mt-6 text-base/7 text-zinc-600">
              Aradığınız yanıtı bulamadınız mı?{" "}
              <a
                href={`mailto:${OPERATOR.supportEmail}`}
                className="font-semibold text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
              >
                bize e-posta gönder
              </a>
              , en kısa sürede dönelim.
            </p>
          </div>
          <Reveal className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl bg-white ring-1 ring-zinc-200 sm:mt-16">
            <dl className="divide-y divide-zinc-100">
              {faqs.map((faq) => (
                <Disclosure key={faq.q} as="div" className="p-6 sm:px-8">
                  <dt>
                    <DisclosureButton className="group flex w-full items-start justify-between text-left text-zinc-950">
                      <span className="text-base font-semibold transition group-hover:text-zinc-600">
                        {faq.q}
                      </span>
                      <span className="ml-6 flex h-7 items-center text-zinc-500 transition group-hover:text-zinc-950">
                        <PlusSmallIcon
                          aria-hidden="true"
                          className="size-6 group-data-open:hidden"
                        />
                        <MinusSmallIcon
                          aria-hidden="true"
                          className="size-6 group-not-data-open:hidden"
                        />
                      </span>
                    </DisclosureButton>
                  </dt>
                  <DisclosurePanel as="dd" className="mt-3 pr-10">
                    <p className="text-sm/7 text-zinc-600">{faq.a}</p>
                  </DisclosurePanel>
                </Disclosure>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* CTA — koyu panel */}
      <section className="px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative isolate overflow-hidden rounded-3xl bg-blue-950 px-6 py-20 text-center shadow-2xl sm:px-16">
            <h2 className="text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
              Firmanı bugün Rothern&apos;e taşı
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-zinc-300">
              Birkaç dakikada kaydol, ekibini davet et, ilk ilanını aç. Şeffaf
              ve denetlenebilir B2B ticaret.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-4">
              <Link
                href="/company/kayit"
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200"
              >
                Ücretsiz Kaydol
              </Link>
              <Link
                href="/company/login"
                className="text-sm/6 font-semibold text-white"
              >
                Giriş Yap <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div
              aria-hidden="true"
              className="absolute -top-24 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-white/10 to-transparent blur-3xl"
            />
          </div>
        </div>
      </section>

    </PublicLayout>
  );
}
