"use client";

import { RothernLogo } from "@/components/brand/logo";
import {
  Dialog,
  DialogPanel,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  ArrowsRightLeftIcon,
  Bars3Icon,
  ClipboardDocumentCheckIcon,
  DocumentPlusIcon,
  GlobeAltIcon,
  InboxArrowDownIcon,
  LockClosedIcon,
  MinusSmallIcon,
  PlusSmallIcon,
  TrophyIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const navigation = [
  { name: "Özellikler", href: "#ozellikler" },
  { name: "Nasıl Çalışır", href: "#nasil" },
  { name: "Üyelik", href: "#uyelik" },
  { name: "SSS", href: "#sss" },
];

const features = [
  {
    name: "Hem al, hem sat",
    description:
      "Tek hesapla alım ilanı aç ya da fazlanı sat. Rol bazlı yetki (Satın Almacı / Satışçı) panelini kendiliğinden düzenler.",
    icon: ArrowsRightLeftIcon,
  },
  {
    name: "Kapalı zarf teklif",
    description:
      "Tedarikçiler birbirinin teklifini asla görmez; sen hepsini görür, en iyisini kazandırırsın. Şeffaf ve denetlenebilir.",
    icon: LockClosedIcon,
  },
  {
    name: "Yurtiçi & uluslararası",
    description:
      "Kategori eşleşmeli firma keşfi, bağlantı ağı, davet. 98 ülkede; yurtiçi ya da sınır ötesi firmalarla güvenle ticaret yap.",
    icon: GlobeAltIcon,
  },
  {
    name: "Uçtan uca akış",
    description:
      "İlan → teklif → kazandırma → sipariş → kargo, teslim, dekont. Tüm süreç tek panelde, belge ve takip dahil.",
    icon: ClipboardDocumentCheckIcon,
  },
];

const stats = [
  { prefix: "", value: 98, suffix: " ülke", l: "Yurtiçi & uluslararası al-sat" },
  { prefix: "%", value: 100, suffix: "", l: "Kapalı zarf — teklifler gizli" },
  { prefix: "", value: 0, suffix: " ₺", l: "Koltuk ücreti, sınırsız rol" },
  { text: "Tek panel", l: "İlandan dekonta tüm akış" },
];

const steps = [
  { n: "01", t: "Kaydol", d: "Firma hesabını oluştur, ekibini davet et, rolleri ata.", icon: UserPlusIcon },
  { n: "02", t: "İlanını aç", d: "Alım ya da satış ilanı; kapsam, format ve fiyatı belirle.", icon: DocumentPlusIcon },
  { n: "03", t: "Teklif topla", d: "Bağlantıların ve keşfettiğin firmalar kapalı zarf teklif verir.", icon: InboxArrowDownIcon },
  { n: "04", t: "Kazandır & yönet", d: "En iyisini seç, sipariş oluşsun; kargo/teslim/dekont akışını takip et.", icon: TrophyIcon },
];

const standartFeatures = [
  "Bağlantılı firmalarla alım & satım",
  "Kapalı zarf teklif toplama",
  "Sipariş, kargo, teslim & dekont akışı",
  "Sınırsız kullanıcı & rol",
  "Herkese açık ilanları görüntüleme (maskeli)",
];

const premiumFeatures = [
  "Standart'taki her şey",
  "Kendi alım/satış ilanını aç",
  "Kategori eşleşmeli firma keşfi",
  "Herkese açık ilanlara teklif ver",
  "Öncelikli destek",
];

const faqs = [
  {
    q: "Alıcı ve tedarikçi ayrı mı kayıt oluyor?",
    a: "Hayır. Rothern'de tek firma hesabı var; aynı hesap hem alım hem satım yapar. Kişilere atadığın roller (Satın Almacı / Satışçı) neyi görüp yapabileceğini belirler.",
  },
  {
    q: "Tedarikçiler birbirinin teklifini görür mü?",
    a: "Asla. Kapalı zarf: her tedarikçi yalnızca kendi teklifini görür. İlan sahibi tüm teklifleri görür ve en iyisini kazandırır.",
  },
  {
    q: "Standart üyelikle ne yapabilirim?",
    a: "Bağlandığın firmaların ilanlarına teklif verebilir, sipariş ve belge akışını yürütebilirsin. Kendi ilanını açmak, firma keşfetmek ve herkese açık ilanlara teklif vermek Tek Paket ile gelir.",
  },
  {
    q: "Platform paraya aracılık ediyor mu?",
    a: "Hayır. Ödeme taraflar arasında doğrudan yapılır; Rothern yalnızca süreci ve dekont kaydını yönetir. Koltuk başına ücret yoktur.",
  },
  {
    q: "Siparişten sonra ne oluyor?",
    a: "Kazandırma anında sipariş oluşur (satıcı→alıcı). Kargo, teslim ve ödeme adımlarını panelden takip eder; teslim belgesi (irsaliye/konşimento) ve dekontu yüklersiniz.",
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
    { name: "Kullanım Şartları", href: "#" },
    { name: "Gizlilik Politikası", href: "#" },
    { name: "KVKK", href: "#" },
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
              Dikkat bekleyen işler — alım ve satım, tek akışta
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

function FloatingCard({
  className,
  dot,
  title,
  sub,
  float = "rt-float",
}: {
  className: string;
  dot?: string;
  title: string;
  sub?: string;
  float?: string;
}) {
  return (
    <div
      className={`absolute z-10 hidden w-max max-w-[13rem] rounded-xl border border-zinc-950/5 bg-white/90 px-4 py-3 shadow-xl ring-1 ring-zinc-950/5 backdrop-blur xl:block ${float} ${className}`}
    >
      <div className="flex items-center gap-2">
        {dot ? <span className={`size-2 shrink-0 rounded-full ${dot}`} /> : null}
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function TwoWayArrows() {
  return (
    <div className="flex shrink-0 rotate-90 flex-col items-center justify-center gap-0.5 py-1 sm:rotate-0 sm:px-1 sm:py-0">
      <ArrowLongRightIcon className="rt-nudge-r size-6 text-zinc-400" />
      <ArrowLongLeftIcon className="rt-nudge-l size-6 text-zinc-400" />
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
      {n}
      {suffix}
    </span>
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
              Alım
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
                <span className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white">
                  Kazandır
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

function OrderTimelinePreview() {
  const tl = [
    { t: "Sipariş oluştu", state: "done" },
    { t: "Kargoya verildi", state: "done" },
    { t: "Teslim alındı", state: "active" },
    { t: "Tamamlandı", state: "todo" },
  ];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-950/10">
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm font-semibold text-zinc-900">
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
        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
          Dekont
        </span>
      </div>
    </div>
  );
}

const spotlights = [
  {
    eyebrow: "İlan oluştur",
    title: "Saniyeler içinde, doğru formatta",
    desc: "Kapsam, tür ve format adım adım sorulur; alımda RFQ ya da İngiliz usulü, satışta taban + hemen-al fiyatı. Yanlış kurulum imkânsız.",
    points: [
      "Yurtiçi & uluslararası kapsam",
      "Alım: RFQ veya açık eksiltme",
      "Satış: taban fiyat + hemen-al",
    ],
    Mock: ListingWizardPreview,
  },
  {
    eyebrow: "Kapalı zarf",
    title: "Adil rekabet, tam şeffaflık",
    desc: "Tedarikçiler birbirini görmez; sen tüm teklifleri görür, en iyisini tek tıkla kazandırırsın. Elenen tedarikçi yeniden teklif verebilir.",
    points: [
      "Teklifler gizli ve sıralı",
      "Toplu ya da kalem bazlı kazandırma",
      "Denetlenebilir, kalıcı geçmiş",
    ],
    Mock: BidsPreview,
  },
  {
    eyebrow: "Sipariş & belge",
    title: "Kazandırmadan dekonta",
    desc: "Kazandırma anında sipariş oluşur (satıcı→alıcı). Kargo, teslim ve ödeme adımlarını takip et; teslim belgesi ile dekontu panele yükle.",
    points: [
      "Otomatik satıcı→alıcı sipariş",
      "Kargo / teslim / ödeme durumları",
      "İrsaliye, konşimento & dekont",
    ],
    Mock: OrderTimelinePreview,
  },
];

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="bg-white">
      {/* Header — koyu */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#0A0A0A]">
        <nav
          aria-label="Global"
          className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 lg:px-8"
        >
          <div className="flex lg:flex-1">
            <Link href="/" className="-m-1.5 p-1.5">
              <span className="sr-only">Rothern</span>
              <RothernLogo variant="full" size="md" priority />
            </Link>
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-zinc-300"
            >
              <span className="sr-only">Menüyü aç</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="hidden lg:flex lg:gap-x-10">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="text-sm/6 font-medium text-zinc-300 transition hover:text-white"
              >
                {item.name}
              </a>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-x-4">
            <Link
              href="/company/login"
              className="text-sm/6 font-semibold text-white transition hover:text-zinc-300"
            >
              Giriş Yap
            </Link>
            <Link
              href="/company/kayit"
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200"
            >
              Kaydol
            </Link>
          </div>
        </nav>

        <Dialog
          open={mobileMenuOpen}
          onClose={setMobileMenuOpen}
          className="lg:hidden"
        >
          <div className="fixed inset-0 z-50" />
          <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-[#0A0A0A] p-6 sm:max-w-sm sm:ring-1 sm:ring-white/10">
            <div className="flex items-center justify-between">
              <Link href="/" className="-m-1.5 p-1.5">
                <RothernLogo variant="full" size="sm" />
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-zinc-300"
              >
                <span className="sr-only">Menüyü kapat</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-white/10">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-white hover:bg-white/5"
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
                <div className="space-y-2 py-6">
                  <Link
                    href="/company/login"
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-white hover:bg-white/5"
                  >
                    Giriş Yap
                  </Link>
                  <Link
                    href="/company/kayit"
                    className="-mx-3 block rounded-lg bg-white px-3 py-2.5 text-center text-base/7 font-semibold text-zinc-950"
                  >
                    Kaydol
                  </Link>
                </div>
              </div>
            </div>
          </DialogPanel>
        </Dialog>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden px-6 pb-20 lg:px-8">
        {/* grid arka plan */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full stroke-zinc-200 [mask-image:radial-gradient(64rem_48rem_at_50%_-4rem,white,transparent)]"
        >
          <defs>
            <pattern
              id="hero-grid"
              width={48}
              height={48}
              x="50%"
              y={-1}
              patternUnits="userSpaceOnUse"
            >
              <path d="M.5 48V.5H48" fill="none" />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            strokeWidth={0}
            fill="url(#hero-grid)"
          />
        </svg>
        {/* yumuşak gradient */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36rem] -translate-x-1/2 rotate-30 bg-gradient-to-tr from-zinc-300 to-zinc-500 opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72rem]"
          />
        </div>

        {/* uçuşan sistem kartları — sağı/solu doldurur */}
        <FloatingCard
          className="top-[22%] left-[2%] xl:left-[6%]"
          float="rt-float"
          dot="bg-blue-500"
          title="Çelik alımı"
          sub="3 yeni teklif geldi"
        />
        <FloatingCard
          className="top-[40%] left-[4%] xl:left-[9%]"
          float="rt-float-slow"
          title="🌍 98 ülke"
          sub="Sınır ötesi alım & satım"
        />
        <FloatingCard
          className="top-[26%] right-[2%] xl:right-[6%]"
          float="rt-float-slow"
          dot="bg-emerald-500"
          title="Sipariş kargolandı"
          sub="ROT-ORD-000128"
        />
        <FloatingCard
          className="top-[60%] right-[4%] xl:right-[9%]"
          float="rt-float"
          title="Yeni bağlantı"
          sub="Üçüncü Firma · kabul edildi"
        />

        <div className="mx-auto max-w-3xl pt-24 pb-16 sm:pt-32 lg:pt-36">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm/6 font-medium text-zinc-700 ring-1 ring-zinc-950/10 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Yurtiçi & uluslararası · AI destekli B2B ticaret
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-7xl">
              Hem al, hem sat —{" "}
              <span className="text-zinc-500">tek platformda.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg font-medium text-pretty text-zinc-600 sm:text-xl/8">
              Alım ilanı aç, kapalı zarf teklif topla; ya da fazlanı sat.
              Yurtiçinde veya 98 ülkede firmalarla bağlan, ihaleyi yönet,
              siparişi belgesine kadar takip et. Şeffaf, denetlenebilir, AI
              destekli.
            </p>
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

      {/* İstatistik şeridi */}
      <section className="border-y border-zinc-800 bg-[#0A0A0A]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-14 lg:grid-cols-4 lg:px-8">
          {stats.map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-3xl font-semibold tracking-tight text-white tabular-nums sm:text-4xl">
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
              <div className="mt-2 text-sm text-zinc-400">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Özellikler */}
      <section id="ozellikler" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-pretty text-zinc-950 sm:text-5xl">
              Tek hesap, iki yön, tam kontrol
            </h2>
            <p className="mt-6 text-lg/8 text-zinc-600">
              Alıcı ve tedarikçi ayrı hesaplar değil. Rothern&apos;de bir firma
              hem alır hem satar; yetki, görünürlük ve akış otomatik yönetilir.
            </p>
          </div>

          {/* İki yön diyagramı — animasyonlu oklar */}
          <div className="mx-auto mt-14 flex max-w-3xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-1">
            <div className="flex-1 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-center transition hover:-translate-y-1 hover:shadow-md">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-blue-600">
                <InboxArrowDownIcon className="size-6 text-white" />
              </div>
              <div className="mt-3 text-base font-semibold text-blue-900">
                Alım
              </div>
              <div className="text-xs text-blue-700/80">Satın Almacı rolü</div>
            </div>
            <TwoWayArrows />
            <div className="flex-1 rounded-2xl bg-[#0A0A0A] p-5 text-center shadow-xl">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-white/10">
                <ArrowsRightLeftIcon className="size-6 text-white" />
              </div>
              <div className="mt-3 text-base font-semibold text-white">
                Tek Firma Hesabı
              </div>
              <div className="text-xs text-zinc-400">Tek panel · tüm yetki</div>
            </div>
            <TwoWayArrows />
            <div className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center transition hover:-translate-y-1 hover:shadow-md">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-emerald-600">
                <DocumentPlusIcon className="size-6 text-white" />
              </div>
              <div className="mt-3 text-base font-semibold text-emerald-900">
                Satım
              </div>
              <div className="text-xs text-emerald-700/80">Satışçı rolü</div>
            </div>
          </div>

          <div className="mx-auto mt-20 max-w-2xl sm:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-2">
              {features.map((feature) => (
                <div
                  key={feature.name}
                  className="flex flex-col rounded-2xl p-6 ring-1 ring-zinc-950/5 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <dt className="text-base/7 font-semibold text-zinc-950">
                    <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-zinc-950">
                      <feature.icon
                        aria-hidden="true"
                        className="size-6 text-white"
                      />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-1 flex flex-auto flex-col text-base/7 text-zinc-600">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Görsel spotlight'lar */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl space-y-24 px-6 sm:space-y-32 lg:px-8">
          {spotlights.map((s, i) => {
            const Mock = s.Mock;
            return (
              <div
                key={s.eyebrow}
                className="grid items-center gap-12 lg:grid-cols-2"
              >
                <div className={i % 2 === 1 ? "lg:order-last" : ""}>
                  <h3 className="text-sm font-semibold text-zinc-500">
                    {s.eyebrow}
                  </h3>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
                    {s.title}
                  </p>
                  <p className="mt-4 text-lg/8 text-zinc-600">{s.desc}</p>
                  <ul role="list" className="mt-6 space-y-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-x-3 text-zinc-700">
                        <CheckIcon
                          aria-hidden="true"
                          className="h-6 w-5 flex-none text-zinc-900"
                        />
                        <span className="text-base">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-zinc-100 to-white"
                  />
                  <Mock />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Nasıl çalışır */}
      <section
        id="nasil"
        className="border-y border-zinc-200 bg-zinc-50 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Dört adımda ticaret
            </h2>
            <p className="mt-6 text-lg/8 text-zinc-600">
              Kayıttan kazandırmaya, oradan siparişe — her şey tek panelde.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-y-6 sm:mt-20 sm:grid-cols-2 sm:gap-6 lg:max-w-none lg:grid-cols-4 lg:gap-x-5">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="relative">
                  {i < steps.length - 1 ? (
                    <ArrowLongRightIcon
                      aria-hidden="true"
                      className="rt-nudge-r absolute top-9 -right-3.5 z-10 hidden size-8 text-zinc-300 lg:block"
                    />
                  ) : null}
                  <div className="h-full rounded-2xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-1 hover:border-zinc-300 hover:shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-950">
                        <Icon aria-hidden="true" className="size-6 text-white" />
                      </div>
                      <span className="font-mono text-3xl font-bold text-zinc-200">
                        {s.n}
                      </span>
                    </div>
                    <div className="mt-4 text-lg font-semibold text-zinc-950">
                      {s.t}
                    </div>
                    <p className="mt-1.5 text-sm/6 text-zinc-600">{s.d}</p>
                  </div>
                </div>
              );
            })}
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
            Tek Paket&apos;e yükselt.
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
          {/* Tek Paket — vurgulu */}
          <div className="relative flex flex-col rounded-3xl bg-[#0A0A0A] p-8 shadow-2xl ring-1 ring-zinc-950 transition hover:-translate-y-1 sm:p-10">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950 shadow">
              Önerilen
            </div>
            <h3 className="text-base/7 font-semibold text-zinc-300">
              Tek Paket
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

      {/* SSS */}
      <section id="sss" className="border-t border-zinc-200 bg-zinc-50 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h2 className="text-center text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Sıkça sorulan sorular
          </h2>
          <dl className="mt-16 divide-y divide-zinc-900/10">
            {faqs.map((faq) => (
              <Disclosure
                key={faq.q}
                as="div"
                className="py-6 first:pt-0 last:pb-0"
              >
                <dt>
                  <DisclosureButton className="group flex w-full items-start justify-between text-left text-zinc-950">
                    <span className="text-base/7 font-semibold">{faq.q}</span>
                    <span className="ml-6 flex h-7 items-center">
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
                <DisclosurePanel as="dd" className="mt-2 pr-12">
                  <p className="text-base/7 text-zinc-600">{faq.a}</p>
                </DisclosurePanel>
              </Disclosure>
            ))}
          </dl>
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
              Birkaç dakikada kaydol, ekibini davet et, ilk ilanını aç. Şeffaf,
              denetlenebilir, AI destekli B2B ticaret.
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
                Alıcı ve tedarikçiyi tek hesapta birleştiren, şeffaf ve AI
                destekli B2B ticaret platformu.
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
              © 2026 Rothern · AI destekli B2B ticaret platformu
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
