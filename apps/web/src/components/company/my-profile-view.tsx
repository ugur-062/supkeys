"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  CompanyProfileView,
  type ProfileViewData,
} from "@/components/company/company-profile-view";
import { PublicProfileForm } from "@/components/company/public-profile-form";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { cn } from "@/lib/utils";
import { ExternalLink, Eye, EyeOff, Pencil, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Profilim — HERKESE AÇIK profilin birebir önizlemesi + Düzenle sekmesi.
 * Önizleme, diğer firmaların /company/firma/[id] sayfasında gördüğüyle aynı
 * bileşeni (CompanyProfileView) kullanır; "başkaları beni nasıl görüyor"
 * sorusunun cevabıdır. Ticari sicil bilgileri Ayarlar → Firma'dan gelir.
 */
export function MyProfileView() {
  const { data: profile, isLoading } = useCompanyProfile();
  const [tab, setTab] = useState<"preview" | "edit">("preview");

  if (isLoading || !profile) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }

  // P2 (denetim §10.5): profil tamamlanma — eksik alanlar tıklanabilir çip
  // olarak listelenir (profil alanları → Düzenle sekmesi, sicil alanları →
  // Ayarlar/Firma). %100'de kart tamamen gizlenir.
  const completeness = (() => {
    const items: { label: string; done: boolean; target: "edit" | "firma" }[] =
      [
        { label: "Logo", done: !!profile.logoUrl, target: "edit" },
        {
          label: "Kapak görseli",
          done: !!profile.coverImageUrl,
          target: "edit",
        },
        {
          label: "Hakkında yazısı",
          done: !!profile.aboutText?.trim(),
          target: "edit",
        },
        {
          label: "Ürün / hizmetler",
          done: (profile.services ?? []).length > 0,
          target: "edit",
        },
        {
          label: "Fotoğraflar",
          done: (profile.photos ?? []).length > 0,
          target: "edit",
        },
        {
          label: "Kuruluş yılı",
          done: profile.foundedYear != null,
          target: "edit",
        },
        {
          label: "Çalışan sayısı",
          done: !!profile.employeeCount,
          target: "edit",
        },
        { label: "Web sitesi", done: !!profile.website, target: "edit" },
        { label: "Sektör", done: !!profile.industry, target: "firma" },
        { label: "Şehir", done: !!profile.city, target: "firma" },
        {
          label: "Faaliyet kategorileri",
          done:
            (profile.buyerCategoryIds ?? []).length +
              (profile.sellerCategoryIds ?? []).length >
            0,
          target: "firma",
        },
      ];
    const doneCount = items.filter((i) => i.done).length;
    return {
      missing: items.filter((i) => !i.done),
      pct: Math.round((doneCount / items.length) * 100),
    };
  })();

  const viewData: ProfileViewData = {
    name: profile.name,
    rothernId: profile.rothernId,
    industry: profile.industry,
    city: profile.city,
    country: profile.country,
    logoUrl: profile.logoUrl,
    coverImageUrl: profile.coverImageUrl,
    aboutText: profile.aboutText,
    services: profile.services ?? [],
    certifications: profile.certifications ?? [],
    certificateImages: profile.certificateImages ?? [],
    photos: profile.photos ?? [],
    foundedYear: profile.foundedYear,
    employeeCount: profile.employeeCount,
    website: profile.website,
    linkedinUrl: profile.linkedinUrl,
    instagramUrl: profile.instagramUrl,
    trade: {
      legalName: profile.legalName,
      taxNumber: profile.taxNumber,
      taxOffice: profile.taxOffice,
      mersisNo: profile.mersisNo,
      tradeRegistryNo: profile.tradeRegistryNo,
      kepAddress: profile.kepAddress,
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Profilim</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            {tab === "preview"
              ? "Diğer firmaların sizi nasıl gördüğünün birebir önizlemesi."
              : "Buradaki bilgiler firma profilinde ve Google'da görünür."}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Yayındaki profile giden bağlantı — sekmeden bağımsız, hep elde. */}
          {profile.publicEnabled && profile.slug ? (
            <a
              href={`/firma/${profile.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              Yayındaki profili aç
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {/* Önizleme / Düzenle geçişi */}
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
            {(
              [
                ["preview", "Önizleme", Eye],
                ["edit", "Düzenle", Pencil],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  tab === key
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Görünürlük durumu — yalnız ÖNİZLEME'de. Düzenle sekmesinde aynı bilgiyi
          taşıyan yayın anahtarı zaten formun başında duruyor; ikisini birden
          göstermek aynı şeyi iki kez söylemek olurdu. */}
      {tab === "preview" ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm",
            profile.publicEnabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          {profile.publicEnabled ? (
            <>
              <Eye className="size-4 shrink-0" aria-hidden />
              Profiliniz herkese açık — firma dizininde ve aramalarda
              görünüyorsunuz.
            </>
          ) : (
            <>
              <EyeOff className="size-4 shrink-0" aria-hidden />
              Profiliniz şu an herkese kapalı — dizinde görünmüyorsunuz.
              <button
                type="button"
                onClick={() => setTab("edit")}
                className="font-semibold underline"
              >
                Düzenle&apos;den açabilirsiniz.
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* Profil tamamlanma kartı — yalnız önizlemede ve %100 altında. */}
      {tab === "preview" && completeness.pct < 100 ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Profil Tamamlanma
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Dolu profiller dizinde ve davetlerde daha çok güven verir —
                eksikleri tıklayıp tamamlayabilirsiniz.
              </p>
            </div>
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900">
              %{completeness.pct}
            </span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-label="Profil tamamlanma"
            aria-valuenow={completeness.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-zinc-900 transition-all duration-300"
              style={{ width: `${completeness.pct}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {completeness.missing.map((m) =>
              m.target === "edit" ? (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setTab("edit")}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-900"
                >
                  + {m.label}
                </button>
              ) : (
                <Link
                  key={m.label}
                  href="/company/ayarlar/firma"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-900"
                >
                  + {m.label}
                </Link>
              ),
            )}
          </div>
        </section>
      ) : null}

      {tab === "preview" ? (
        <>
          <CompanyProfileView profile={viewData} />
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <Settings2 className="size-3.5" aria-hidden />
            Ticari bilgiler (ünvan, VKN, MERSİS…) buradan değil{" "}
            <Link
              href="/company/ayarlar/firma"
              className="font-semibold text-zinc-600 underline hover:text-zinc-900"
            >
              Ayarlar → Firma Bilgileri
            </Link>{" "}
            üzerinden güncellenir.
          </p>
        </>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <Settings2 className="size-3.5" aria-hidden />
            Firma adı, ünvan ve şehir{" "}
            <Link
              href="/company/ayarlar/firma"
              className="font-semibold text-zinc-600 underline hover:text-zinc-900"
            >
              Ayarlar → Firma Bilgileri
            </Link>
            , IBAN ve kimlik bilgileri{" "}
            <Link
              href="/company/ayarlar/dogrulama"
              className="font-semibold text-zinc-600 underline hover:text-zinc-900"
            >
              Doğrulama Belgeleri
            </Link>{" "}
            sayfasından yönetilir.
          </p>
          <PublicProfileForm />
        </>
      )}
    </div>
  );
}
