"use client";

import { OPERATOR } from "@/lib/company-info";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { usePricingPlans } from "@/lib/pricing/use-plans";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  ShareIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  UserIcon,
  UserPlusIcon,
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
import { CheckIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { signupHref } from "@/lib/public/visibility";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/**
 * Paket kartları — ad/fiyat/özellikler TEK KAYNAKTAN (`lib/pricing/plans.ts`
 * yapı + `web.pricing` kataloğu metin; `usePricingPlans`). accent: pakete
 * hafif renk kimliği, yalnız bu sayfanın sunumu — kart gövdesi monokrom kalır.
 *
 * METİN KATALOGDA (i18n Faz 1): `web.marketing.howItWorks.*`. Önizleme
 * kartlarındaki örnek veriler (firma adları, tutarlar, tarihler) de dile
 * göre değişir — İngilizce sayfada Türkçe sahte panel görünmesin.
 */

/* Mockup (2026-09-18): üç kart, ortadaki Silver "En popüler" (mavi çerçeve
   + taç rozeti), Gold sarı çerçeve. Ad/fiyat/özellik tek kaynak `plans.ts`. */
const PLAN_UI = {
  standart: { icon: UserIcon, tone: "zinc" },
  silver: { icon: Square3Stack3DIcon, tone: "blue" },
  gold: { icon: TrophyIcon, tone: "amber" },
} as const;

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
  const t = useTranslations("web.marketing.howItWorks.wizard");
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
            <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
            <div className="text-xs text-zinc-500">{t("steps")}</div>
          </div>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">{t("counter")}</span>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <div className="text-xs font-medium text-zinc-600">{t("scope")}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50/60 px-3 py-2.5 text-sm font-medium text-blue-700">
              <MapPinIcon className="size-4" />
              {t("domestic")}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-500">
              <GlobeAltIcon className="size-4" />
              {t("international")}
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-600">{t("type")}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50/60 px-3 py-2.5 text-sm font-medium text-blue-700">
              <ShoppingCartIcon className="size-4" />
              {t("buy")}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-500">
              <TagIcon className="size-4" />
              {t("sell")}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white">
        {t("continue")} <span aria-hidden>→</span>
      </div>
    </div>
  );
}

function BidsPreview() {
  const t = useTranslations("web.marketing.howItWorks.bids");
  const bids = [
    { n: t("firmB"), a: t("amountB"), best: true },
    { n: t("firmA"), a: t("amountA"), best: false },
    { n: t("firmC"), a: t("amountC"), best: false },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3 border-b border-zinc-100 bg-blue-50/50 px-6 py-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <ShoppingCartIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
          <div className="text-xs text-zinc-500">{t("subtitle")}</div>
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">{t("incoming")}</div>
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
            <LockClosedIcon className="size-3.5" /> {t("sealed")}
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
                  <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">{t("best")}</span>
                ) : null}
                <span className="text-sm font-medium text-zinc-800">{b.n}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold tabular-nums text-zinc-900">{b.a}</span>
                {b.best ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">{t("buy")}</span>
                ) : null}
                <ChevronRightIcon className="size-4 text-zinc-400" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <InformationCircleIcon className="size-4 text-zinc-400" /> {t("note")}
        </p>
      </div>
    </div>
  );
}

function ShowcasePreview() {
  const t = useTranslations("web.marketing.howItWorks.showcase");
  // Satış tarafı artık ÜRÜN VİTRİNİ: firma ürününü fiyat + minimum siparişle
  // yayımlar, alıcı bilgi talebi gönderir. (Satış ilanı 2026-09-04'te kaldırıldı.)
  const inquiries = [
    { n: t("buyerX"), t: t("inquiryX"), when: t("agoX"), fresh: false },
    { n: t("buyerY"), t: t("inquiryY"), when: t("agoY"), fresh: true },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3 border-b border-zinc-100 bg-emerald-50/50 px-6 py-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <BuildingStorefrontIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
          <div className="text-xs text-zinc-500">{t("subtitle")}</div>
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
                <div className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{t("product")}</div>
                <div className="text-sm font-semibold text-zinc-900">{t("productName")}</div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {t("live")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-100">
                <CircleStackIcon className="size-5 text-zinc-500" />
                <div>
                  <div className="text-[11px] text-zinc-500">{t("price")}</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">{t("priceValue")}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-100">
                <CubeIcon className="size-5 text-zinc-500" />
                <div>
                  <div className="text-[11px] text-zinc-500">{t("moq")}</div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">{t("moqValue")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">{t("inquiries")}</div>
          <span className="text-xs font-medium text-emerald-700">{t("seeAll")}</span>
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
                    <ChatBubbleLeftIcon className="size-3.5" /> {t("reply")}
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
  const t = useTranslations("web.marketing.howItWorks.order");
  const tl = [
    { t: t("created"), d: t("d1"), state: "done" },
    { t: t("shipped"), d: t("d2"), state: "done" },
    { t: t("delivered"), d: t("d3"), state: "active" },
    { t: t("completed"), d: "—", state: "todo" },
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
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{t("status")}</span>
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
        {/* "Teslim belgesi" çipi KALKTI: siparişte belge yükleme 2026-08-22'de
            kaldırıldı (CLAUDE.md § Mimari 11) — olmayan özellik tanıtılmaz. */}
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-600">
          <PaperClipIcon className="size-3.5" /> {t("shippingNotified")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          <ClockIcon className="size-3.5" /> {t("paymentPending")}
        </span>
      </div>
    </div>
  );
}

function DiscoverPreview() {
  const t = useTranslations("web.marketing.howItWorks.discover");
  const firms = [
    { n: t("firm1"), s: t("firm1Sub"), m: 3 },
    { n: t("firm2"), s: t("firm2Sub"), m: 2 },
    { n: t("firm3"), s: t("firm3Sub"), m: 1 },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UsersIcon className="size-6" />
          </span>
          <div>
            <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
            <div className="text-xs text-zinc-500">{t("subtitle")}</div>
          </div>
        </div>
        <span className="text-xs font-medium text-blue-600">{t("seeAll")}</span>
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
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{t("matches", { n: f.m })}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">{t("connect")}</span>
              <ChevronRightIcon className="size-4 text-zinc-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionsPreview() {
  const t = useTranslations("web.marketing.howItWorks.connections");
  const kinds = [
    { n: t("invited"), icon: UsersIcon },
    { n: t("sector"), icon: BuildingOfficeIcon },
    { n: t("prospects"), icon: UserPlusIcon },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <UsersIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
          <div className="text-xs text-zinc-500">{t("subtitle")}</div>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200">
        <MagnifyingGlassIcon className="size-4 text-zinc-400" />
        <span className="flex-1 text-xs text-zinc-400">{t("searchPlaceholder")}</span>
        <span className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{t("search")}</span>
      </div>
      <div className="mt-4 text-xs font-medium text-zinc-600">{t("kind")}</div>
      <div className="mt-1.5 space-y-2">
        {kinds.map((k) => (
          <div key={k.n} className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2">
            <k.icon className="size-4 text-emerald-700" />
            <span className="flex-1 text-xs font-medium text-zinc-800">{k.n}</span>
            <ChevronRightIcon className="size-4 text-zinc-400" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PublicProfilePreview() {
  const t = useTranslations("web.marketing.howItWorks.profile");
  // Mockup (2026-09-18): tarayıcı çerçevesi, yeşil kapak + sağ üstte slogan,
  // logo kutusu, ad + Doğrulanmış rozeti, sektör çipleri, tanıtım, üç
  // eylem satırı (web sitesi, katalog, teklif talep).
  const rows = [
    { icon: GlobeAltIcon, t: t("website"), a: t("visitSite"), ai: ArrowTopRightOnSquareIcon },
    { icon: DocumentTextIcon, t: t("catalog"), a: t("download"), ai: ArrowDownTrayIcon },
    { icon: EnvelopeIcon, t: t("rfqLine"), a: t("requestQuote"), ai: ArrowRightIcon },
  ];
  const tags = [t("tag1"), t("tag2"), t("tag3"), t("tag4")];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <span className="size-3 rounded-full bg-red-400" />
        <span className="size-3 rounded-full bg-amber-400" />
        <span className="size-3 rounded-full bg-emerald-400" />
      </div>
      <div className="relative h-24 bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500">
        <p className="absolute top-4 right-5 max-w-[11rem] text-right text-xs/5 font-medium text-white/90">
          {t("slogan")}
        </p>
      </div>
      {/* Logo kutusu kapağın ÜSTÜNE biner (relative + z-10); eskiden -mt ile
          kapağın altında kalıyordu (2026-09-18, kullanıcı). */}
      <div className="relative z-10 px-6 pb-6">
        <div className="-mt-8">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-md ring-4 ring-white">{t("initials")}</div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-bold text-zinc-900">{t("name")}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckIcon className="size-3" /> {t("verified")}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-zinc-500">{t("meta")}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{tag}</span>
          ))}
        </div>
        <p className="mt-3 text-xs/5 text-zinc-600">{t("about")}</p>
        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.t} className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2">
              <r.icon className="size-4 text-zinc-500" />
              <span className="flex-1 truncate text-xs text-zinc-700">{r.t}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
                {r.a} <r.ai className="size-3" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignupPreview() {
  const t = useTranslations("web.marketing.howItWorks.invite");
  // Mockup (2026-09-18): "Ekip Arkadaşı Davet Et" formu — ad, e-posta, rol
  // çipleri (Yönetici seçili, mavi), mavi "Davet Gönder".
  const roles = [t("roleAdmin"), t("roleBuy"), t("roleSell"), t("roleApprover")];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <UserPlusIcon className="size-6" />
        </span>
        <div>
          <div className="text-base font-semibold text-zinc-950">{t("title")}</div>
          <div className="text-xs text-zinc-500">{t("subtitle")}</div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <div>
          <div className="text-xs font-medium text-zinc-600">{t("name")}</div>
          <div className="mt-1 flex h-10 items-center rounded-lg bg-zinc-100 px-3 text-sm text-zinc-700">{t("nameValue")}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-600">{t("email")}</div>
          <div className="mt-1 flex h-10 items-center rounded-lg bg-zinc-100 px-3 text-sm text-zinc-700">{t("emailValue")}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-600">{t("role")}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {roles.map((r, i) => (
              <span
                key={r}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                  i === 0 ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-700 ring-zinc-200"
                }`}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white">
        <PaperAirplaneIcon className="size-4" /> {t("send")}
      </div>
    </div>
  );
}

const TONE_BADGE = {
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
} as const;

/** Göz başlığı: mavi kısa çizgi + metin (mockup). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-base/7 font-semibold text-blue-600">
      <span aria-hidden className="h-1 w-6 rounded-full bg-blue-600" />
      {children}
    </h2>
  );
}

/** Soluk mavi/yeşil lekeler + nokta desenleri — dekoratif, lg+ */
function SoftBlobs({ flip = false }: { flip?: boolean }) {
  const dots = "radial-gradient(currentColor 1.5px, transparent 1.5px)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
      <div className={`absolute top-10 size-[28rem] rounded-full blur-3xl ${flip ? "-right-40 bg-emerald-100/50" : "-left-40 bg-blue-100/50"}`} />
      <div className={`absolute bottom-0 size-[24rem] rounded-full blur-3xl ${flip ? "-left-40 bg-blue-100/50" : "-right-40 bg-emerald-100/50"}`} />
      <div className="absolute top-1/3 left-[6%] h-14 w-24 text-zinc-300" style={{ backgroundImage: dots, backgroundSize: "14px 14px" }} />
      <div className="absolute top-1/2 right-[5%] h-14 w-24 text-zinc-300" style={{ backgroundImage: dots, backgroundSize: "14px 14px" }} />
    </div>
  );
}

function FeatureText({
  icon: Icon,
  tone,
  title,
  body,
  bullets,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald";
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div className="flex gap-5">
      <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${tone === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-700"}`}>
        <Icon className="size-7" />
      </span>
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">{title}</h3>
        <p className="mt-3 text-base/7 text-zinc-600">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-x-3 text-zinc-700">
              <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckIcon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="text-base">{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FormatCard({
  tag,
  tagTone,
  title,
  body,
  children,
}: {
  tag: string;
  tagTone: keyof typeof TONE_BADGE;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">{children}</div>
      <span className={`mt-5 inline-flex w-fit rounded-lg px-2.5 py-1 text-xs font-semibold ${TONE_BADGE[tagTone]}`}>{tag}</span>
      <h3 className="mt-3 text-xl font-bold text-zinc-950">{title}</h3>
      <p className="mt-1.5 text-sm/6 text-zinc-600">{body}</p>
    </div>
  );
}

/**
 * "El yazısı" not + kıvrık ok (2026-09-18 mockup). Font kuralı: yalnız Inter —
 * el yazısı fontu EKLENMEZ; italik + hafif eğim + yeşil kıvrık ok aynı hissi
 * verir. Dekoratif (aria-hidden), yalnız lg+; kartın dışına taşar.
 */
function HandNote({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const right = side === "right";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute hidden select-none lg:block ${
        right ? "-top-10 -right-24 w-44 rotate-[8deg]" : "bottom-4 -left-40 w-32 -rotate-[8deg]"
      }`}
    >
      <p className={`text-sm/5 font-semibold italic tracking-tight text-blue-600 ${right ? "text-left" : "text-right"}`}>{children}</p>
      <svg
        viewBox="0 0 80 48"
        className={`mt-1 h-10 w-16 text-emerald-500 ${right ? "-ml-6 -scale-x-100" : "ml-auto"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6c14 2 36 10 56 30" />
        <path d="M50 38l12 2-2-12" />
      </svg>
      {right ? (
        <svg viewBox="0 0 24 24" className="absolute -top-6 right-2 size-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 3v6M5 7l4 3M19 7l-4 3" />
        </svg>
      ) : null}
    </div>
  );
}

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

const HERO_STEP_TONES = ["bg-blue-50 text-blue-700", "bg-emerald-50 text-emerald-700", "bg-violet-50 text-violet-700"] as const;

export default function HomePage() {
  const t = useTranslations("web.marketing.howItWorks");
  const { plans, note } = usePricingPlans();
  const pricingTiers = plans.map((p) => ({
    slug: p.slug,
    name: p.name,
    price: p.monthlyUsd,
    tagline: p.tagline,
    features: p.features,
    cta: p.cta,
    subtitle: t(`plans.${p.slug}Subtitle`),
    ...PLAN_UI[p.slug],
  }));
  const faqs = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3", { n: PRODUCT_LIMITS.STANDART ?? 0 }) },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
  ];
  const heroSteps = [
    { n: "01", title: t("hero.step1Title"), body: t("hero.step1Body"), tone: HERO_STEP_TONES[0] },
    { n: "02", title: t("hero.step2Title"), body: t("hero.step2Body"), tone: HERO_STEP_TONES[1] },
    { n: "03", title: t("hero.step3Title"), body: t("hero.step3Body"), tone: HERO_STEP_TONES[2] },
  ];
  const featureTop = [
    { icon: BuildingStorefrontIcon, title: t("features.showcaseTitle"), body: t("features.showcaseBody"), preview: <ShowcasePreview /> },
    { icon: ShoppingCartIcon, title: t("features.bidsTitle"), body: t("features.bidsBody"), preview: <BidsPreview /> },
  ];
  const featureBottom = [
    { icon: DocumentTextIcon, title: t("features.wizardTitle"), body: t("features.wizardBody"), preview: <ListingWizardPreview /> },
    { icon: TruckIcon, title: t("features.orderTitle"), body: t("features.orderBody"), preview: <OrderTimelinePreview /> },
    { icon: UsersIcon, title: t("features.discoverTitle"), body: t("features.discoverBody"), preview: <DiscoverPreview /> },
  ];
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
              {t("hero.badge")}
            </span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-7xl">
            <span className="block text-zinc-950">
              {t.rich("hero.title1", {
                buy: (chunks) => <span className="text-blue-600">{chunks}</span>,
                sell: (chunks) => <span className="text-emerald-600">{chunks}</span>,
              })}
            </span>
            <span className="block text-zinc-950">{t("hero.title2")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-600 sm:text-xl/8">
            {t("hero.lead")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/urunler"
              className="rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {t("hero.ctaBuyer")}
            </Link>
            <Link
              href={signupHref("vitrin")}
              className="rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-950/60 transition hover:bg-zinc-50"
            >
              {t("hero.ctaSupplier")} <span aria-hidden="true">→</span>
            </Link>
          </div>

          <ol className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
            {heroSteps.map((st, i) => (
              <li key={st.n} className="relative flex flex-col items-center text-center">
                {i < heroSteps.length - 1 ? (
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
          <h2 className="text-base/7 font-semibold text-zinc-500">{t("features.eyebrow")}</h2>
          <p className="mt-2 max-w-3xl text-4xl font-bold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
            {t("features.title")}
          </p>

          {/* 2026-09-18 mockup: üstte iki büyük kart (Tedarikçi · Alıcı), altta
              üç kart; her kartın altında ikon rozetli başlık + açıklama. */}
          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {featureTop.map((f) => (
              <div key={f.title} className="flex flex-col">
                {/* Yan yana kartlar eşit boy (2026-09-18, kullanıcı): önizleme
                    kutusu satırdaki en uzuna uzar; mock kart içi dikey esner. */}
                <div className="flex flex-1 flex-col rounded-3xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80 [&>*]:flex-1">{f.preview}</div>
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
            {featureBottom.map((f) => (
              <div key={f.title} className="flex flex-col">
                {/* Yan yana kartlar eşit boy (2026-09-18, kullanıcı): önizleme
                    kutusu satırdaki en uzuna uzar; mock kart içi dikey esner. */}
                <div className="flex flex-1 flex-col rounded-3xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/80 [&>*]:flex-1">{f.preview}</div>
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

      {/* Tek panelde her şey — ekip & ağ (2026-09-18 mockup: beyaz zemin,
          mavi kısa çizgili göz başlığı, ikon rozetli alt başlıklar, yeşil
          onay işaretleri, soluk mavi/yeşil lekeler + nokta desenleri) */}
      <section id="nasil" className="relative isolate scroll-mt-24 overflow-hidden bg-white py-24 sm:py-32">
        <SoftBlobs />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <Eyebrow>{t("control.eyebrow")}</Eyebrow>
            <p className="mt-2 text-4xl font-bold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              {t("control.title")}
            </p>
          </div>

          <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <FeatureText
                icon={UserPlusIcon}
                tone="blue"
                title={t("control.teamTitle")}
                body={t("control.teamBody")}
                bullets={[t("control.teamB1"), t("control.teamB2"), t("control.teamB3")]}
              />
              <div className="relative">
                <SignupPreview />
                <HandNote side="right">{t("control.teamNote")}</HandNote>
              </div>
            </Reveal>

            <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="relative"><ConnectionsPreview /></div>
              <FeatureText
                icon={ShareIcon}
                tone="emerald"
                title={t("control.networkTitle")}
                body={t("control.networkBody")}
                bullets={[t("control.networkB1"), t("control.networkB2"), t("control.networkB3")]}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Herkese açık profil (Vitrin) */}
      <section className="relative isolate overflow-hidden bg-white py-24 sm:py-32">
        <SoftBlobs flip />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="relative">
              <HandNote side="left">{t("showcaseSection.note")}</HandNote>
              <Eyebrow>{t("showcaseSection.eyebrow")}</Eyebrow>
              <p className="mt-2 text-4xl font-bold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
                {t("showcaseSection.title")}
              </p>
              <p className="mt-6 text-lg/8 text-zinc-600">{t("showcaseSection.body")}</p>
              <ul className="mt-6 space-y-3">
                {[t("showcaseSection.b1"), t("showcaseSection.b2"), t("showcaseSection.b3")].map((b) => (
                  <li key={b} className="flex gap-x-3 text-zinc-700">
                    <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <CheckIcon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="text-base">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Reveal className="relative"><PublicProfilePreview /></Reveal>
          </div>
        </div>
      </section>

      {/* Satın Alma Talebi türleri (2026-09-18 mockup) */}
      <section className="relative isolate overflow-hidden bg-white py-24 sm:py-32">
        <SoftBlobs />
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex items-center justify-center gap-3 text-sm font-semibold text-blue-600">
              <span aria-hidden className="h-px w-8 bg-blue-600" />
              {t("formats.eyebrow")}
              <span aria-hidden className="h-px w-8 bg-blue-600" />
            </div>
            <p className="mt-3 text-4xl font-bold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              {t("formats.title")}
            </p>
            <p className="mt-5 text-lg/8 text-zinc-600">{t("formats.lead")}</p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:mt-20 sm:grid-cols-2">
            {/* RFQ — kapalı zarf */}
            <FormatCard tag={t("formats.rfqTag")} tagTone="blue" title={t("formats.rfqTitle")} body={t("formats.rfqBody")}>
              <div className="space-y-2">
                {[
                  { n: t("bids.firmA"), a: t("formats.rfqA"), best: false },
                  { n: t("bids.firmB"), a: t("formats.rfqB"), best: true },
                  { n: t("bids.firmC"), a: t("formats.rfqC"), best: false },
                ].map((b) => (
                  <div key={b.n} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ring-1 ${b.best ? "bg-emerald-50 ring-emerald-300" : "bg-white ring-zinc-200"}`}>
                    <span className={`flex size-7 items-center justify-center rounded-md ${b.best ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-600"}`}>
                      <BuildingOfficeIcon className="size-4" />
                    </span>
                    <span className={`flex-1 text-sm ${b.best ? "font-semibold text-emerald-800" : "text-zinc-700"}`}>{b.n}</span>
                    <span className={`text-sm tabular-nums ${b.best ? "font-bold text-emerald-800" : "text-zinc-700"}`}>{b.a}</span>
                    <span className="text-zinc-400" aria-hidden>···</span>
                  </div>
                ))}
              </div>
            </FormatCard>

            {/* Pazarlık — eksiltme */}
            <FormatCard tag={t("formats.auctionTag")} tagTone="amber" title={t("formats.auctionTitle")} body={t("formats.auctionBody")}>
              <div className="grid grid-cols-4 items-end gap-3 pt-8">
                {[
                  { v: t("formats.auction1"), h: "100%", c: "bg-amber-200" },
                  { v: t("formats.auction2"), h: "76%", c: "bg-amber-200" },
                  { v: t("formats.auction3"), h: "56%", c: "bg-amber-200" },
                  { v: t("formats.auction4"), h: "30%", c: "bg-orange-500", now: true },
                ].map((b) => (
                  <div key={b.v} className="flex flex-col items-center gap-2">
                    <div className="relative flex h-24 w-full items-end">
                      {b.now ? (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-orange-100 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-orange-700">
                          {t("formats.current")}
                        </span>
                      ) : null}
                      <div className={`w-full rounded-md ${b.c}`} style={{ height: b.h }} />
                    </div>
                    <span className={`text-xs tabular-nums ${b.now ? "font-bold text-orange-600" : "text-zinc-500"}`}>{b.v}</span>
                  </div>
                ))}
              </div>
            </FormatCard>

            {/* AI — belgeden talep taslağı (2026-09-18, kullanıcı: "fiyat/min.
                sipariş kartını beğenmedim, AI olabilir"). Ürün Silver+/Gold. */}
            <FormatCard tag={t("formats.aiTag")} tagTone="violet" title={t("formats.aiTitle")} body={t("formats.aiBody")}>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 ring-1 ring-zinc-200">
                  <span className="flex size-7 items-center justify-center rounded-md bg-violet-50 text-violet-600"><DocumentTextIcon className="size-4" /></span>
                  <span className="flex-1 truncate text-sm text-zinc-700">{t("formats.aiFile")}</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white"><SparklesIcon className="size-3" /> {t("formats.aiRead")}</span>
                </div>
                {[
                  { n: t("formats.aiItem1"), q: t("formats.aiQty1") },
                  { n: t("formats.aiItem2"), q: t("formats.aiQty2") },
                  { n: t("formats.aiItem3"), q: t("formats.aiQty3") },
                ].map((it) => (
                  <div key={it.n} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200">
                    <span className="size-1.5 rounded-full bg-violet-400" />
                    <span className="flex-1 truncate text-xs text-zinc-700">{it.n}</span>
                    <span className="text-xs font-semibold tabular-nums text-zinc-900">{it.q}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-200">
                  <span className="text-xs text-violet-800">{t("formats.aiCategory")}</span>
                  <span className="text-xs font-semibold text-violet-800">{t("formats.aiCategoryValue")}</span>
                </div>
              </div>
            </FormatCard>

            {/* Onay akışları */}
            <FormatCard tag={t("formats.approvalTag")} tagTone="violet" title={t("formats.approvalTitle")} body={t("formats.approvalBody")}>
              <div className="space-y-2">
                {[
                  { n: t("formats.ap1"), r: t("formats.ap1r"), done: true },
                  { n: t("formats.ap2"), r: t("formats.ap2r"), done: true },
                  { n: t("formats.ap3"), r: t("formats.ap3r"), done: false },
                ].map((st) => (
                  <div key={st.n} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ring-1 ${st.done ? "bg-white ring-zinc-200" : "bg-violet-50 ring-violet-200"}`}>
                    <span className={`flex size-6 items-center justify-center rounded-full ${st.done ? "bg-emerald-500 text-white" : "bg-violet-500 text-white"}`}>
                      {st.done ? <CheckIcon className="size-3.5" /> : <span className="size-2 rounded-full bg-white" />}
                    </span>
                    <span className={`flex-1 text-sm font-medium ${st.done ? "text-zinc-800" : "text-violet-800"}`}>{st.n}</span>
                    <span className={`text-xs ${st.done ? "text-zinc-500" : "font-semibold text-violet-700"}`}>{st.r}</span>
                  </div>
                ))}
              </div>
            </FormatCard>
          </div>
        </div>
      </section>

      {/* Üyelik */}
      <section id="fiyatlar" className="relative isolate scroll-mt-24 overflow-hidden bg-white py-24 sm:py-32">
        <SoftBlobs flip />
        <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
          <div className="flex items-center justify-center gap-3 text-xs font-semibold tracking-[0.2em] text-blue-600 uppercase">
            <span aria-hidden className="h-px w-8 bg-blue-600" />
            {t("pricing.eyebrow")}
            <span aria-hidden className="h-px w-8 bg-blue-600" />
          </div>
          <p className="mt-3 text-4xl font-bold tracking-tight text-balance text-zinc-950 sm:text-5xl">
            {t("pricing.title")}
          </p>
          <p className="mt-4 text-lg/8 text-zinc-600">{t("pricing.lead")}</p>
        </div>
        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-stretch gap-6 px-6 sm:mt-20 lg:max-w-7xl lg:grid-cols-3 lg:px-8">
          {pricingTiers.map((tier) => {
            const popular = tier.slug === "silver";
            const ring =
              tier.tone === "blue" ? "ring-2 ring-blue-500" : tier.tone === "amber" ? "ring-2 ring-amber-300" : "ring-1 ring-zinc-200";
            const iconBox =
              tier.tone === "blue" ? "bg-blue-50 text-blue-600" : tier.tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-zinc-100 text-zinc-700";
            const check =
              tier.tone === "blue" ? "bg-blue-100 text-blue-700" : tier.tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600";
            return (
              <div
                key={tier.slug}
                className={`relative flex flex-col rounded-3xl bg-white p-8 transition hover:-translate-y-1 hover:shadow-xl ${ring}`}
              >
                {popular ? (
                  <span className="absolute -top-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-md">
                    <TrophyIcon className="size-3.5 text-amber-300" /> {t("plans.popular")}
                  </span>
                ) : null}
                <div className="flex items-center gap-3">
                  <span className={`flex size-14 items-center justify-center rounded-full ${iconBox}`}>
                    <tier.icon className="size-7" />
                  </span>
                  <div>
                    <div className="text-lg font-semibold text-zinc-950">{tier.name}</div>
                    <div className="text-sm text-zinc-500">{tier.subtitle}</div>
                  </div>
                </div>
                <p className="mt-6 flex items-baseline gap-x-2">
                  {tier.price === null ? (
                    <span className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">{t("plans.free")}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">${tier.price}</span>
                      <span className="text-base text-zinc-500">{t("plans.perMonth")}</span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-sm text-zinc-500">{tier.price === null ? t("plans.forever") : t("plans.yearly")}</p>
                <p className="mt-5 border-b border-zinc-200 pb-5 text-sm/6 text-zinc-600">{tier.tagline}</p>
                <ul role="list" className="mt-5 flex-1 space-y-3 text-sm/6 text-zinc-700">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-x-3">
                      <span className={`mt-0.5 flex size-5 flex-none items-center justify-center rounded-full ${check}`}>
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/company/kayit"
                  className={
                    tier.price === null
                      ? "mt-8 flex items-center justify-center gap-2 rounded-lg px-3.5 py-3 text-center text-sm font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-300 transition hover:bg-zinc-50 hover:ring-zinc-400"
                      : "mt-8 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                  }
                >
                  {tier.cta} <ArrowRightIcon className="size-4" />
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-2xl px-6 text-center text-xs text-zinc-500">{note}</p>
        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 text-sm text-zinc-600">
          <span className="inline-flex items-center gap-2"><ShieldCheckIcon className="size-5 text-zinc-500" /> {t("pricing.trust1")}</span>
          <span className="inline-flex items-center gap-2"><UsersIcon className="size-5 text-zinc-500" /> {t("pricing.trust2")}</span>
          <span className="inline-flex items-center gap-2"><ChartBarIcon className="size-5 text-zinc-500" /> {t("pricing.trust3")}</span>
        </div>
      </section>

      {/* SSS — ortalı başlık + çok kolonlu Q&A kartları */}
      <section id="sss" className="scroll-mt-24 border-t border-zinc-200 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* SSS (2026-09-19, kullanıcı mockup'ı): üstte kısa mavi çizgi,
              daha sakin başlık, mavi e-posta bağlantısı, "+" gri yuvarlakta. */}
          <div className="mx-auto max-w-2xl text-center">
            <span aria-hidden className="mx-auto mb-6 block h-1 w-14 rounded-full bg-blue-600" />
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {t("faqSection.title")}
            </h2>
            <p className="mt-4 text-base/7 text-zinc-500">
              {t.rich("faqSection.lead", {
                mail: (chunks) => (
                  <a
                    href={`mailto:${OPERATOR.supportEmail}`}
                    className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
          <Reveal className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 sm:mt-12">
            <dl className="divide-y divide-zinc-100">
              {faqs.map((faq) => (
                <Disclosure key={faq.q} as="div" className="px-6 py-5 sm:px-8">
                  <dt>
                    <DisclosureButton className="group flex w-full items-center justify-between text-left text-zinc-950">
                      <span className="text-[15px] font-semibold">
                        {faq.q}
                      </span>
                      <span className="ml-6 flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition group-hover:bg-zinc-200">
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
          {/* LACİVERT BANT (2026-09-19, kullanıcı mockup'ı): derin lacivert
              gradyan + köşelerde ince halka çizgileri. */}
          <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-blue-950 to-indigo-900 px-6 py-20 text-center shadow-2xl sm:px-16">
            <h2 className="text-4xl font-bold tracking-tight text-balance text-white sm:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-blue-100/80">
              {t("cta.body")}
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/company/kayit"
                className="rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-100"
              >
                {t("cta.signup")}
              </Link>
              <Link
                href="/company/login"
                className="inline-flex items-center gap-2 text-base font-semibold text-white hover:text-blue-100"
              >
                {t("cta.login")} <span aria-hidden="true">→</span>
              </Link>
            </div>
            {/* Dekor: sol altta ve sağ üstte ince halkalar. */}
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 -z-10 size-[28rem] rounded-full border border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -left-36 -z-10 size-[34rem] rounded-full border border-white/5" />
            <div aria-hidden="true" className="pointer-events-none absolute -top-48 -right-24 -z-10 size-[30rem] rounded-full border border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -top-60 -right-36 -z-10 size-[36rem] rounded-full border border-white/5" />
          </div>
        </div>
      </section>

    </PublicLayout>
  );
}
