"use client";

import { AudienceSwitch, useAudience } from "./audience-switch";
import { PanelHeroSearch } from "@/components/dashboard/panel-hero-search";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";

/**
 * ANASAYFA HERO'SU — panel anasayfalarının hero'su, giriş yapmamış hâliyle
 * (2026-09-08, kullanıcı kararı: "panel anasayfalarını www.rothern.com
 * anasayfasına taşı, seçime göre o ekranlar gelsin, renkleriyle birlikte").
 *
 * Bileşen panelin `PanelHeroSearch`inin TA KENDİSİ — kopyası değil. Panel
 * dosyasına dokunulmadı; hero zaten tümüyle prop'la sürülüyor ve `ai` prop'u
 * isteğe bağlı.
 *
 * TEK HERO, İKİ PROP KÜMESİ. İki hero'yu birden HTML'e basmak (blokların
 * geri kalanında yaptığımız gibi) iki arka plan fotoğrafını birden
 * indirirdi; band zaten istemci bileşeni olduğu için tarafı burada seçmek
 * bedava.
 *
 * ANONİMDE ÇİZİLMEYENLER ve gerekçeleri:
 *  · **AI ile ara** — `assertAiAccess` Silver+ ∧ koltuk izni ister; anahtarı
 *    göstermek çalışmayan bir seçenek sunmak olurdu.
 *  · **"Talep aç" / "Ürün ekle"** birincil eylemleri — panelde doğrudan
 *    sihirbaza gider; burada kayıt niyetiyle (`?intent=`) kayda gider,
 *    kullanıcı onboarding'den sonra aynı sihirbaza düşer.
 *
 * Sunucu HER ZAMAN alıcı yüzünü basar (hidrasyon kuralı, 2026-09-05 #418
 * dersi: yola/depolamaya göre RENDER DALLANMASI yapılmaz; tercih istemci
 * efektinde okunur).
 */
export function HomeHero() {
  const { audience } = useAudience();
  const supplier = audience === "supplier";

  return (
    <>
      {/* Anahtar bandın ÜSTÜNDE, header'ın hemen altında: fotoğrafın üstüne
          bindirmek okunabilirliği riske atardı ve seçim bir kontroldür,
          süslemenin parçası değil. */}
      {/* Üst boşluk = SABİT header'ın yüksekliği + nefes payı. Header iki
          katmanlı: `md` altında yalnız ana satır (4 rem), üstünde ince koyu
          şerit de var (toplam 6,25 rem). Bandın kendi `-mt-6/-mt-8`'i
          fotoğrafı anahtarın altına çektiği için anahtar fotoğrafın üst
          ucunda oturur — arada boşluk kalmaz. */}
      <div className="flex justify-center px-4 pt-[5rem] pb-3 md:pt-[7.25rem]">
        <AudienceSwitch />
      </div>

      {supplier ? (
        <PanelHeroSearch
          key="supplier"
          eyebrow="Satın alma talepleri"
          title="Hangi talebe"
          titleAccent="teklif vereceksiniz?"
          splitTitle
          lead="Doğrulanmış alıcıların açık talepleri — kapalı zarf, birbirini görmeyen teklifler. Teklif vermek ücretsiz hesapla."
          placeholder="Talep, sektör veya ürün arayın"
          action={MARKETPLACE_ROUTES.demands}
          accent="emerald"
          backdrop
          backdropSrc="/hero/hero-scene-satis.webp"
          ctaNote={{
            text: "Teklif vermek ve alıcıyı görmek için",
            label: "Ücretsiz kaydolun",
            href: signupHref("teklif"),
          }}
        />
      ) : (
        <PanelHeroSearch
          key="buyer"
          eyebrow="Küresel tedarik ağınız"
          title="Hangi ürün için"
          titleAccent="tedarikçi arıyorsunuz?"
          splitTitle
          lead="Doğrulanmış tedarikçilerin vitrinlerini fiyat ve minimum sipariş bilgisiyle inceleyin."
          placeholder="Ürün, firma veya sektör arayın..."
          action={MARKETPLACE_ROUTES.products}
          supplierScope={{
            action: MARKETPLACE_ROUTES.companies,
            placeholder: "Firma adı, sektör ya da sattığı ürün arayın",
            label: "Tedarikçi",
          }}
          accent="blue"
          backdrop
          ctaNote={{
            text: "Aradığınız ürünü bulamadınız mı?",
            label: "Talep aç",
            href: signupHref("talep"),
          }}
        />
      )}
    </>
  );
}
