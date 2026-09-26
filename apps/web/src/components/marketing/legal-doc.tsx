import { DEFAULT_LOCALE } from "@rothern/i18n";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { formatDate } from "@/lib/format-date";
import { breadcrumbNode, graph } from "@/lib/seo/jsonld";
import { absoluteUrl } from "@/lib/seo/meta";

export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  /** Madde işaretli liste — paragraphs'tan sonra render edilir. */
  list?: string[];
}

/**
 * Sözleşme/aydınlatma metni iskeleti. İçerik sayfa bazında `sections` ile
 * verilir; başlık + paragraf + madde listesi destekler.
 *
 * SÖZLEŞME METİNLERİ YALNIZ TÜRKÇE (i18n Faz 1, docs/plan-i18n.md): hukuki
 * metin çevrilmez; İngilizce/Rusça sayfada üstte "Türkçe metin esastır" notu
 * çıkar, gövde ve `inLanguage` Türkçe kalır. Yalnız kabuk (geri bağlantısı,
 * güncelleme tarihi, kırıntı) çevrilir.
 */
export async function LegalDoc({
  title,
  updatedAt,
  sections,
  path,
}: {
  title: string;
  /** ISO tarih (`2026-09-22`) — ekranda dile göre uzun biçimde yazılır. */
  updatedAt: string;
  sections: LegalSection[];
  /** Sayfa yolu — JSON-LD (WebPage + ekmek kırıntısı) için; SEO denetimi her
   *  herkese açık sayfada JSON-LD ister (2026-09-11). */
  path?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations("web.marketing.legal");
  const tm = await getTranslations("web.marketing");
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {path ? (
        <JsonLd
          data={graph([
            { "@type": "WebPage", "@id": absoluteUrl(path), url: absoluteUrl(path), name: title, inLanguage: "tr-TR" },
            breadcrumbNode(
              [
                { name: tm("breadcrumbHome"), path: "/" },
                { name: title, path },
              ],
              locale,
            ),
          ])}
        />
      ) : null}
      <Link
        href="/company/kayit"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        {t("backToSignup")}
      </Link>
      {locale !== DEFAULT_LOCALE ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" lang={locale}>
          {t("notice")}
        </p>
      ) : null}
      <h1 className="mt-4 text-2xl font-bold text-zinc-900" lang="tr">{title}</h1>
      <p className="mt-1 text-xs text-zinc-400">{t("lastUpdated", { date: formatDate(updatedAt, "long", locale) })}</p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-zinc-700" lang="tr">
        {sections.map((s, i) => (
          <section key={i}>
            {s.heading ? (
              <h2 className="mb-2 text-base font-semibold text-zinc-900">
                {s.heading}
              </h2>
            ) : null}
            <div className="space-y-3">
              {(s.paragraphs ?? []).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.list ? (
                <ul className="list-disc space-y-1.5 pl-5">
                  {s.list.map((li, j) => (
                    <li key={j}>{li}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
