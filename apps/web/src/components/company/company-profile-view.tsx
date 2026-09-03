import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { StarIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel, type ReviewSummary } from "@rothern/shared";

import { safeExternalUrl } from "@/lib/safe-url";
import { CompanyLogo } from "@/components/company/company-logo";
import { SafeCoverImage } from "@/components/company/safe-cover-image";

/**
 * Dış bağlantı — YALNIZ http/https render eder (`javascript:` vb. düşürülür).
 * Bu view PUBLIC (/firma/[slug]) olduğundan kullanıcı-kontrollü URL'ler ham
 * href olarak basılamaz (stored XSS). safeExternalUrl null dönerse hiç render yok.
 */
function ExternalLink({
  href,
  label,
}: {
  href: string | null | undefined;
  label: string;
}) {
  const safe = safeExternalUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer nofollow"
      className="font-medium text-zinc-600 hover:text-zinc-900"
    >
      {label}
    </a>
  );
}

export interface ProfileViewData {
  name: string;
  /** Faz T: "Gold Üye" rozeti — yalnız GOLD kademe (güven iddiası taşımaz). */
  goldMember?: boolean;
  rothernId?: string | null;
  industry: string | null;
  /**
   * Faaliyet tipi kodları (üretici/bayi/hizmet/dış ticaret/fason). Alıcı için
   * çoğu zaman sektörden daha ayırt edici — bu yüzden ünvanın hemen altında,
   * rozet olarak gösterilir.
   */
  activities?: string[];
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  aboutText: string | null;
  services: string[];
  certifications: string[];
  certificateImages: string[];
  photos: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  rating?: { avg: number; count: number } | null;
  /**
   * 2026-08-22 — firma bazında gruplu değerlendirme özeti (api → shared
   * ReviewSummary). Ad yalnız opt-in + platform içi; herkese açıkta null.
   */
  reviewSummary?: ReviewSummary | null;
  /** Kamuya açık ticari sicil bilgileri (tüzel kişi verisi). */
  trade?: {
    legalName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    mersisNo: string | null;
    tradeRegistryNo: string | null;
    kepAddress: string | null;
  } | null;
}

function TradeRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-zinc-900 ${
          mono ? "font-mono tracking-wide" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

/**
 * YERİNDE DÜZENLEME slotları (2026-08-22, Profilim editörü): verilirse ilgili
 * bölge salt-okunur içerik yerine slot'u render eder ve boş olsa da GÖRÜNÜR
 * (kullanıcı "+ Hakkında ekle" gibi yer tutucu görür). Verilmezse bileşen
 * herkese açık sayfadaki gibi salt-okunur davranır — public görünüm ve editör
 * AYNI düzeni paylaşır (tek kaynak), içerik farkı yalnız slot'ta.
 */
export interface ProfileEditSlots {
  /** Kapak alanının üstüne binen kontroller (absolute konumlandırılır). */
  cover?: ReactNode;
  /** Logo kutusunun üstüne binen kontroller. */
  logo?: ReactNode;
  /** Ad altındaki "sektör · konum" satırının yerine. */
  headline?: ReactNode;
  /** Künye şeridi (kuruluş/çalışan/web/sosyal) yerine. */
  stats?: ReactNode;
  about?: ReactNode;
  gallery?: ReactNode;
  services?: ReactNode;
  certifications?: ReactNode;
  /**
   * Firma türü + faaliyet kategorileri düzenleyicisi (Profilim, 2026-09-03).
   * Herkese açık görünümde karşılığı hero'daki faaliyet rozetleri; kategori
   * beyanı eşleşme girdisidir, ziyaretçiye ayrı bir bölüm olarak basılmaz.
   */
  classification?: ReactNode;
  /** Sağ kolonun başı — Profilim'de "Ürünlerim (N)" önizleme kartı. */
  aside?: ReactNode;
}

/**
 * Firma profil görünümü — hem herkese açık SEO sayfası (/firma/[slug]) hem
 * bağlantı-içi sayfa (/company/firma/[id]) AYNI bileşeni kullanır. Tek fark:
 * `actions` (bağlan/engelle) ve `children` (ihaleler) slotları; Profilim
 * editörü ayrıca `edit` slotlarıyla bölgeleri düzenlenebilir kılar.
 */
export function CompanyProfileView({
  profile: p,
  actions,
  children,
  edit,
}: {
  profile: ProfileViewData;
  actions?: ReactNode;
  children?: ReactNode;
  edit?: ProfileEditSlots;
}) {
  const services = p.services ?? [];
  const certifications = p.certifications ?? [];
  const certificateImages = p.certificateImages ?? [];
  const photos = p.photos ?? [];
  const location = [p.city, p.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden card">
        {/* C63: kapak yokken ~190px boş koyu blok "bozuk" görünüyordu —
            kapaksız profilde şerit inceltilir (görsel varsa tam boy). */}
        <div
          className={cn(
            "relative w-full bg-gradient-to-br from-zinc-900 to-zinc-700",
            p.coverImageUrl ? "h-40 sm:h-56" : edit?.cover ? "h-28 sm:h-36" : "h-14 sm:h-16",
          )}
        >
          {p.coverImageUrl ? (
            // P0: kırık R2 URL'inde çıplak kırık-görsel ikonu yerine koyu zemine
            // sessizce düş — onError işleyicisi İSTEMCİ bileşeninde (bu dosya
            // herkese açık sayfada sunucu bileşeni; RSC'de <img onError> 500 verir).
            <SafeCoverImage src={p.coverImageUrl} alt={`${p.name} kapak görseli`} />
          ) : null}
          {edit?.cover ?? null}
        </div>

        <div className="px-5 pb-6 sm:px-8">
          <div className="relative z-10 -mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="relative rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-zinc-950/5">
                <CompanyLogo
                  src={p.logoUrl}
                  alt={`${p.name} logosu`}
                  className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
                  fallback={
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-zinc-950 text-4xl font-bold text-white sm:h-28 sm:w-28">
                      {p.name.charAt(0).toLocaleUpperCase("tr-TR")}
                    </div>
                  }
                />
                {edit?.logo ?? null}
              </div>
              <div className="mb-1.5 min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
                  {p.name}
                  {p.goldMember ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Gold Üye
                    </span>
                  ) : null}
                </h1>
                {edit?.headline ? (
                  <div className="mt-1">{edit.headline}</div>
                ) : (
                <p className="mt-1 text-sm text-zinc-500">
                  {[p.industry, location].filter(Boolean).join("  ·  ") ||
                    "Rothern tedarik profili"}
                  {p.rothernId ? (
                    <span className="ml-2 font-mono text-xs slashed-zero text-zinc-400">
                      {/* C25: metin-düzeyi boşluk — kopyada "TRDEM0-0001" gibi
                          yapışmasın (ml-2 yalnız görsel). */}
                      {" "}
                      {p.rothernId}
                    </span>
                  ) : null}
                </p>
                )}
              </div>
            </div>
            {actions ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>

          {/* Stat şeridi — değerlendirme BURADA durur, başlık bloğunda değil:
              başlık logoya alttan hizalı (items-end), oraya opsiyonel bir satır
              eklemek firma adını yukarı kaydırıyordu (değerlendirmesi olan/olmayan
              firmalar farklı hizalanıyordu). */}
          {edit?.stats ? (
            <div className="mt-5 border-t border-zinc-100 pt-4">{edit.stats}</div>
          ) : p.foundedYear ||
          p.employeeCount ||
          p.website ||
          p.linkedinUrl ||
          p.instagramUrl ||
          (p.rating && p.rating.count > 0) ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-3 border-t border-zinc-100 pt-4">
              {p.rating && p.rating.count > 0 ? (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Değerlendirme
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-zinc-900">
                    <StarIcon className="size-4 text-rating" aria-hidden />
                    {p.rating.avg.toFixed(1)}
                    <span className="font-normal text-zinc-400">
                      ({p.rating.count})
                    </span>
                  </div>
                </div>
              ) : null}
              {p.foundedYear ? (
                <Stat label="Kuruluş" value={String(p.foundedYear)} />
              ) : null}
              {p.employeeCount ? (
                <Stat label="Çalışan" value={p.employeeCount} />
              ) : null}
              {p.industry ? <Stat label="Sektör" value={p.industry} /> : null}
              {p.activities?.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.activities.map((code) => (
                    <span
                      key={code}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 ring-1 ring-blue-600/20 ring-inset"
                    >
                      {companyActivityLabel(code)}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="ml-auto flex items-center gap-4 text-sm">
                <ExternalLink href={p.website} label="Web Sitesi" />
                <ExternalLink href={p.linkedinUrl} label="LinkedIn" />
                <ExternalLink href={p.instagramUrl} label="Instagram" />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* İhaleler / ekstra — hero'nun hemen altında, üstte */}
      {children}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {edit?.classification ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                Firma türü ve faaliyet alanları
              </h2>
              <div className="mt-3">{edit.classification}</div>
            </section>
          ) : null}
          {edit?.about ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Hakkında</h2>
              <div className="mt-3">{edit.about}</div>
            </section>
          ) : p.aboutText ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Hakkında</h2>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-600">
                {p.aboutText}
              </p>
            </section>
          ) : null}

          {/* Ticari sicil bilgileri — kamuya açık tüzel kişi verileri; güven
              göstergesi (IBAN/TCKN gibi hassas veriler burada ASLA yer almaz). */}
          {p.trade &&
          (p.trade.legalName ||
            p.trade.taxNumber ||
            p.trade.mersisNo ||
            p.trade.tradeRegistryNo ||
            p.trade.kepAddress) ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                Ticari Bilgiler
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.trade.legalName ? (
                  <TradeRow label="Ticari Unvan" value={p.trade.legalName} />
                ) : null}
                {p.trade.taxNumber ? (
                  <TradeRow
                    label="Vergi No"
                    value={
                      p.trade.taxOffice
                        ? `${p.trade.taxNumber} · ${p.trade.taxOffice}`
                        : p.trade.taxNumber
                    }
                    mono
                  />
                ) : null}
                {p.trade.mersisNo ? (
                  <TradeRow label="MERSİS No" value={p.trade.mersisNo} mono />
                ) : null}
                {p.trade.tradeRegistryNo ? (
                  <TradeRow
                    label="Ticaret Sicil No"
                    value={p.trade.tradeRegistryNo}
                    mono
                  />
                ) : null}
                {p.trade.kepAddress ? (
                  <TradeRow label="KEP Adresi" value={p.trade.kepAddress} mono />
                ) : null}
              </dl>
            </section>
          ) : null}

          {edit?.gallery ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Galeri</h2>
              <div className="mt-4">{edit.gallery}</div>
            </section>
          ) : photos.length > 0 ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Galeri</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt={`${p.name} görsel ${i + 1}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-zinc-950/5 transition hover:opacity-90"
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          {edit?.aside}
          {edit?.services ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Hizmetler</h2>
              <div className="mt-3">{edit.services}</div>
            </section>
          ) : services.length > 0 ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                Hizmetler
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {services.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {edit?.certifications ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">Sertifikalar</h2>
              <div className="mt-3">{edit.certifications}</div>
            </section>
          ) : certifications.length > 0 || certificateImages.length > 0 ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                Sertifikalar
              </h2>
              {certifications.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {certifications.map((c) => (
                    <li
                      key={c}
                      className="flex items-center gap-2 text-sm text-zinc-700"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-xs text-white">
                        ✓
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}
              {certificateImages.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {certificateImages.map((src, i) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Sertifika ${i + 1}`}
                        loading="lazy"
                        className="aspect-square w-full rounded-lg object-cover ring-1 ring-zinc-950/5 transition hover:opacity-90"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Değerlendirmeler — firma bazında gruplu özet (2026-08-22): genel
              puan = ortak ortalamalarının ortalaması; her ortak tek satır;
              ad yalnız opt-in + platform içi ("Doğrulanmış alıcı/tedarikçi"). */}
          {p.reviewSummary && p.reviewSummary.orders > 0 ? (
            <ReviewSummarySection s={p.reviewSummary} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ROLE_LABEL = { buyer: "Doğrulanmış alıcı", seller: "Doğrulanmış tedarikçi" } as const;
/** Rol bilinmiyorsa (bkz. ReviewPartner.role) nötr etiket. */
const roleLabel = (r: "buyer" | "seller" | null) =>
  r ? ROLE_LABEL[r] : "Doğrulanmış ortak";

function Stars({ value, label }: { value: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className="shrink-0 text-sm text-amber-500" aria-label={label ?? `${value} / 5`}>
      {"★".repeat(Math.max(0, Math.min(5, full)))}
      <span className="text-zinc-200" aria-hidden="true">
        {"★".repeat(Math.max(0, 5 - full))}
      </span>
    </span>
  );
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("tr-TR", { month: "short", year: "numeric" })
    : "";
}

/**
 * Değerlendirme özeti bölümü — sunucu bileşeninde de çalışır (olay işleyici
 * yok; "diğer yorumlar" native <details>). Hem /firma/[slug] hem platform içi.
 */
function ReviewSummarySection({ s }: { s: ReviewSummary }) {
  const maxDist = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => s.distribution[k]));
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold text-zinc-900">Değerlendirmeler</h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-semibold tabular-nums text-zinc-900">
              {s.avg.toFixed(1)}
            </span>
            <Stars value={s.avg} label={`Genel ${s.avg.toFixed(1)} / 5`} />
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {s.firms} firma · {s.orders} sipariş · her firma bir oy
          </div>
        </div>
        <dl className="min-w-[160px] flex-1 space-y-1">
          {([5, 4, 3, 2, 1] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs text-zinc-500">
              <dt className="w-3 tabular-nums">{k}</dt>
              <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${(s.distribution[k] / maxDist) * 100}%` }}
                />
              </dd>
              <dd className="w-5 text-right tabular-nums">{s.distribution[k]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="mt-4 space-y-3">
        {s.partners.map((pt, i) => {
          const [latest, ...rest] = pt.comments;
          return (
            <li key={`${pt.role ?? "x"}-${pt.lastAt}-${i}`} className="border-t border-zinc-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="truncate text-sm font-semibold text-zinc-900">
                    {pt.name ?? roleLabel(pt.role)}
                  </span>
                  {pt.name ? (
                    <span className="ml-2 text-xs text-zinc-400">{roleLabel(pt.role).replace("Doğrulanmış ", "")}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Stars value={pt.avg} label={`${pt.avg} / 5`} />
                  <span className="tabular-nums">{pt.avg.toFixed(1)}</span>
                  <span>· {pt.count} sipariş</span>
                  <span>· {monthYear(pt.lastAt)}</span>
                </div>
              </div>
              {latest ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{latest.comment}</p>
              ) : null}
              {rest.length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">
                    Diğer {rest.length} yorum
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {rest.map((c, j) => (
                      <li key={j} className="text-sm text-zinc-600">
                        <span className="mr-2 text-xs text-zinc-400">{monthYear(c.createdAt)} · {c.rating}/5</span>
                        <span className="whitespace-pre-wrap">{c.comment}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

