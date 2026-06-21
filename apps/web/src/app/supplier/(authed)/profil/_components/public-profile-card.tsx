"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useSupplierPublicProfile } from "@/hooks/use-supplier-profile";
import { Award, ExternalLink, Globe, Sparkles } from "lucide-react";

/**
 * V2-PUBLIC-PROFILE — Tedarikçi profili sayfasında public profil bölümü.
 * Üç state'i de ele alır:
 *  - STANDARD: PREMIUM upsell
 *  - PREMIUM + slug yok: "Oluştur" CTA
 *  - PREMIUM + slug var: slug + Aç/Düzenle butonları
 */
export function PublicProfileCard() {
  const { data, isLoading } = useSupplierPublicProfile();

  if (isLoading || !data) return null;

  // STANDARD üyelere: PREMIUM upsell
  if (!data.isPremium) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <Award className="h-5 w-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <Subheading>Herkese Açık Profil — PREMIUM</Subheading>
            <Text className="mt-1">
              Google&apos;da görünür olun, Supkeys profilinizle yeni alıcılarla
              bağlantı kurun. PREMIUM üyeliğe yükseltin.
            </Text>
            <div className="mt-3">
              <Button href="/supplier/ayarlar">
                <Sparkles data-slot="icon" /> PREMIUM&apos;a Yükselt
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // PREMIUM ama slug yok — oluşturma CTA
  if (!data.slug) {
    return (
      <section>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
            <Globe className="h-5 w-5 text-zinc-700" />
          </div>
          <div className="min-w-0 flex-1">
            <Subheading>Herkese Açık Profilinizi Oluşturun</Subheading>
            <Text className="mt-1">
              Slug seçin, &ldquo;Hakkımızda&rdquo; yazın ve profiliniz yayına
              alınsın. Google&apos;da görünmeye başlayın.
            </Text>
            <div className="mt-3">
              <Button href="/supplier/profil/public">Profili Oluştur</Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // PREMIUM + slug ayarlanmış
  return (
    <section>
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Globe className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Subheading>Herkese Açık Profil</Subheading>
            {data.publicEnabled ? (
              <Badge color="lime">Yayında</Badge>
            ) : (
              <Badge color="zinc">Yayın Dışı</Badge>
            )}
          </div>
          <Text className="mt-1 break-all font-mono">/{data.slug}</Text>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data.publicEnabled ? (
              <Button
                outline
                href={`/${data.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Profili Aç
                <ExternalLink data-slot="icon" />
              </Button>
            ) : null}
            <Button href="/supplier/profil/public">Düzenle</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
