"use client";

import { useTranslations } from "next-intl";

import { AudienceSwitch, useAudience } from "./audience-switch";
import { HeroDecor, PanelHeroSearch } from "@/components/dashboard/panel-hero-search";
import { BUYER_OBJECTS, BUYER_WIDGETS, SELLER_OBJECTS, SELLER_WIDGETS } from "@/lib/company/hero-decor";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { Suspense } from "react";

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
 * Sunucu HER ZAMAN TEDARİKÇİ yüzünü basar (2026-09-21 varsayılan; hidrasyon
 * kuralı, 2026-09-05 #418 dersi: yola/depolamaya göre RENDER DALLANMASI
 * yapılmaz; tercih istemci efektinde okunur).
 *
 * FİRMA ARAMA YOK (2026-09-21, kullanıcı kararı: "herkese açık kısımda firma
 * arama özelliğini kaldıralım, firmaları görüntüleyemesin"): "Ürün | Firma" /
 * "Talep | Firma" kapsam pili ve hero'nun firma listesi anasayfadan kalktı;
 * ziyaretçi yalnız ürün ya da talep arar.
 */
export function HomeHero() {
  const { audience } = useAudience();
  const t = useTranslations("web.marketing.home");
  const supplier = audience === "supplier";

  return (
    /* HERO KAPSAYICISI — fotoğraf header'ın ALT ÇİZGİSİNDEN başlar (2026-09-09,
       kullanıcı kararı: "görsel ile header arasındaki boşluk olmasın").

       Üst boşluk = header yüksekliği (4 rem — `h-16` alt çizgiyi de İÇERİR,
       kutu modeli border-box) + bandın KENDİ negatif marjinin telafisi
       (`-mt-6`, `lg:-mt-8`). İkisi birbirini tam
       götürür: fotoğrafın üst kenarı header'ın alt çizgisine oturur, arada
       1 px beyaz şerit bile kalmaz. Band `-mt` değeri değişirse buradaki
       toplam da değişmeli.

       Fotoğraf header'ın ARKASINA girmez (kullanıcı onaylı): header beyaz ve
       net kalsın, logo/menü okunabilirliği fotoğrafın o bölgesindeki açıklığa
       bağlı olmasın. */
    <div className="relative pt-[calc(4rem+1.5rem)] lg:pt-[calc(4rem+2rem)]">
      {/* ANAHTAR FOTOĞRAFIN ÜSTÜNE OTURUR — akıştan çıkarıldı.

          Akışta bir blok olduğu sürece dikey yer kaplıyordu ve header ile
          fotoğraf arasında beyaz bir bant bırakıyordu (kullanıcı bulgusu).
          `absolute` + `z-20`: hiç yer kaplamaz, bandın üstünde çizilir —
          dünkü `relative z-10` düzeltmesinin yerini alır (band DOM'da sonra
          geldiği için yığın sırasında yine üste çıkardı).

          Konum header'ın hemen altı + küçük bir iç boşluk; fotoğrafın üst
          kenarına oturur, hero başlığının (band dikeyde ortalı, min-h 30rem)
          üstünde kalır.

          ÜST ETİKET (`eyebrow`) BU SAYFADA YOK — anahtar onun yuvasında
          oturuyor. İkisi de "başlığın üstündeki küçük ortalanmış öğe" ve
          ölçüldü: anahtar 76-120 px, etiket 104-121 px; üst üste
          biniyorlardı ve pil "KÜRESEL TEDARİK AĞINIZ" yazısını örtüyordu.
          Etiket süs, anahtar kontrol — yuva kontrolün. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(4rem+0.5rem)] z-20 flex justify-center px-4">
        {/* Hazne fotoğrafın üstünde duruyor: açık gökyüzünde `bg-zinc-100`
            kayboluyordu — yarı saydam beyaz + blur + gölge ile ayrışır.
            Seçili yuva yine beyaz + portal rengi (panel piliyle aynı jest). */}
        <AudienceSwitch className="pointer-events-auto bg-white/70 shadow-md shadow-zinc-950/5 ring-zinc-950/10 backdrop-blur" />
      </div>

      <Suspense fallback={<HeroShell />}>
      {supplier ? (
        <PanelHeroSearch
          key="supplier"
          title={t("supplierTitle")}
          plainTitle
          lead={t("supplierLead")}
          placeholder={t("supplierPlaceholder")}
          action={MARKETPLACE_ROUTES.demands}
          /* İKİ YÜZ BİREBİR HİZALI (2026-09-18, kullanıcı: "geçişte yazılar
             yer değiştirmesin, sadece panel değişsin"): alıcı yüzüyle aynı
             yapı — başlık · iki satır alt cümle · arama · not. */
          accent="emerald"
          backdrop
          widgets={SELLER_WIDGETS}
          objects={SELLER_OBJECTS}
          ctaNote={{
            text: t("supplierCtaText"),
            label: t("supplierCtaLabel"),
            href: signupHref("teklif"),
          }}
        />
      ) : (
        <PanelHeroSearch
          key="buyer"
          title={t("buyerTitle")}
          plainTitle
          lead={t("buyerLead")}
          placeholder={t("buyerPlaceholder")}
          action={MARKETPLACE_ROUTES.products}
          accent="blue"
          backdrop
          widgets={BUYER_WIDGETS}
          objects={BUYER_OBJECTS}
          ctaNote={{
            text: t("buyerCtaText"),
            label: t("buyerCtaLabel"),
            href: signupHref("talep"),
          }}
        />
      )}
      </Suspense>
    </div>
  );
}

/* Bandın sınıfları ve arka plan maskesi `PanelHeroSearch` ile AYNI olmak
   ZORUNDA — kabuk hidrasyondan önce onun yerinde duruyor, ayrışırsa sayfa
   gözle görülür biçimde zıplar. Panel dosyası değiştirilemediği (kullanıcı
   sınırı) ve sınıflar prop olarak dışa verilmediği için burada tekrarlanıyor;
   hero'nun bandı elden geçerse burası da elden geçmeli. */
const BAND =
  "relative isolate -mt-6 flex min-h-[30rem] 2xl:min-h-[34rem] w-[100cqw] max-w-none flex-col justify-center " +
  "ml-[calc(50%-50cqw)] overflow-hidden bg-white bg-gradient-to-b from-emerald-50/80 via-white to-white " +
  "px-4 py-10 sm:px-6 lg:-mt-8 lg:px-8 xl:px-10";

/**
 * Hidrasyondan önceki sessiz hero: beyaz bant, BAŞLIK ve alt cümle (fotoğraf
 * 2026-09-17'de kalktı). Arama
 * çubuğu YOK — o etkileşimli parça sınırın içinde kalıyor. Üst etiket de
 * YOK: hero'nun kendisi de basmıyor (yuva anahtarın), ikisi ayrışırsa
 * hidrasyonda başlık zıplar.
 *
 * Sunucu her zaman TEDARİKÇİ yüzünü basar (2026-09-21), dolayısıyla kabuk da
 * tedarikçi metnini taşır (alıcı yüzü ancak istemci tercihi okunduktan sonra
 * çizilir). Metinler yukarıdaki `PanelHeroSearch key="supplier"` ile AYNI olmalı.
 */
function HeroShell() {
  const t = useTranslations("web.marketing.home");
  return (
    <section aria-label={t("supplierTitle")} className={BAND}>
      {/* Dekor kabukta da var — hidrasyonda kartlar belirmesin (2026-09-18). */}
      <HeroDecor widgets={SELLER_WIDGETS} objects={SELLER_OBJECTS} accent="emerald" />
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-zinc-950 sm:text-5xl">
          {t("supplierTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">{t("supplierLead")}</p>
      </div>
    </section>
  );
}
