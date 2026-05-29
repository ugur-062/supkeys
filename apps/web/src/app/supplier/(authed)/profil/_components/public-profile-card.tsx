"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { useSupplierPublicProfile } from "@/hooks/use-supplier-profile";
import { Award, ExternalLink, Globe, Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * V2-PUBLIC-PROFILE — Tedarikçi profili sayfasında public profil kartı.
 * Üç state'i de ele alır:
 *  - STANDARD: PREMIUM upsell banner
 *  - PREMIUM + slug yok: "Oluştur" CTA
 *  - PREMIUM + slug var: slug + Aç/Düzenle butonları
 */
export function PublicProfileCard() {
  const { data, isLoading } = useSupplierPublicProfile();

  if (isLoading || !data) return null;

  // STANDARD üyelere: PREMIUM upsell
  if (!data.isPremium) {
    return (
      <PanelCard className="bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <Award className="h-5 w-5 text-yellow-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-brand-900">
              Herkese Açık Profil — PREMIUM
            </h3>
            <p className="text-sm text-slate-700 mt-1">
              Google'da görünür olun, Supkeys profilinizle yeni alıcılarla
              bağlantı kurun. PREMIUM üyeliğe yükseltin.
            </p>
            <Link href="/supplier/ayarlar" className="inline-block mt-3">
              <Button variant="primary" size="sm" type="button">
                <Sparkles className="h-3.5 w-3.5" /> PREMIUM'a Yükselt
              </Button>
            </Link>
          </div>
        </div>
      </PanelCard>
    );
  }

  // PREMIUM ama slug yok — oluşturma CTA
  if (!data.slug) {
    return (
      <PanelCard>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Globe className="h-5 w-5 text-brand-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-brand-900">
              Herkese Açık Profilinizi Oluşturun
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Slug seçin, &ldquo;Hakkımızda&rdquo; yazın ve profiliniz yayına
              alınsın. Google'da görünmeye başlayın.
            </p>
            <Link href="/supplier/profil/public" className="inline-block mt-3">
              <Button variant="primary" size="sm" type="button">
                Profili Oluştur
              </Button>
            </Link>
          </div>
        </div>
      </PanelCard>
    );
  }

  // PREMIUM + slug ayarlanmış
  return (
    <PanelCard>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Globe className="h-5 w-5 text-brand-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-brand-900">
              Herkese Açık Profil
            </h3>
            {data.publicEnabled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-success-50 border border-success-500/20 text-xs font-semibold text-success-700">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-success-500"
                />
                Yayında
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
                Yayın Dışı
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1 font-mono break-all">
            /t/{data.slug}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {data.publicEnabled && (
              <Link
                href={`/t/${data.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm" type="button">
                  Profili Aç
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
            <Link href="/supplier/profil/public">
              <Button variant="primary" size="sm" type="button">
                Düzenle
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
