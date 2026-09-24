"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

/**
 * PAKET SAYFASININ ADRESİ — PANEL İÇİNDE KALIR (tek kaynak).
 *
 * 2026-09-15'e kadar `/nasil-calisir#fiyatlar`tı: panelde çalışan kullanıcı
 * "Paketleri Gör"e basınca HERKESE AÇIK PAZARLAMA SAYFASINA düşüyordu — üst
 * çubuğu, sol menüsü, firma bağlamı gidiyor; kullanıcı sistemden çıkmış gibi
 * hissediyordu (kullanıcı bildirdi). Artık panel içindeki `/company/premium`:
 * önce doğrulama durumu, sonra paket seçimi, aynı kabuğun içinde.
 *
 * Pazarlama başlığındaki (`marketing-header.tsx`) fiyat bağlantısı AYRI ve
 * public kalır — orada doğru olan odur.
 */
export const PRICING_HREF = "/company/premium";

/**
 * SILVER KİLİT KARTI (2026-09-06, "premium çekmek için"): ücretsiz üyenin
 * çarptığı her kilit aynı dili konuşur — açık talepler, talep detayı, bilgi
 * talebinde alıcı kimliği. Uydurma veri yok: `meta` ve `children` çağıranın
 * GERÇEK sayıları/örnekleridir. Tek CTA: paket sayfası.
 */
export function SilverLockCard({
  title,
  description,
  meta,
  children,
  ctaLabel,
  className = "",
}: {
  title: string;
  description: string;
  /** Tek satır gerçek sayı özeti (ör. "4 kategorinizde · 3 bu hafta"). */
  meta?: string | null;
  /** Bulanık örnek satırlar gibi ek içerik (dekoratif; aria-hidden çağıranda). */
  children?: ReactNode;
  ctaLabel?: string;
  className?: string;
}) {
  const t = useTranslations("web.panel.trade.silverLockCard");
  return (
    <section
      aria-label={title}
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Lock aria-hidden className="size-5 text-zinc-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h3>
          {meta ? <p className="mt-0.5 text-sm font-medium text-zinc-700">{meta}</p> : null}
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
      </div>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={PRICING_HREF}
          className="inline-flex items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {ctaLabel ?? t("silverPaketineGec")}
        </Link>
        <span className="text-xs text-zinc-500">
          {t("baglantiDavetiyleGelenTalepleriUcretsiz")}
        </span>
      </div>
    </section>
  );
}
