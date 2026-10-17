import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { Link } from "@/i18n/navigation";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { OPERATOR } from "@/lib/company-info";
import { breadcrumbNode, graph } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/meta";

/**
 * HESAP SİLME — girişsiz okunan açıklama sayfası (2026-10-16, kullanıcı kararı).
 *
 * Google Play "hesap silme adresi" bu sayfadır: girişsiz açılmalı, uygulama ve
 * geliştirici adını anmalı, silme yolunu öne çıkarmalı, uygulamayı yeniden
 * yüklemeden talep yolu (e-posta) vermeli, saklanan veriyi ve ek adımları
 * (Kurucu devri, süren iş) açıkça söylemeli. Apple 5.1.1(v) de neyin saklandığını
 * ve silmenin ne kadar sürdüğünü söylemeyi ister. Aynı adres App Store Connect
 * "User Privacy Choices URL" olarak da girilir (`docs/store-listing.md`).
 *
 * Sözleşme DEĞİL → üç dilde çevrilir (`web.marketing.accountDeletion`).
 * İçerik `AccountDeletionService` davranışının özetidir; kural değişirse bu
 * sayfa, Gizlilik Politikası m.6, KVKK m.7/m.9, Kullanıcı Sözleşmesi m.8 ve
 * Saklama ve İmha Politikası (tablonun 1–2. satırları) birlikte güncellenir. Saklama
 * süreleri (kept2/kept3/kept5) Kişisel Veri Saklama ve İmha Politikası'nın
 * tablosundan gelir (`/sozlesmeler/saklama-imha`); süre orada değişirse burada da. Arayüz
 * etiketleri (Ayarlar › Hesap Bilgileri, düğme adları) panel ve silme formu
 * kataloğuyla aynı tutulur — `__tests__/page.test.tsx` üç dilde karşılaştırır.
 * Kurulumu bitmemiş ya da sözleşme onayı bekleyen hesap Ayarlar'a giremez; o
 * ekranlardaki "Hesabımı sil" düğmesi adımların altında anılır.
 *
 * Görünüm: herkese açık birincil düğme mavi (`bg-blue-600 hover:bg-blue-700`),
 * gri kutu en az zinc-100 ve içindeki metin en az zinc-600 (CLAUDE.md
 * Konvansiyonlar).
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.accountDeletion" });
  return buildMetadata({
    locale,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/hesap-silme",
  });
}

const LINK = "underline hover:text-zinc-900";
const H2 = "text-base font-semibold text-zinc-950";
const STEPS = ["step1", "step2", "step3", "step4"] as const;
const DELETED = ["deleted1", "deleted2", "deleted3", "deleted4", "deleted5"] as const;
/** kept6: firma kaydındaki bilgiler (yetkili kimlik no / belgesi, adres) firmayla kalır — Gizlilik m.6 ve KVKK m.7 ile aynı. */
const KEPT = ["kept1", "kept2", "kept3", "kept4", "kept5", "kept6"] as const;
/**
 * Özel durumlar; son madde DESTEK YOLU (Google Play: silmeden önce ek adım
 * varsa açıkça yazılmalı ve kişinin başlatabileceği bir destek yolu olmalı).
 * İsteğe bağlı yardım olarak yazılır, zorunlu adım değil (Apple).
 */
const SPECIAL = ["special1", "special2", "special3", "special4", "specialUnverified", "specialHelp"] as const;

export default async function Page({ params }: { params: LocaleParams }) {
  const locale = await localeFromParams(params);
  setRequestLocale(locale);
  const t = await getTranslations("web.marketing.accountDeletion");
  const tm = await getTranslations("web.marketing");
  const b = (chunks: ReactNode) => <strong className="font-semibold text-zinc-950">{chunks}</strong>;
  const link = (href: string) =>
    function LinkChunk(chunks: ReactNode) {
      return (
        <Link href={href} className={LINK}>
          {chunks}
        </Link>
      );
    };
  const mail = (chunks: ReactNode) => (
    <a href={`mailto:${OPERATOR.kvkkEmail}`} className={LINK}>
      {chunks}
    </a>
  );
  return (
    <PublicLayout>
      <JsonLd
        data={graph([
          breadcrumbNode(
            [
              { name: tm("breadcrumbHome"), path: "/" },
              { name: t("title"), path: "/hesap-silme" },
            ],
            locale,
          ),
        ])}
      />
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
        <p className="mt-3 text-base/7 text-zinc-700">{t.rich("intro", { b, legalName: OPERATOR.legalName })}</p>

        {/* Silme yolu sayfanın ilk bloğu ve çerçeveli (Play: "prominently featured"). */}
        <section
          id="adimlar"
          aria-labelledby="adimlar-baslik"
          className="mt-8 scroll-mt-28 rounded-2xl border border-zinc-200 bg-zinc-100 p-5 sm:p-6"
        >
          <h2 id="adimlar-baslik" className={H2}>
            {t("stepsTitle")}
          </h2>
          <p className="mt-2 text-sm/6 text-zinc-700">{t("stepsIntro")}</p>
          <ol className="mt-4 space-y-3 text-sm/6 text-zinc-800">
            {STEPS.map((key, i) => (
              <li key={key} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white"
                >
                  {i + 1}
                </span>
                <span>{t.rich(key, { b })}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm/6 text-zinc-700">{t.rich("stepsSetupNote", { b })}</p>
          <p className="mt-3 text-sm/6 text-zinc-700">{t("stepsResult")}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {/* Panel sayfası: oturum yoksa nöbetçi girişe (`?next=`) götürür. Ön
                yükleme kapalı — statik sayfa panel rotasını boşuna istemesin. */}
            <Link
              href="/company/ayarlar/hesap-bilgileri"
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t("openSettings")}
            </Link>
            <span className="text-xs/5 text-zinc-600">{t("openSettingsHint")}</span>
          </div>
          <p className="mt-3 text-sm/6 text-zinc-600">
            {t.rich("forgotPassword", { link: link("/company/sifremi-unuttum") })}
          </p>
        </section>

        <div className="mt-10 space-y-8 text-sm/6 text-zinc-700">
          <section id="giris-yapamiyorsaniz" className="scroll-mt-28">
            <h2 className={H2}>{t("noLoginTitle")}</h2>
            <p className="mt-2">{t.rich("noLoginBody", { email: OPERATOR.kvkkEmail, mail })}</p>
          </section>

          <section id="silinenler" className="scroll-mt-28">
            <h2 className={H2}>{t("deletedTitle")}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {DELETED.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </section>

          <section id="saklananlar" className="scroll-mt-28">
            <h2 className={H2}>{t("keptTitle")}</h2>
            <p className="mt-2">{t("keptIntro")}</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {KEPT.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <p className="mt-3">
              {t.rich("keptOutro", { policy: link("/sozlesmeler/saklama-imha"), kvkk: link("/sozlesmeler/kvkk") })}
            </p>
          </section>

          <section id="ozel-durumlar" className="scroll-mt-28">
            <h2 className={H2}>{t("specialTitle")}</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {SPECIAL.map((key) => (
                <li key={key}>{t.rich(key, { b, mail, email: OPERATOR.kvkkEmail })}</li>
              ))}
            </ul>
          </section>

          <section id="kismi-silme" className="scroll-mt-28">
            <h2 className={H2}>{t("partialTitle")}</h2>
            <p className="mt-2">{t.rich("partialBody", { email: OPERATOR.kvkkEmail, mail })}</p>
          </section>
        </div>

        <p className="mt-10 border-t border-zinc-200 pt-6 text-sm/6 text-zinc-600">
          {t.rich("footer", {
            privacy: link("/sozlesmeler/gizlilik"),
            kvkk: link("/sozlesmeler/kvkk"),
            contact: link("/iletisim"),
          })}
        </p>
      </div>
    </PublicLayout>
  );
}
