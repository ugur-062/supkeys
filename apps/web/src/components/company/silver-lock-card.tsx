"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type { ReactNode } from "react";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { Button } from "@/components/catalyst/button";

/** Doğrulama sayfası — paket satın almanın tek şartı. */
export const VERIFY_HREF = "/company/ayarlar/dogrulama";

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
 * DOĞRULAMA ÖNCE — tek kural (2026-09-28): paket alımı doğrulama ister;
 * doğrulanmamış (UNVERIFIED) ya da reddedilmiş firmada birincil eylem
 * doğrulamadır. İncelemedeki (PENDING) ve doğrulanmış firmada değil.
 */
export function useVerifyFirst(): boolean {
  const status = useCompanyAuthStore((s) => s.company?.companyVerificationStatus);
  return !!status && status !== "VERIFIED" && status !== "PENDING";
}

/**
 * PAKET ÇAĞRISININ ADRESİ — tek kural: doğrulama önce gerekiyorsa doğrulama
 * sayfası, değilse Paketler. Tek düğmeli/bağlantılı her yükseltme çağrısı bunu
 * kullanır (arayüz testi webC-2: Bağlantılar "Silver ile davet et" ve teklif
 * bantları reddedilmiş ücretsiz firmayı doğrudan Paketler'e gönderiyordu).
 */
export function useUpgradeHref(): string {
  return useVerifyFirst() ? VERIFY_HREF : PRICING_HREF;
}

/**
 * BANT/EKRAN DÜĞMELERİ (catalyst `Button`) — `UpgradeActions`'ın düğme hali:
 * doğrulama önce gerekiyorsa "Önce ücretsiz doğrulan" birincil + paket düğmesi
 * çerçeveli; değilse yalnız birincil paket düğmesi. Çağıran sarmalayıcıyı
 * (flex-wrap) kendisi verir.
 */
export function UpgradeButtons({
  pricingLabel,
  className,
}: {
  /** Paket düğmesinin metni (ör. "Paketleri gör"). */
  pricingLabel: string;
  className?: string;
}) {
  const t = useTranslations("web.panel.trade.silverLockCard");
  const verifyFirst = useVerifyFirst();
  if (!verifyFirst) {
    return (
      <Button href={PRICING_HREF} className={className}>
        {pricingLabel}
      </Button>
    );
  }
  return (
    <>
      <Button href={VERIFY_HREF} className={className}>
        {t("onceUcretsizDogrulan")}
      </Button>
      <Button href={PRICING_HREF} outline className={className}>
        {pricingLabel}
      </Button>
    </>
  );
}

/**
 * METİN İÇİ PAKET BAĞLANTISININ YANINA doğrulama bağlantısı: cümle Paketler'e
 * bağlanır (ne açılacağını anlatır), doğrulama önce gerekiyorsa ardından
 * "Önce ücretsiz doğrulan" gelir — paket seçip doğrulamaya geri atılmasın.
 * Doğrulama gerekmiyorsa hiçbir şey çizmez.
 */
export function VerifyFirstLink({ className = "" }: { className?: string }) {
  const t = useTranslations("web.panel.trade.silverLockCard");
  const verifyFirst = useVerifyFirst();
  if (!verifyFirst) return null;
  return (
    <>
      {" "}
      <Link href={VERIFY_HREF} className={`font-semibold underline underline-offset-2 ${className}`}>
        {t("onceUcretsizDogrulan")}
      </Link>
    </>
  );
}

/**
 * Paket çağrısının EYLEM ÇİFTİ — her kilit aynı dili konuşsun diye tek yerde
 * (arayüz testi D-194: Ziyaret Edenler kilidi doğrulanmamış firmayı doğrudan
 * Paketler'e gönderiyor, satın alırken doğrulamaya atılıyordu). Doğrulama
 * önce gerekiyorsa not + "Önce ücretsiz doğrulan" birincil, "Paketleri gör"
 * ikincil; değilse tek birincil paket düğmesi.
 */
export function UpgradeActions({
  ctaLabel,
  className = "",
  children,
}: {
  ctaLabel?: string;
  className?: string;
  /** Düğmelerin yanına eklenecek ipucu (ör. ücretsiz yol notu). */
  children?: ReactNode;
}) {
  const t = useTranslations("web.panel.trade.silverLockCard");
  const verifyFirst = useVerifyFirst();
  // Birincil düğme PORTAL RENGİNDE (2026-09-17 kararı; arayüz testi D-284 —
  // kilit kartlarında siyah kalmıştı).
  const fill = accentFillClass(useButtonAccent());
  return (
    <>
      {verifyFirst ? <p className="mt-3 text-sm text-zinc-700">{t("onceDogrulanNot")}</p> : null}
      <div className={`mt-4 flex flex-wrap items-center gap-3 ${className}`}>
        {verifyFirst ? (
          <>
            <Link
              href={VERIFY_HREF}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white transition ${fill}`}
            >
              {t("onceUcretsizDogrulan")}
            </Link>
            <Link href={PRICING_HREF} className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline">
              {t("paketleriGor")}
            </Link>
          </>
        ) : (
          <Link
            href={PRICING_HREF}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white transition ${fill}`}
          >
            {ctaLabel ?? t("silverPaketineGec")}
          </Link>
        )}
        {children}
      </div>
    </>
  );
}

/**
 * SILVER KİLİT KARTI (2026-09-06, "premium çekmek için"): ücretsiz üyenin
 * çarptığı her kilit aynı dili konuşur — açık talepler, talep detayı, bilgi
 * talebinde alıcı kimliği. Uydurma veri yok: `meta` ve `children` çağıranın
 * GERÇEK sayıları/örnekleridir. Tek CTA: paket sayfası.
 *
 * DOĞRULAMA ÖNCE (2026-09-28, kullanıcı: "Silver'a veya doğrulamaya
 * yönlendirme"): eylem çifti `UpgradeActions`.
 */
export function SilverLockCard({
  title,
  description,
  meta,
  children,
  ctaLabel,
  footnote,
  className = "",
}: {
  title: string;
  description: string;
  /** Tek satır gerçek sayı özeti (ör. "4 kategorinizde · 3 bu hafta"). */
  meta?: string | null;
  /** Bulanık örnek satırlar gibi ek içerik (dekoratif; aria-hidden çağıranda). */
  children?: ReactNode;
  ctaLabel?: string;
  /**
   * Düğmelerin yanındaki dipnot. Verilmezse alım talebi notu (kartın ilk
   * kullanım yeri); `null` → dipnot yok (ör. bilgi talepleri, arayüz testi D-284).
   */
  footnote?: ReactNode | null;
  className?: string;
}) {
  const t = useTranslations("web.panel.trade.silverLockCard");
  const note = footnote === undefined ? t("baglantiDavetiyleGelenTalepleriUcretsiz") : footnote;
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
      <UpgradeActions ctaLabel={ctaLabel}>
        {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
      </UpgradeActions>
    </section>
  );
}
