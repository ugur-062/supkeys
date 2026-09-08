"use client";

import { AudienceSwitch, useAudience } from "./audience-switch";
import { PanelHeroSearch } from "@/components/dashboard/panel-hero-search";
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
 * Sunucu HER ZAMAN alıcı yüzünü basar (hidrasyon kuralı, 2026-09-05 #418
 * dersi: yola/depolamaya göre RENDER DALLANMASI yapılmaz; tercih istemci
 * efektinde okunur).
 */
export function HomeHero() {
  const { audience } = useAudience();
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
  "relative isolate -mt-6 flex min-h-[30rem] w-[100cqw] max-w-none flex-col justify-center " +
  "ml-[calc(50%-50cqw)] overflow-hidden bg-gradient-to-b from-transparent via-transparent to-white " +
  "px-4 py-10 sm:px-6 lg:-mt-8 lg:px-8 xl:px-10";

const MASK =
  "linear-gradient(to bottom, black 0%, black 70%, transparent 100%), " +
  "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)";

/**
 * Hidrasyondan önceki sessiz hero: arka plan, BAŞLIK ve alt cümle. Arama
 * çubuğu YOK — o etkileşimli parça sınırın içinde kalıyor. Üst etiket de
 * YOK: hero'nun kendisi de basmıyor (yuva anahtarın), ikisi ayrışırsa
 * hidrasyonda başlık zıplar.
 *
 * Sunucu her zaman ALICI yüzünü basar, dolayısıyla kabuk da alıcı metnini
 * taşır (tedarikçi yüzü ancak istemci tercihi okunduktan sonra çizilir).
 */
function HeroShell() {
  return (
    <section aria-label="Hangi ürün için tedarikçi arıyorsunuz?" className={BAND}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero/hero-scene.webp"
          alt=""
          loading="eager"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover object-bottom"
          style={{
            maskImage: MASK,
            WebkitMaskImage: MASK,
            filter: "contrast(1.12) saturate(1.12) brightness(1.01)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        />
      </div>
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-zinc-950 sm:text-5xl">
          Hangi <span className="text-blue-600">ürün için</span>
          <span className="block text-blue-600">tedarikçi arıyorsunuz?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">
          Doğrulanmış tedarikçilerin vitrinlerini fiyat ve minimum sipariş bilgisiyle inceleyin.
        </p>
      </div>
    </section>
  );
}
