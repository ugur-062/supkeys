import type { Locale } from "@rothern/i18n";
import type { ProfileViewData } from "@/components/company/company-profile-view";
import type { PublicProfile } from "@/lib/public/marketplace-api";
import { contentLangOf } from "@/lib/seo/meta";

/**
 * Herkese açık `/firma/<slug>` → `CompanyProfileView` verisi (beyaz liste).
 *
 * Alan alan kurulur: kapılı alanlar (Rothern ID, web/sosyal, puan dağılımı,
 * sipariş sayıları) BURAYA YAZILMAZ — `null` bile değil; anahtar adı RSC
 * yüküne düşerdi. `translatedFrom` atlandığı için EN/RU profilde makine
 * çevirisi notu ("Otomatik çeviri (kaynak: Türkçe)") hiç çizilmiyordu
 * (arayüz testi O-018); ürün ve talep sayfalarıyla aynı not artık burada da.
 */
export function publicProfileViewData(p: PublicProfile, locale: Locale): ProfileViewData {
  return {
    name: p.name,
    goldMember: p.goldMember,
    verified: p.verified,
    industry: p.industry,
    activities: p.activities,
    categories: p.categories,
    city: p.city,
    country: p.country,
    logoUrl: p.logoUrl,
    coverImageUrl: p.coverImageUrl,
    aboutText: p.aboutText,
    translatedFrom: p.translatedFrom,
    // Tanıtım bu dilde hazır değilse (çeviri bekliyor / yabancı kaynak) bloklar kaynağın `lang`ını taşır.
    contentLang: contentLangOf(p, locale),
    services: p.services ?? [],
    certifications: p.certifications ?? [],
    certificateImages: p.certificateImages ?? [],
    foundedYear: p.foundedYear,
    employeeCount: p.employeeCount,
    ratingAvg: p.ratingAvg,
  };
}
