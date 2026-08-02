import type { ReactNode } from "react";

import { safeExternalUrl } from "@/lib/safe-url";

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
  /** Madde 18 — sipariş değerlendirmeleri (yorum + puan + değerlendiren firma). */
  reviews?: {
    rating: number;
    comment: string | null;
    reviewer: string;
    createdAt: string;
  }[];
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
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
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
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

/**
 * Firma profil görünümü — hem herkese açık SEO sayfası (/firma/[slug]) hem
 * bağlantı-içi sayfa (/company/firma/[id]) AYNI bileşeni kullanır. Tek fark:
 * `actions` (bağlan/engelle) ve `children` (ihaleler) slotları.
 */
export function CompanyProfileView({
  profile: p,
  actions,
  children,
}: {
  profile: ProfileViewData;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const services = p.services ?? [];
  const certifications = p.certifications ?? [];
  const certificateImages = p.certificateImages ?? [];
  const photos = p.photos ?? [];
  const location = [p.city, p.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
        <div className="relative h-40 w-full bg-gradient-to-br from-zinc-900 to-zinc-700 sm:h-56">
          {p.coverImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.coverImageUrl}
                alt={`${p.name} kapak görseli`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </>
          ) : null}
        </div>

        <div className="px-5 pb-6 sm:px-8">
          <div className="relative z-10 -mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="rounded-3xl bg-white p-1.5 shadow-lg ring-1 ring-zinc-950/5">
                {p.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.logoUrl}
                    alt={`${p.name} logosu`}
                    className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-zinc-950 text-4xl font-bold text-white sm:h-28 sm:w-28">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
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
                <p className="mt-1 text-sm text-zinc-500">
                  {[p.industry, location].filter(Boolean).join("  ·  ") ||
                    "Rothern tedarik profili"}
                  {p.rothernId ? (
                    <span className="ml-2 font-mono text-xs text-zinc-400">
                      {p.rothernId}
                    </span>
                  ) : null}
                </p>
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
          {p.foundedYear ||
          p.employeeCount ||
          p.website ||
          p.linkedinUrl ||
          p.instagramUrl ||
          (p.rating && p.rating.count > 0) ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-3 border-t border-zinc-100 pt-4">
              {p.rating && p.rating.count > 0 ? (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Değerlendirme
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-zinc-900">
                    <span className="text-amber-500">★</span>
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
          {p.aboutText ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
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
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
              <h2 className="text-base font-semibold text-zinc-900">
                Ticari Bilgiler
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.trade.legalName ? (
                  <TradeRow label="Ticari Ünvan" value={p.trade.legalName} />
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

          {photos.length > 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
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
          {services.length > 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
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

          {certifications.length > 0 || certificateImages.length > 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
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
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-[11px] text-white">
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

          {/* Madde 18 — değerlendirmeler: yorum + puan listesi (en yeni önce). */}
          {(p.reviews?.length ?? 0) > 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
              <h2 className="text-base font-semibold text-zinc-900">
                Değerlendirmeler
                {p.rating && p.rating.count > 0 ? (
                  <span className="ml-2 text-sm font-medium text-amber-600">
                    ★ {p.rating.avg.toFixed(1)}{" "}
                    <span className="text-zinc-400">({p.rating.count})</span>
                  </span>
                ) : null}
              </h2>
              <ul className="mt-3 space-y-4">
                {p.reviews!.map((r, i) => (
                  <li
                    key={`${r.reviewer}-${r.createdAt}-${i}`}
                    className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {r.reviewer}
                      </span>
                      <span
                        className="shrink-0 text-sm text-amber-500"
                        aria-label={`${r.rating} / 5`}
                      >
                        {"★".repeat(r.rating)}
                        <span className="text-zinc-200" aria-hidden="true">
                          {"★".repeat(Math.max(0, 5 - r.rating))}
                        </span>
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                    </div>
                    {r.comment ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-600">
                        {r.comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
