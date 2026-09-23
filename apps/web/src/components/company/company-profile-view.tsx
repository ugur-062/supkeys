import { cn } from "@/lib/utils";
import { AutoTranslatedNote } from "@/components/marketplace/auto-translated-note";
import { cityDisplayName, countryDisplayName, useActivityLabel } from "@/i18n/domain";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MapPinIcon, StarIcon } from "@heroicons/react/20/solid";
import { countryFlag, type ReviewSummary } from "@rothern/shared";

import { safeExternalUrl } from "@/lib/safe-url";
import { CompanyLogo } from "@/components/company/company-logo";
import { SafeCoverImage } from "@/components/company/safe-cover-image";
import { ActivityIcon } from "@/components/marketplace/activity-icons";

/**
 * Dış bağlantı — YALNIZ http/https render eder (`javascript:` vb. düşürülür).
 * Bu view PUBLIC (/firma/[slug]) olduğundan kullanıcı-kontrollü URL'ler ham
 * href olarak basılamaz (stored XSS). safeExternalUrl null dönerse hiç render yok.
 */
function ExternalLink({
  href,
  label,
}: {
  href: string | null | undefined;
  label: string;
}) {
  const safe = safeExternalUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer nofollow"
      className="font-medium text-zinc-600 hover:text-zinc-900"
    >
      {label}
    </a>
  );
}

export interface ProfileViewData {
  name: string;
  /** Faz T: "Gold Üye" rozeti — yalnız GOLD kademe (güven iddiası taşımaz). */
  goldMember?: boolean;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti (Firma Bilgileri / Doğrulama Belgeleri'nden). */
  verified?: boolean;
  rothernId?: string | null;
  industry: string | null;
  /**
   * Faaliyet tipi kodları (üretici/bayi/hizmet/dış ticaret/fason). Alıcı için
   * çoğu zaman sektörden daha ayırt edici — bu yüzden ünvanın hemen altında,
   * rozet olarak gösterilir.
   */
  activities?: string[];
  /** Firma kategori beyanı (L1 ad) — herkese açık profilde çip olarak. */
  categories?: { id: string; name: string }[];
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  aboutText: string | null;
  /** Metin sayfa diline otomatik çevrildiyse kaynağın dili (i18n Faz 1e). */
  translatedFrom?: string | null;
  /**
   * Aşağıdakiler OPSİYONEL: herkese açık sayfa (anonim katman) bu alanları
   * HİÇ vermez — `null` bile yazılsa RSC yüküne anahtar adı düşer ve "gizli
   * alan HTML'de yok" sözleşmesi grep'te kırılır (2026-09-04).
   */
  services?: string[];
  certifications?: string[];
  certificateImages?: string[];
  foundedYear?: number | null;
  employeeCount?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  rating?: { avg: number; count: number } | null;
  /** Herkese açık profil (v2): yalnız ortalama, sayı ve dağılım üyeye. */
  ratingAvg?: number | null;
  /**
   * 2026-08-22 — firma bazında gruplu değerlendirme özeti (api → shared
   * ReviewSummary). Ad yalnız opt-in + platform içi; herkese açıkta null.
   */
  reviewSummary?: ReviewSummary | null;
  /** Kamuya açık ticari sicil bilgileri (tüzel kişi verisi). */
  trade?: {
    legalName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    mersisNo: string | null;
    tradeRegistryNo: string | null;
    kepAddress: string | null;
  } | null;
}

function TradeRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-zinc-900 ${
          mono ? "tabular-nums tracking-wide" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * YERİNDE DÜZENLEME slotları (2026-08-22, Profilim editörü): verilirse ilgili
 * bölge salt-okunur içerik yerine slot'u render eder ve boş olsa da GÖRÜNÜR
 * (kullanıcı "+ Hakkında ekle" gibi yer tutucu görür). Verilmezse bileşen
 * herkese açık sayfadaki gibi salt-okunur davranır — public görünüm ve editör
 * AYNI düzeni paylaşır (tek kaynak), içerik farkı yalnız slot'ta.
 */
export interface ProfileEditSlots {
  /** Kapak alanının üstüne binen kontroller (absolute konumlandırılır). */
  cover?: ReactNode;
  /** Logo kutusunun üstüne binen kontroller. */
  logo?: ReactNode;
  /** Ad altındaki "sektör · konum" satırının yerine. */
  headline?: ReactNode;
  /** Künye şeridi (kuruluş/çalışan/web/sosyal) yerine. */
  stats?: ReactNode;
  about?: ReactNode;
  services?: ReactNode;
  /**
   * Firma türü + faaliyet kategorileri düzenleyicisi (Profilim, 2026-09-03).
   * Herkese açık görünümde karşılığı hero'daki faaliyet rozetleri; kategori
   * beyanı eşleşme girdisidir, ziyaretçiye ayrı bir bölüm olarak basılmaz.
   */
  classification?: ReactNode;
  /** Sağ kolonun başı — Profilim'de "Ürünlerim (N)" önizleme kartı. */
  aside?: ReactNode;
}

/**
 * Firma profil görünümü — hem herkese açık SEO sayfası (/firma/[slug]) hem
 * bağlantı-içi sayfa (/company/firma/[id]) AYNI bileşeni kullanır. Tek fark:
 * `actions` (bağlan/engelle) ve `children` (ihaleler) slotları; Profilim
 * editörü ayrıca `edit` slotlarıyla bölgeleri düzenlenebilir kılar.
 */
/**
 * KAPILI ALAN slotları (görünürlük katmanı, 2026-09-04) — herkese açık
 * sayfa gizlenen alanın YERİNE `GatedField` basar. Panel/Profilim vermez.
 */
export interface ProfileGateSlots {
  /** Künye şeridinin sonuna (kuruluş/çalışan/iletişim yerine) satır içi. */
  stats?: ReactNode;
  /** Hakkında kesitinin altına ("devamı için giriş yapın"). */
  about?: ReactNode;
  /** Sağ sütunun sonuna — sayfadaki TEK büyük kayıt kutusu. */
  aside?: ReactNode;
}

export function CompanyProfileView({
  profile: p,
  actions,
  children,
  main,
  edit,
  gate,
  layout = "columns",
}: {
  profile: ProfileViewData;
  actions?: ReactNode;
  /** Hero ile ızgara ARASINA, tam genişlik (panel: ilanlar). */
  children?: ReactNode;
  /**
   * SOL sütunun sonuna (Hakkında'nın altına) — herkese açık sayfada ürün
   * portföyü. Sol geniş (Hakkında + Ürünler), sağ dar (özet kart); sütunlar
   * yapışkan değil, sol kısa kalırsa sağ doğal akar (2026-09-04).
   */
  main?: ReactNode;
  edit?: ProfileEditSlots;
  gate?: ProfileGateSlots;
  /**
   * "hakkında" ızgarası: `columns` (herkese açık/panel: sol geniş + sağ künye)
   * ya da `stacked` (Profilim editörü, 2026-09-10: editör kendi sağ rayını
   * — durum, arama görünürlüğü, ürünler — dışarıda çizer; içeride ikinci
   * sütun açılsaydı 3 sütun sıkışırdı). İçerik ve sıra AYNI, yalnız akış.
   */
  layout?: "columns" | "stacked";
}) {
  const t = useTranslations("web.marketplace.profile");
  const activityLabel = useActivityLabel();
  const locale = useLocale();
  const services = p.services ?? [];
  const location = [p.city, p.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* ÜST KİMLİK KARTI — KISA (2026-09-07, kullanıcı: "şirket hakkında
          bilgiler üstte olsun ama çok uzun tutma, ürünler ilk bakışta
          görünsün"). Kaynak kalıp: Europages firma sayfası — kapak şeridi,
          logo, ad, ülke + konum, faaliyet tipi, tek CTA ve İKİ SATIRLIK
          tanıtım.

          Künye (kuruluş/çalışan/kategori/web/sosyal), hizmetler, sertifikalar,
          galeri ve değerlendirmeler ÜRÜNLERİN ALTINDAKİ "hakkında" bölümüne
          indi: üstte durduklarında ilk ekranı tümüyle yiyor ve ziyaretçi
          firmanın NE SATTIĞINI görmeden kaydırmak zorunda kalıyordu. */}
      <section className="overflow-hidden card">
        {/* Kapak: görsel varsa şerit, yoksa ince renk bandı. Yükseklik
            bilinçli olarak kısaldı — üst blok ürünleri ekrandan itmesin. */}
        <div
          className={cn(
            // Kapak yoksa MAVİ bant (2026-09-19, kullanıcı: "profil kapaklarında
            // siyah istemiyorum, mavi olsun").
            "relative w-full bg-gradient-to-br from-blue-700 to-blue-500",
            p.coverImageUrl ? "h-28 sm:h-36" : edit?.cover ? "h-24 sm:h-28" : "h-12",
          )}
        >
          {p.coverImageUrl ? (
            // P0: kırık R2 URL'inde çıplak kırık-görsel ikonu yerine koyu zemine
            // sessizce düş — onError işleyicisi İSTEMCİ bileşeninde (bu dosya
            // herkese açık sayfada sunucu bileşeni; RSC'de <img onError> 500 verir).
            <SafeCoverImage src={p.coverImageUrl} alt={`${p.name} kapak görseli`} logoSrc={p.logoUrl} />
          ) : null}
          {edit?.cover ?? null}
        </div>

        <div className="px-5 pb-5 sm:px-8">
          {/* YALNIZ LOGO KAPAĞIN ÜSTÜNE TAŞAR (2026-09-08, kullanıcı bulgusu:
              "yazı hep kapak fotoğrafının üstüne biniyor").

              Eskiden negatif üst boşluk SATIRIN TAMAMINDAydı ve satır
              `items-end` ile hizalanıyordu: ad + ülke/şehir + faaliyet
              satırından oluşan metin bloğu logodan uzun olduğu anda YUKARI
              doğru büyüyüp kapağın üstüne çıkıyordu. Uzun firma adı ya da
              iki faaliyet tipi olan her firmada oluyordu.

              Artık negatif boşluk YALNIZ logo kutusunda; metin bloğu kapağın
              ALTINDA başlar ve kaç satır olursa olsun oraya taşamaz. */}
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative -mt-12 shrink-0 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-zinc-950/5 sm:-mt-14">
                <CompanyLogo
                  src={p.logoUrl}
                  alt={`${p.name} logosu`}
                  className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
                  fallback={
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-blue-600 text-3xl font-bold text-white sm:h-24 sm:w-24">
                      {p.name.charAt(0).toLocaleUpperCase("tr-TR")}
                    </div>
                  }
                />
                {edit?.logo ?? null}
              </div>
              <div className="min-w-0 pt-3">
                {/* Rozetler h1'in KARDEŞİ (2026-09-22 yayın taraması): h1 metni
                    "Ege Tekstil…DoğrulanmışGold Üye" diye okunuyordu (arama motoru
                    ve ekran okuyucu için kirli başlık). */}
                <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">{p.name}</h1>
                  {p.verified ? (
                    <span
                      className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset"
                      title={t("verifiedTitle")}
                    >
                      {t("verified")}
                    </span>
                  ) : null}
                  {p.verified === false ? (
                    // Ücretsiz/paketsiz firmanın PROFİLİNDE açıkça yazar (2026-09-06,
                    // kullanıcı kararı). Kartlarda ve dizinde YALNIZ pozitif rozet —
                    // orada "herkes doğrulanmamış" mesajı pazar yerini zayıflatırdı.
                    <span
                      className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-300 ring-inset"
                      title={t("unverifiedTitle")}
                    >
                      {t("unverified")}
                    </span>
                  ) : null}
                  {p.goldMember ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      {t("goldMember")}
                    </span>
                  ) : null}
                </div>
                {edit?.headline ? (
                  <div className="mt-1">{edit.headline}</div>
                ) : (
                  <>
                    {/* Ülke BAYRAKLI (Europages): menşe ad okunmadan ayırt
                        edilir. KKTC (XN) ISO 3166-1'de olmadığı için orada
                        bayrak basılmaz — `countryFlag` null döner. */}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
                      {countryFlag(p.country) ? (
                        <span aria-hidden className="text-base leading-none">
                          {countryFlag(p.country)}
                        </span>
                      ) : null}
                      {p.country ? <span className="font-medium text-zinc-800">{countryDisplayName(p.country, locale)}</span> : null}
                      {p.city ? (
                        <span className="inline-flex items-center gap-1 text-zinc-500">
                          <MapPinIcon aria-hidden className="size-4 text-zinc-400" />
                          {cityDisplayName(p.city, locale)}
                        </span>
                      ) : null}
                      {p.industry ? <span className="text-zinc-500">· {p.industry}</span> : null}
                    </p>
                    {p.activities?.length ? (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-700">
                        {p.activities.map((code) => (
                          <span key={code} className="inline-flex items-center gap-1.5">
                            <ActivityIcon code={code} className="size-4 text-zinc-400" />
                            <span className="font-medium">{activityLabel(code)}</span>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2 pt-3">
                {actions}
              </div>
            ) : null}
          </div>

          {/* İKİ SATIRLIK tanıtım + "Daha fazlasını oku". Metin TEK yerde
              yaşar: bağlantı aşağıdaki tam "Hakkında" bölümüne çapa atar,
              aynı paragrafı iki kez basmayız. */}
          {p.aboutText ? (
            <div className="mt-4 max-w-4xl">
              <p className="line-clamp-2 text-[15px] leading-relaxed text-zinc-600">{p.aboutText}</p>
              <a
                href="#hakkinda"
                className="mt-1 inline-block text-sm font-semibold text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
              >
                {t("readMore")}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {/* Panel: ilanlar / ekstra — kimliğin hemen altında. */}
      {children}

      {/* ÜRÜNLER — TAM GENİŞLİK (kullanıcı kararı): eskiden 1.6fr'lik sol
          sütundaydı ve sağdaki künye/sertifika kartları ızgarayı daraltıyordu.
          Firma sayfasının işi "bu firma ne satıyor" sorusunu göstermek. */}
      {main}

      <div id="hakkinda" className={cn("grid scroll-mt-24 gap-6", layout === "columns" && "lg:grid-cols-[1.6fr_1fr]")}>
        <div className="space-y-6">
          {edit?.classification ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                Firma türü ve faaliyet alanları
              </h2>
              <div className="mt-3">{edit.classification}</div>
            </section>
          ) : null}
          {edit?.about ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("about")}</h2>
              <div className="mt-3">{edit.about}</div>
            </section>
          ) : p.aboutText ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("aboutName", { name: p.name })}</h2>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-600">
                {p.aboutText}
              </p>
              <AutoTranslatedNote from={p.translatedFrom} className="mt-2" />
              {gate?.about ? <div className="mt-3">{gate.about}</div> : null}
            </section>
          ) : null}

          {/* Hizmetler ve sertifikalar SAĞDAN BURAYA taşındı (kullanıcı:
              "sağ kısımda sertifikalar falan gibi kısımlar olmasın"). */}
          {edit?.services ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("services")}</h2>
              <div className="mt-3">{edit.services}</div>
            </section>
          ) : services.length > 0 ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("services")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {services.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* SERTİFİKALAR BÖLÜMÜ KALDIRILDI (2026-09-17, kullanıcı kararı). Veri
              kolonları (`certifications`, `certificateImages`) duruyor; profil
              ne gösterir ne düzenletir. */}

          {/* Ticari sicil bilgileri — kamuya açık tüzel kişi verileri; güven
              göstergesi (IBAN/TCKN gibi hassas veriler burada ASLA yer almaz). */}
          {p.trade &&
          (p.trade.legalName ||
            p.trade.taxNumber ||
            p.trade.mersisNo ||
            p.trade.tradeRegistryNo ||
            p.trade.kepAddress) ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">
                {t("tradeInfo")}
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.trade.legalName ? (
                  <TradeRow label={t("legalName")} value={p.trade.legalName} />
                ) : null}
                {p.trade.taxNumber ? (
                  <TradeRow
                    label={t("taxNo")}
                    value={
                      p.trade.taxOffice
                        ? `${p.trade.taxNumber} · ${p.trade.taxOffice}`
                        : p.trade.taxNumber
                    }
                    mono
                  />
                ) : null}
                {p.trade.mersisNo ? (
                  <TradeRow label={t("mersisNo")} value={p.trade.mersisNo} mono />
                ) : null}
                {p.trade.tradeRegistryNo ? (
                  <TradeRow
                    label={t("registryNo")}
                    value={p.trade.tradeRegistryNo}
                    mono
                  />
                ) : null}
                {p.trade.kepAddress ? (
                  <TradeRow label={t("kepAddress")} value={p.trade.kepAddress} mono />
                ) : null}
              </dl>
            </section>
          ) : null}

          {/* GALERİ KALDIRILDI (2026-09-10, kullanıcı kararı: "fotoğraf
              eklenmesin"). Gerçek fotoğraf yalnız ÜRÜNDE ve KATEGORİDE
              (CLAUDE.md); `photos` kolonu duruyor, hiçbir yerde çizilmez. */}

          {/* Değerlendirmeler — firma bazında gruplu özet (2026-08-22): genel
              puan = ortak ortalamalarının ortalaması; her ortak tek satır;
              ad yalnız opt-in + platform içi ("Doğrulanmış alıcı/tedarikçi"). */}
          {p.reviewSummary && p.reviewSummary.orders > 0 ? (
            <ReviewSummarySection s={p.reviewSummary} />
          ) : null}
        </div>

        <div className="space-y-6">
          {edit?.aside}
          {/* ŞİRKET BİLGİLERİ — kaynaktaki sağ kutunun karşılığı: künye ve
              iletişim. Sertifika/hizmet/galeri buraya KONMAZ (kullanıcı
              kararı); ürün ızgarası da bu sütunla hiç yarışmaz, çünkü
              ürünler yukarıda tam genişlikte. */}
          {edit?.stats ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("companyInfo")}</h2>
              <div className="mt-3">{edit.stats}</div>
            </section>
          ) : p.rothernId ||
            p.foundedYear ||
            p.employeeCount ||
            p.industry ||
            location ||
            p.categories?.length ||
            p.website ||
            p.linkedinUrl ||
            p.instagramUrl ||
            gate?.stats ||
            p.ratingAvg != null ||
            (p.rating && p.rating.count > 0) ? (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-zinc-900">{t("companyInfo")}</h2>
              <dl className="mt-4 space-y-3">
                {p.rothernId ? (
                  <InfoRow label="Rothern ID" value={<span className="tabular-nums slashed-zero">{p.rothernId}</span>} />
                ) : null}
                {p.foundedYear ? <InfoRow label={t("founded")} value={String(p.foundedYear)} /> : null}
                {p.employeeCount ? <InfoRow label={t("employees")} value={p.employeeCount} /> : null}
                {p.industry ? <InfoRow label={t("industry")} value={p.industry} /> : null}
                {location ? <InfoRow label={t("location")} value={location} /> : null}
                {p.rating && p.rating.count > 0 ? (
                  <InfoRow
                    label={t("rating")}
                    value={
                      <span className="inline-flex items-center gap-1">
                        <StarIcon className="size-4 text-rating" aria-hidden />
                        {p.rating.avg.toFixed(1)}
                        <span className="font-normal text-zinc-400">({p.rating.count})</span>
                      </span>
                    }
                  />
                ) : p.ratingAvg != null ? (
                  <InfoRow
                    label={t("rating")}
                    value={
                      <span className="inline-flex items-center gap-1">
                        <StarIcon className="size-4 text-rating" aria-hidden />
                        {p.ratingAvg.toFixed(1)}
                      </span>
                    }
                  />
                ) : null}
              </dl>

              {p.categories?.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-4">
                  {p.categories.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {gate?.stats ? (
                <div className="mt-4 border-t border-zinc-100 pt-4">{gate.stats}</div>
              ) : p.website || p.linkedinUrl || p.instagramUrl ? (
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-4 text-sm">
                  <ExternalLink href={p.website} label={t("website")} />
                  <ExternalLink href={p.linkedinUrl} label="LinkedIn" />
                  <ExternalLink href={p.instagramUrl} label="Instagram" />
                </div>
              ) : null}
            </section>
          ) : null}
          {gate?.aside ?? null}
        </div>
      </div>
    </div>
  );
}

/** Şirket Bilgileri satırı — etiket solda, değer sağda (kaynak kalıp). */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

type ReviewRole = "buyer" | "seller";
/** Değerlendiren tarafın rolü — katalogdan (i18n Faz 1 kapanış). */
function useRoleLabel(): (r: ReviewRole | null | undefined) => string {
  const t = useTranslations("web.marketplace.profile");
  return (r) => (r === "buyer" ? t("verifiedBuyer") : r === "seller" ? t("verifiedSupplier") : t("verifiedPartner"));
}

function Stars({ value, label }: { value: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className="shrink-0 text-sm text-amber-500" aria-label={label ?? `${value} / 5`}>
      {"★".repeat(Math.max(0, Math.min(5, full)))}
      <span className="text-zinc-200" aria-hidden="true">
        {"★".repeat(Math.max(0, 5 - full))}
      </span>
    </span>
  );
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("tr-TR", { month: "short", year: "numeric" })
    : "";
}

/**
 * Değerlendirme özeti bölümü — sunucu bileşeninde de çalışır (olay işleyici
 * yok; "diğer yorumlar" native <details>). Hem /firma/[slug] hem platform içi.
 */
function ReviewSummarySection({ s }: { s: ReviewSummary }) {
  const t = useTranslations("web.marketplace.profile");
  const roleLabel = useRoleLabel();
  const maxDist = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => s.distribution[k]));
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold text-zinc-900">{t("reviews")}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-semibold tabular-nums text-zinc-900">
              {s.avg.toFixed(1)}
            </span>
            <Stars value={s.avg} label={`Genel ${s.avg.toFixed(1)} / 5`} />
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {s.firms} firma · {s.orders} sipariş · her firma bir oy
          </div>
        </div>
        <dl className="min-w-[160px] flex-1 space-y-1">
          {([5, 4, 3, 2, 1] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs text-zinc-500">
              <dt className="w-3 tabular-nums">{k}</dt>
              <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${(s.distribution[k] / maxDist) * 100}%` }}
                />
              </dd>
              <dd className="w-5 text-right tabular-nums">{s.distribution[k]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="mt-4 space-y-3">
        {s.partners.map((pt, i) => {
          const [latest, ...rest] = pt.comments;
          return (
            <li key={`${pt.role ?? "x"}-${pt.lastAt}-${i}`} className="border-t border-zinc-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="truncate text-sm font-semibold text-zinc-900">
                    {pt.name ?? roleLabel(pt.role)}
                  </span>
                  {pt.name ? (
                    <span className="ml-2 text-xs text-zinc-500">{roleLabel(pt.role)}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Stars value={pt.avg} label={`${pt.avg} / 5`} />
                  <span className="tabular-nums">{pt.avg.toFixed(1)}</span>
                  <span>· {t("ordersCount", { n: pt.count })}</span>
                  <span>· {monthYear(pt.lastAt)}</span>
                </div>
              </div>
              {latest ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{latest.comment}</p>
              ) : null}
              {rest.length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">
                    Diğer {rest.length} yorum
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {rest.map((c, j) => (
                      <li key={j} className="text-sm text-zinc-600">
                        <span className="mr-2 text-xs text-zinc-500">{monthYear(c.createdAt)} · {c.rating}/5</span>
                        <span className="whitespace-pre-wrap">{c.comment}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

