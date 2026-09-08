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

      {/* SUSPENSE ŞART (2026-09-08, canlı derleme hatası): `PanelHeroSearch`
          `useSearchParams()` çağırıyor ve bu sayfa STATİK üretiliyor
          (`revalidate = 60`). Sınır olmadan Next prerender'ı iptal ediyor ve
          BUILD DÜŞÜYOR — `next dev` bunu hiç göstermiyor, yalnız `next build`
          yakalıyor.

          Yedek BOŞ KUTU DEĞİL (ölçüldü: boş yedekle üretilen HTML'de `<h1>`
          HİÇ yoktu — sınır içindeki her şey istemciye ertelenir). Anasayfanın
          başlığının statik HTML'de olmaması gerçek bir SEO kaybıydı; bu
          yüzden yedek, bandın görünümünü ve BAŞLIĞINI taşıyan sessiz bir
          kabuk. Hidrasyonda yerine etkileşimli hero geçer; değişen tek şey
          arama çubuğunun belirmesi. */}
      <Suspense fallback={<HeroShell />}>
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
      </Suspense>
    </>
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
 * Hidrasyondan önceki sessiz hero: arka plan, üst etiket, BAŞLIK ve alt
 * cümle. Arama çubuğu YOK — o etkileşimli parça sınırın içinde kalıyor.
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
        <p className="flex items-center justify-center gap-3 text-[11px] font-semibold tracking-[0.2em] uppercase text-blue-700">
          <span aria-hidden className="h-px w-8 bg-current opacity-40" />
          Küresel tedarik ağınız
          <span aria-hidden className="h-px w-8 bg-current opacity-40" />
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance text-zinc-950 sm:text-5xl">
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
