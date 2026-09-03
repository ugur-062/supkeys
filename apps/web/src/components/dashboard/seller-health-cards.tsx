"use client";

import { useCatalogCounts } from "@/hooks/use-company-items";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { profileCompleteness } from "@/lib/company/profile-completeness";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * PROFİL & KATALOG SAĞLIĞI — satış panosu, iki küçük kart.
 *
 * Gerekçe (Europages): eşleşme kalitesi profil tamlığına ve ürün kategorisine
 * bağlı; eksik profil = eşleşmeyen talep. Kullanıcı bunu "size uygun talep
 * yok" boş durumundan değil, buradan öğrenmeli.
 *
 * Profil yüzdesi Profilim sayfasıyla AYNI fonksiyondan (`profileCompleteness`)
 * — burada yeniden hesap YOK. Ürün sayaçları listeden değil sunucudaki
 * firma-geneli sayımdan (`counts`), Ürünlerim sekmeleriyle aynı sayı.
 */
export function SellerHealthCards() {
  const profile = useCompanyProfile();
  const counts = useCatalogCounts();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ProfileHealthCard profile={profile} />
      <CatalogHealthCard counts={counts} />
    </div>
  );
}

function ProfileHealthCard({
  profile,
}: {
  profile: ReturnType<typeof useCompanyProfile>;
}) {
  if (profile.isLoading || !profile.data) {
    return <HealthSkeleton />;
  }
  const c = profileCompleteness(profile.data);
  const complete = c.pct === 100;
  const shown = c.missing.slice(0, 3);
  const rest = c.missing.length - shown.length;
  return (
    <HealthCard
      title="Profil"
      headline={complete ? "Profil tamam" : `Profil %${c.pct} tamam`}
      pct={c.pct}
      body={
        complete
          ? "Eksik alan yok — alıcılar firma sayfanızı tam görüyor."
          : `Eksik: ${shown.join(", ")}${rest > 0 ? ` +${rest}` : ""}`
      }
      href="/company/satis/profilim"
      cta={complete ? "Profili gör" : "Profili tamamla"}
    />
  );
}

function CatalogHealthCard({
  counts,
}: {
  counts: ReturnType<typeof useCatalogCounts>;
}) {
  if (counts.isLoading || !counts.data) {
    return <HealthSkeleton />;
  }
  const { published, draft } = counts.data;
  return (
    <HealthCard
      title="Ürünler"
      headline={`${published} yayında · ${draft} taslak`}
      body="Eşleşen açık talepler ürün kategorilerinize göre bulunur."
      href="/company/satis/urunlerim"
      cta="Ürün ekle"
    />
  );
}

function HealthCard({
  title,
  headline,
  pct,
  body,
  href,
  cta,
}: {
  title: string;
  headline: string;
  /** Verilirse başlığın altında ince ilerleme çubuğu. */
  pct?: number;
  body: ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{headline}</p>
      {pct != null ? (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Profil tamamlanma"
        >
          <div
            className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-zinc-900")}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-sm text-slate-500">{body}</p>
      <Link
        href={href}
        className="mt-auto inline-flex items-center gap-1 self-start pt-4 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
      >
        {cta}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

function HealthSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-zinc-200/60" aria-hidden />;
}
