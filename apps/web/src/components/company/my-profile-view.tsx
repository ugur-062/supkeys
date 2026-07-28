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
      <div className="mx-auto max-w-5xl space-y-4" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }

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
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>Profilim</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            {tab === "preview"
              ? "Diğer firmaların seni nasıl gördüğünün birebir önizlemesi."
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
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
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
              Profilin herkese açık — firma dizininde ve aramalarda
              görünüyorsun.
            </>
          ) : (
            <>
              <EyeOff className="size-4 shrink-0" aria-hidden />
              Profilin şu an herkese kapalı — dizinde görünmüyorsun.
              <button
                type="button"
                onClick={() => setTab("edit")}
                className="font-semibold underline"
              >
                Düzenle&apos;den açabilirsin.
              </button>
            </>
          )}
        </div>
      ) : null}

      {tab === "preview" ? (
        <>
          <CompanyProfileView profile={viewData} />
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
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
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
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
