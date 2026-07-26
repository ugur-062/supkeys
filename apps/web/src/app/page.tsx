"use client";

import { RothernLogo } from "@/components/brand/logo";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  MinusSmallIcon,
  PlusSmallIcon,
} from "@heroicons/react/24/outline";
import { ArrowTrendingDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const stats = [
  { prefix: "", value: 13305, suffix: "", l: "Kategoride hassas eşleşme (UNSPSC)" },
  { prefix: "", value: 98, suffix: " ülke", l: "Yurtiçi + uluslararası erişim" },
  { prefix: "%", value: 0, suffix: "", l: "Komisyon — maliyetsiz ulaş" },
  { text: "∞", l: "Firmayla tek panelde buluş" },
];

const standartFeatures = [
  "Yalnızca bağlantılı firmalara teklif ver",
  "Sipariş, teslim & ödeme takibi",
];

const premiumFeatures = [
  "Kendi ilanını aç — teklif toplama, açık eksiltme, satış",
  "Herkese açık ilanlara tam erişim & teklif",
  "Kategori eşleşmeli firma keşfi & dizin",
  "Herkese açık firma profili",
  "Raporlar, şablonlar & soru setleri",
  "Öncelikli destek",
];

const faqs = [
  {
    q: "Alıcı ve tedarikçi ayrı mı kayıt oluyor?",
    a: "Hayır. Rothern'de tek firma hesabı var; aynı hesap hem alış hem satış yapar. Kişilere atadığın roller (Satın Almacı / Satışçı) neyi görüp yapabileceğini belirler.",
  },
  {
    q: "Tedarikçiler birbirinin teklifini görür mü?",
    a: "Asla. Kapalı zarf: her tedarikçi yalnızca kendi teklifini görür. İlan sahibi tüm teklifleri görür ve en iyisini kazandırır.",
  },
  {
    q: "Standart üyelikle ne yapabilirim?",
    a: "Bağlandığın firmaların ilanlarına teklif verebilir, sipariş ve belge akışını yürütebilirsin. Kendi ilanını açmak, firma keşfetmek ve herkese açık ilanlara teklif vermek Premium ile gelir.",
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

const footerNav = {
  urun: [
    { name: "Özellikler", href: "#ozellikler" },
    { name: "Nasıl Çalışır", href: "#nasil" },
    { name: "Üyelik", href: "#uyelik" },
    { name: "SSS", href: "#sss" },
  ],
  hesap: [
    { name: "Giriş Yap", href: "/company/login" },
    { name: "Kaydol", href: "/company/kayit" },
  ],
  yasal: [
    { name: "Kullanıcı Sözleşmesi", href: "/sozlesmeler/kullanici" },
    { name: "Aracılık Sözleşmesi", href: "/sozlesmeler/aracilik" },
    { name: "KVKK Aydınlatma Metni", href: "/sozlesmeler/kvkk" },
  ],
};

const social = [
  {
    name: "LinkedIn",
    href: "#",
    icon: (props: React.ComponentProps<"svg">) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
      </svg>
    ),
  },
  {
    name: "X",
    href: "#",
    icon: (props: React.ComponentProps<"svg">) => (
      <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
        <path d="M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5685 21H20.8131L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z" />
      </svg>
    ),
  },
];

const previewRows = [
  { dot: "bg-blue-500", t: "“Uluslararası çelik alımı” ilanına 3 teklif geldi", a: "İncele" },
  { dot: "bg-emerald-500", t: "“Fazla bakır satışı” siparişini kargola", a: "Gönder" },
  { dot: "bg-emerald-500", t: "Üçüncü Firma bağlantı daveti gönderdi", a: "Görüntüle" },
  { dot: "bg-blue-500", t: "“Ofis mobilyası” ödemesini tamamla", a: "Tamamla" },
];

const previewNav = ["İşlerim", "İlanlar", "Teklifler", "Siparişler", "Bağlantılar", "Keşfet"];

function AppPreview() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setActive((a) => (a + 1) % previewRows.length),
      1900,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl bg-zinc-950 p-2 shadow-2xl ring-1 ring-zinc-950/10">
      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
        {/* pencere çubuğu */}
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400" />
          <span className="size-3 rounded-full bg-amber-400" />
          <span className="size-3 rounded-full bg-emerald-400" />
          <div className="ml-3 hidden h-5 max-w-xs flex-1 rounded bg-zinc-200/70 sm:block" />
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-48 shrink-0 bg-[#0A0A0A] p-4 sm:block">
            <RothernLogo variant="full" size="sm" />
            <div className="mt-6 space-y-1">
              {previewNav.map((n, i) => (
                <div
                  key={n}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    i === 0 ? "bg-white/10 text-white" : "text-zinc-400"
                  }`}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
          {/* ana içerik */}
          <div className="flex-1 bg-zinc-50/60 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold text-zinc-900">
                İşlerim
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                canlı
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Dikkat bekleyen işler — alış ve satış, tek akışta
            </p>
            <div className="mt-4 space-y-2">
              {previewRows.map((r, i) => (
                <div
                  key={r.t}
                  className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 transition-all duration-500 ${
                    i === active
                      ? "-translate-y-0.5 border-zinc-300 shadow-md ring-1 ring-zinc-900/10"
                      : "border-zinc-950/5 shadow-sm"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`size-2 shrink-0 rounded-full ${r.dot}`} />
                    <span className="truncate text-sm text-zinc-800">{r.t}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      i === active
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {r.a}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountUp({
  value,
  prefix = "",
  suffix = "",
  duration = 1500,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(eased * value));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {n.toLocaleString("tr-TR")}
      {suffix}
    </span>
  );
}

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
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="text-sm font-semibold text-zinc-900">Yeni İlan</div>
      <div className="mt-0.5 text-xs text-zinc-500">
        Kapsam → Tür → Format → Detay
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-medium text-zinc-500">Kapsam</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg border-2 border-zinc-900 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900">
              Yurtiçi
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
              Uluslararası
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500">Tür</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              <span className="size-2 rounded-full bg-blue-500" />
              Alış
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
              <span className="size-2 rounded-full bg-emerald-500" />
              Satış
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 w-full rounded-lg bg-zinc-950 py-2 text-center text-sm font-semibold text-white">
        Devam
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
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900">Gelen Teklifler</div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
          Kapalı zarf
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {bids.map((b) => (
          <div
            key={b.n}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
              b.best ? "border-emerald-300 bg-emerald-50" : "border-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {b.best ? (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  EN İYİ
                </span>
              ) : null}
              <span className="text-sm font-medium text-zinc-800">{b.n}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-900">{b.a}</span>
              {b.best ? (
                <span className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                  Al
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Tedarikçiler birbirinin teklifini görmez.
      </p>
    </div>
  );
}

function SaleListingPreview() {
  // Kazandır sabit — satışta en YÜKSEK teklif kazanır (animasyon yok).
  const offers = [
    { n: "Alıcı X", a: "62.000 ₺", best: false },
    { n: "Alıcı Y", a: "71.500 ₺", best: false },
    { n: "Alıcı Z", a: "80.000 ₺", best: true },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center justify-between">
        <div>
          <div className="tabular-nums text-[11px] font-medium text-zinc-400">
            SATIŞ · ROT-000142
          </div>
          <div className="text-sm font-semibold text-zinc-900">
            Fazla bakır · 5 ton
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Açık
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
          <div className="text-[10px] text-zinc-400">Taban</div>
          <div className="text-sm font-semibold text-zinc-900">50.000 ₺</div>
        </div>
        <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
          <div className="text-[10px] text-emerald-600">Hemen-Al</div>
          <div className="text-sm font-semibold text-emerald-800">80.000 ₺</div>
        </div>
      </div>
      <div className="mt-4 text-[11px] font-medium text-zinc-500">
        Sana gelen teklifler
      </div>
      <div className="mt-1.5 space-y-1.5">
        {offers.map((o) => (
          <div
            key={o.n}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              o.best
                ? "border-emerald-300 bg-emerald-50"
                : "border-zinc-200"
            }`}
          >
            <span className="text-xs font-medium text-zinc-700">{o.n}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-900">{o.a}</span>
              {o.best ? (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Kazandır
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderTimelinePreview() {
  const tl = [
    { t: "Sipariş oluştu", state: "done" },
    { t: "Sipariş gönderildi", state: "done" },
    { t: "Teslim alındı", state: "active" },
    { t: "Tamamlandı", state: "todo" },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center justify-between">
        <div className="tabular-nums text-sm font-semibold text-zinc-900">
          ROT-ORD-000128
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Teslimde
        </span>
      </div>
      <ol className="mt-5 space-y-4">
        {tl.map((s, i) => (
          <li key={s.t} className="flex items-center gap-3">
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                s.state === "done"
                  ? "bg-emerald-600 text-white"
                  : s.state === "active"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                s.state === "todo"
                  ? "text-zinc-400"
                  : "font-medium text-zinc-900"
              }`}
            >
              {s.t}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex gap-2">
        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
          Teslim belgesi
        </span>
        <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Ödeme bekleniyor
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
      <div className="text-sm font-semibold text-zinc-900">Keşfet</div>
      <div className="mt-0.5 text-xs text-zinc-400">
        Kategori eşleşmeli firmalar
      </div>
      <div className="mt-4 space-y-2">
        {firms.map((f) => (
          <div
            key={f.n}
            className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-zinc-800">
                {f.n}
              </div>
              <div className="text-[10px] text-zinc-400">{f.s}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                {f.m} eşleşme
              </span>
              <span className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white">
                Bağlan
              </span>
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
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
          <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
          Gelen davet
        </div>
        <div className="mt-1.5 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <span className="text-xs font-medium text-zinc-800">
            Mavi Lojistik A.Ş.
          </span>
          <span className="rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white">
            Kabul Et
          </span>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-medium text-zinc-500">
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
      <div className="h-20 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-700" />
      <div className="px-6 pb-6">
        <div className="-mt-8">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-zinc-950 text-xl font-bold text-white ring-4 ring-white">
            DÇ
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-bold text-zinc-900">
              Demo Çelik A.Ş.
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckIcon className="size-3" />
              Doğrulanmış
            </span>
          </div>
          <div className="mt-0.5 text-sm text-zinc-500">
            Metal & Çelik · İstanbul, Türkiye
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
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
          ticareti. Açık ihalelerimize teklif verin.
        </p>
        <div className="mt-5 text-[11px] font-medium text-zinc-500">
          Açık ihaleleri
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
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${x.c}`}
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
    { n: "Satın Almacı", on: true },
    { n: "Satışçı", on: true },
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
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <span
                key={r.n}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  r.on
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-zinc-200 text-zinc-400"
                }`}
              >
                {r.n}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 w-full rounded-lg bg-zinc-950 py-2 text-center text-sm font-semibold text-white">
        Kaydol
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="bg-white">
      <MarketingHeader />

      {/* Hero — sade beyaz zemin (grid deseni + gradient + uçuşan kartlar kaldırıldı) */}
      <section className="relative isolate overflow-hidden bg-white px-6 pb-20 lg:px-8">
        <div className="mx-auto max-w-3xl pt-24 pb-16 sm:pt-32 lg:pt-36">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm/6 font-medium text-zinc-700 ring-1 ring-zinc-950/10 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Al · Sat · Keşfet
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-7xl">
              Hem al, hem sat —{" "}
              <span className="text-zinc-500">tek platformda.</span>
            </h1>
            <div className="mt-10 flex items-center justify-center gap-x-4">
              <Link
                href="/company/kayit"
                className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                Ücretsiz Kaydol
              </Link>
              <Link
                href="/company/login"
                className="text-sm/6 font-semibold text-zinc-950"
              >
                Giriş Yap <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
        {/* Ürün önizleme (canlı) */}
        <div className="relative mx-auto max-w-5xl">
          <AppPreview />
        </div>
      </section>

      {/* Pazar & erişim */}
      <section className="relative isolate overflow-hidden bg-[#0A0A0A] py-24 sm:py-32">
        {/* grid deseni */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full stroke-white/5 [mask-image:radial-gradient(48rem_32rem_at_50%_30%,white,transparent)]"
        >
          <defs>
            <pattern
              id="reach-grid"
              width={56}
              height={56}
              x="50%"
              patternUnits="userSpaceOnUse"
            >
              <path d="M.5 56V.5H56" fill="none" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" strokeWidth={0} fill="url(#reach-grid)" />
        </svg>
        {/* yumuşak yüzen glow */}
        <div
          aria-hidden="true"
          className="rt-float-slow absolute top-1/2 left-1/2 -z-10 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-white/5 to-transparent blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
            <h2 className="text-base/8 font-semibold text-emerald-400">
              Pazar & erişim
            </h2>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-white sm:text-5xl">
              Daha geniş pazara, daha fazla müşteriye
            </p>
            <p className="mt-6 text-lg/8 text-zinc-300">
              İlanın kategori eşleşmesiyle doğru alıcı ya da satıcıya ulaşır.
              Ağını büyüt, yeni müşterilerle tek panelde buluş; komisyon yok,
              sınır yok.
            </p>
          </div>
          <Reveal className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-10 sm:mt-20 sm:grid-cols-2 sm:gap-y-14 lg:mx-0 lg:max-w-none lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.l}
                className="flex flex-col gap-y-3 border-l border-white/15 pl-6"
              >
                <div className="text-sm/6 text-zinc-400">{s.l}</div>
                <div className="order-first text-3xl font-bold tracking-tight text-white tabular-nums sm:text-4xl">
                  {"text" in s ? (
                    s.text
                  ) : (
                    <CountUp
                      value={s.value}
                      prefix={s.prefix}
                      suffix={s.suffix}
                    />
                  )}
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Özellikler — 2 sıra bento (2.sırada 3 sütun) */}
      <section id="ozellikler" className="py-24 sm:py-32">
        <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
          <h2 className="text-base/7 font-semibold text-zinc-500">
            Eksiksiz ticaret
          </h2>
          <p className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
            Almaktan satmaya, ihaleden teslime
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6">
            {/* 1 — Tedarikçiysen sat (span-3) */}
            <div className="flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-200 lg:col-span-3">
              <div className="p-6 pb-0">
                <SaleListingPreview />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-zinc-950">
                  Ürününü en yükseğe sat
                </h3>
                <p className="mt-1.5 text-sm/6 text-zinc-600">
                  Satış ilanı aç, taban ve hemen-al fiyatını belirle. Alıcılar
                  yarışsın; en yüksek teklifi sen kazandır.
                </p>
              </div>
            </div>
            {/* 2 — Kapalı zarf (span-3) */}
            <div className="flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-200 lg:col-span-3">
              <div className="p-6 pb-0">
                <BidsPreview />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-zinc-950">
                  İhtiyacını en uyguna al
                </h3>
                <p className="mt-1.5 text-sm/6 text-zinc-600">
                  Alış ilanı aç, kapalı zarf teklif topla. Tedarikçiler
                  birbirini görmez; en uygun fiyatı sen seçip al.
                </p>
              </div>
            </div>
            {/* 3 — İlan oluştur (span-2) */}
            <div className="flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-200 lg:col-span-2">
              <div className="p-6 pb-0">
                <ListingWizardPreview />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-zinc-950">
                  İlanı saniyede aç
                </h3>
                <p className="mt-1.5 text-sm/6 text-zinc-600">
                  Kapsam, tür ve format adım adım — yanlış kurulum imkânsız.
                </p>
              </div>
            </div>
            {/* 4 — Sipariş & belge (span-2) */}
            <div className="flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-200 lg:col-span-2">
              <div className="p-6 pb-0">
                <OrderTimelinePreview />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-zinc-950">
                  Sipariş'ten teslime
                </h3>
                <p className="mt-1.5 text-sm/6 text-zinc-600">
                  Kargo, teslim ve ödeme durumu; teslim belgesiyle tek panelde.
                </p>
              </div>
            </div>
            {/* 5 — Keşfet / yurtiçi & uluslararası (span-2) */}
            <div className="flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-200 lg:col-span-2">
              <div className="p-6 pb-0">
                <DiscoverPreview />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-zinc-950">
                  Keşfet & bağlan
                </h3>
                <p className="mt-1.5 text-sm/6 text-zinc-600">
                  Kategori eşleşmeli firma keşfi — yurtiçi ya da 98 ülkede.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tek panelde her şey — ekip & ağ */}
      <section
        id="nasil"
        className="border-y border-zinc-200 bg-zinc-50 py-24 sm:py-32"
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
                  Yönetici, Satın Almacı, Satışçı, Onaylayıcı — sınırsız
                  kullanıcı, koltuk ücreti yok. İş çıkışında erişim tek tıkla
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
                  Davet gönder ya da kabul et, bağlantı ağını büyüt. Bağlandığın
                  firmalarla çevre-içi ticaret yap; istemediğin firmayı
                  engelle.
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
                Herkese açık profilin, dijital vitrinin
              </p>
              <p className="mt-6 text-lg/8 text-zinc-600">
                Premium üyelikte firman herkese açık bir profile kavuşur:
                doğrulanmış rozet, sektörlerin, hakkında metnin ve açık
                ihalelerin. Alıcılar seni bulur, ihalelerine teklif verir.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Doğrulanmış firma rozeti",
                  "Sektör & konum etiketleri",
                  "Açık ihalelerin tek sayfada",
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
              İhale türleri
            </h2>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              Her ihtiyaca uygun format
            </p>
            <p className="mt-6 text-lg/8 text-zinc-600">
              Alışta teklif toplama ya da pazarlık (açık eksiltme), satışta taban + hemen-al; doğru
              formatı seç, kazandırma öncesi onay zincirini panel yönetsin.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:mt-20 sm:grid-cols-2">
            {/* RFQ — kapalı zarf */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="space-y-1.5 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="text-[11px] text-zinc-400">Firma A</span>
                  <span className="text-[11px] text-zinc-300">••• ₺</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-1.5 ring-1 ring-emerald-200">
                  <span className="text-[11px] font-medium text-emerald-800">
                    Firma B
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-900">
                    11.900 ₺
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="text-[11px] text-zinc-400">Firma C</span>
                  <span className="text-[11px] text-zinc-300">••• ₺</span>
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
                kazandırırsın.
              </p>
            </div>

            {/* Pazarlık — eksiltme */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex h-16 items-end gap-1.5">
                  <div className="flex-1 rounded-t bg-amber-400/80" style={{ height: "100%" }} />
                  <div className="flex-1 rounded-t bg-amber-400/70" style={{ height: "74%" }} />
                  <div className="flex-1 rounded-t bg-amber-400/60" style={{ height: "54%" }} />
                  <div className="flex-1 rounded-t bg-amber-500" style={{ height: "38%" }} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Güncel teklif</span>
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-700">
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

            {/* Satış ilanı */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex-1 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-100">
                  <div className="text-[10px] text-zinc-400">Taban fiyat</div>
                  <div className="text-sm font-semibold text-zinc-900">
                    50.000 ₺
                  </div>
                </div>
                <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
                  <div className="text-[10px] text-emerald-600">Hemen-Al</div>
                  <div className="text-sm font-semibold text-emerald-800">
                    80.000 ₺
                  </div>
                </div>
              </div>
              <span className="mt-5 inline-flex w-fit rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Satış
              </span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-950">
                Satış ilanı
              </h3>
              <p className="mt-1.5 text-sm/6 text-zinc-600">
                Fazlanı ya da ürününü sat; taban fiyatını belirle.
              </p>
            </div>

            {/* Onay akışları */}
            <div className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="space-y-1.5 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <div className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-[11px] font-medium text-zinc-700">
                    Satın Almacı
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400">
                    Talep açtı
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-100">
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-[11px] font-medium text-zinc-700">
                    Onaylayıcı
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400">
                    Onayladı
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-violet-50 px-2.5 py-1.5 ring-1 ring-violet-200">
                  <span className="flex size-4 items-center justify-center">
                    <span className="size-2 animate-pulse rounded-full bg-violet-500" />
                  </span>
                  <span className="text-[11px] font-medium text-violet-800">
                    Yönetici
                  </span>
                  <span className="ml-auto text-[11px] font-semibold text-violet-700">
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
      <section id="uyelik" className="py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
          <h2 className="text-base/7 font-semibold text-zinc-500">Üyelik</h2>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-5xl">
            Koltuk başına ödeme yok
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-zinc-600">
            Standart üyelik ücretsiz, sınırsız kullanıcı ve rol. Kendi ilanını
            açmak, firma keşfetmek ve herkese açık ilanlara teklif vermek için
            Premium&apos;a yükselt.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-stretch gap-8 px-6 sm:mt-20 lg:max-w-4xl lg:grid-cols-2 lg:px-8">
          {/* Standart */}
          <div className="flex flex-col rounded-3xl bg-white p-8 ring-1 ring-zinc-200 transition hover:-translate-y-1 hover:shadow-xl sm:p-10">
            <h3 className="text-base/7 font-semibold text-zinc-700">Standart</h3>
            <p className="mt-4 flex items-baseline gap-x-2">
              <span className="text-4xl font-semibold tracking-tight text-zinc-950">
                Ücretsiz
              </span>
              <span className="text-sm text-zinc-500">sonsuza dek</span>
            </p>
            <p className="mt-4 text-base/7 text-zinc-600">
              Ağına bağlan, çevren içinde al-sat.
            </p>
            <ul role="list" className="mt-8 flex-1 space-y-3 text-sm/6 text-zinc-600">
              {standartFeatures.map((f) => (
                <li key={f} className="flex gap-x-3">
                  <CheckIcon
                    aria-hidden="true"
                    className="h-6 w-5 flex-none text-zinc-900"
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/company/kayit"
              className="mt-8 block rounded-lg px-3.5 py-2.5 text-center text-sm font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-300 transition hover:bg-zinc-50 hover:ring-zinc-400"
            >
              Ücretsiz Başla
            </Link>
          </div>
          {/* Premium — vurgulu */}
          <div className="relative flex flex-col rounded-3xl bg-[#0A0A0A] p-8 shadow-2xl ring-1 ring-zinc-950 transition hover:-translate-y-1 sm:p-10">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950 shadow">
              Önerilen
            </div>
            <h3 className="text-base/7 font-semibold text-zinc-300">
              Premium
            </h3>
            <p className="mt-4 flex items-baseline gap-x-2">
              <span className="text-4xl font-semibold tracking-tight text-white">
                Premium
              </span>
              <span className="text-sm text-zinc-400">tam erişim</span>
            </p>
            <p className="mt-4 text-base/7 text-zinc-300">
              Aç, keşfet, teklif ver — sınır yok.
            </p>
            <ul role="list" className="mt-8 flex-1 space-y-3 text-sm/6 text-zinc-200">
              {premiumFeatures.map((f) => (
                <li key={f} className="flex gap-x-3">
                  <CheckIcon
                    aria-hidden="true"
                    className="h-6 w-5 flex-none text-emerald-400"
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/company/kayit"
              className="mt-8 block rounded-lg bg-white px-3.5 py-2.5 text-center text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              Kaydol
            </Link>
          </div>
        </div>
      </section>

      {/* SSS — ortalı başlık + çok kolonlu Q&A kartları */}
      <section id="sss" className="border-t border-zinc-200 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Sıkça sorulan sorular
            </h2>
            <p className="mt-6 text-base/7 text-zinc-600">
              Aradığın yanıtı bulamadın mı?{" "}
              <a
                href="mailto:destek@rothern.com"
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
                      <span className="ml-6 flex h-7 items-center text-zinc-400 transition group-hover:text-zinc-950">
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
          <div className="relative isolate overflow-hidden rounded-3xl bg-[#0A0A0A] px-6 py-20 text-center shadow-2xl sm:px-16">
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

      {/* Footer */}
      <footer className="bg-[#0A0A0A]">
        <div className="mx-auto max-w-7xl px-6 pt-16 pb-10 lg:px-8">
          <div className="xl:grid xl:grid-cols-3 xl:gap-8">
            <div className="space-y-6">
              <RothernLogo variant="full" size="md" />
              <p className="max-w-xs text-sm/6 text-zinc-400">
                Alıcı ve tedarikçiyi tek hesapta birleştiren, şeffaf B2B
                ticaret platformu.
              </p>
              <div className="flex gap-x-5">
                {social.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="text-zinc-400 transition hover:text-white"
                  >
                    <span className="sr-only">{item.name}</span>
                    <item.icon aria-hidden="true" className="size-5" />
                  </a>
                ))}
              </div>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-3 xl:col-span-2 xl:mt-0">
              <div>
                <h3 className="text-sm/6 font-semibold text-white">Ürün</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNav.urun.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-zinc-400 transition hover:text-white"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm/6 font-semibold text-white">Hesap</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNav.hesap.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm/6 text-zinc-400 transition hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm/6 font-semibold text-white">Yasal</h3>
                <ul role="list" className="mt-6 space-y-4">
                  {footerNav.yasal.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-zinc-400 transition hover:text-white"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-16 border-t border-white/10 pt-8">
            <p className="text-sm/6 text-zinc-400">
              © 2026 Rothern · B2B ticaret platformu
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
