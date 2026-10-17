import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { formatDate } from "@/lib/format-date";
import { localizePath } from "@/i18n/href";
import { Link } from "@/i18n/navigation";
import { SITE_ID, breadcrumbNode, graph } from "@/lib/seo/jsonld";
import { absoluteUrl } from "@/lib/seo/meta";
import type { ReactNode } from "react";

/**
 * Sözleşme metnindeki tablo (Saklama ve İmha Politikası: Silme Yönetmeliği
 * m.6/1-g "saklama ve imha sürelerini gösteren tablo"). Her satır sütun
 * sayısı kadar hücre taşır; hücre düz metindir (e-posta adresi tıklanır).
 */
export interface LegalTable {
  columns: string[];
  rows: string[][];
  /** Ekran okuyucuya tablonun adı (görünmez). */
  caption?: string;
}

export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  /** Madde işaretli liste — paragraphs'tan sonra render edilir. */
  list?: string[];
  /** Tablo — listeden sonra, bağlantılardan önce. */
  table?: LegalTable;
  /**
   * Site içi bağlantılar (İÇ yol, dil ön ekini `Link` ekler) — listeden sonra.
   * Metindeki adres düz yazıdır ve tıklanmaz; okuyucunun gitmesi gereken sayfa
   * (ör. hesap silme adımları) buradan verilir.
   */
  links?: { href: string; label: string }[];
}

/**
 * Sözleşme/aydınlatma metni iskeleti. İçerik sayfa bazında `sections` ile
 * verilir; başlık + paragraf + madde listesi destekler.
 *
 * SÖZLEŞME METİNLERİ YALNIZ TÜRKÇE (i18n Faz 1, docs/plan-i18n.md): hukuki
 * metin çevrilmez; İngilizce/Rusça sayfada üstte "Türkçe metin esastır" notu
 * çıkar, gövde ve `inLanguage` Türkçe kalır. Yalnız kabuk (güncelleme
 * tarihi, kırıntı) çevrilir.
 *
 * SİTE KABUĞU İÇİNDE (arayüz testi O-119): eskiden üst çubuk/altbilgi yoktu ve
 * tek çıkış "Kayıt ekranına dön"dü — altbilgiden gelen ziyaretçi çıkmaz
 * sokakta kalıyor, kayıt formundan yeni sekmede açılınca ikinci bir kayıt
 * sekmesi doğuyordu. Artık `PublicLayout` (logo, menü, altbilgi) sarar; kayda
 * özel geri bağlantısı KALKTI. Numaralı başlıklar `#madde-N` çapası taşır,
 * metindeki e-posta adresleri tıklanabilir; site içi sayfa bağlantısı bölümün
 * `links` alanıyla verilir (gövde düz metin kalır).
 */
const EMAIL_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

/** Düz metindeki e-posta adreslerini `mailto:` bağlantısına çevirir. */
function withMailto(text: string): ReactNode {
  const parts = text.split(EMAIL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={`mailto:${part}`} className="text-blue-700 underline hover:text-blue-800">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** "3. Aktivasyon Sonrası" → `madde-3`; numarasız başlık → `bolum-<sıra>`. */
function sectionId(heading: string, index: number): string {
  const n = heading.match(/^\s*(\d+)[.)]/)?.[1];
  return n ? `madde-${n}` : `bolum-${index + 1}`;
}

/**
 * Tablo: geniş ekranda gerçek tablo; telefonda (sm altı) her satır, sütun
 * adları hücrenin üstünde yazılı bir kart olur — dört sütunlu saklama tablosu
 * 360 px'te yatay kaydırma isterdi. Sütun adı hücrenin `data-label`ından
 * `::before` ile basılır (metin DOM'da bir kez; başlık satırı telefonda gizli).
 * İlk sütun satırın adıdır (kalın).
 */
function LegalTableView({ table }: { table: LegalTable }) {
  return (
    <table className="w-full border-collapse text-left max-sm:block">
      {table.caption ? <caption className="sr-only">{table.caption}</caption> : null}
      <thead className="max-sm:hidden">
        <tr className="border-b border-zinc-300">
          {table.columns.map((c) => (
            <th key={c} scope="col" className="py-2 pr-4 align-bottom text-xs font-semibold text-zinc-900 last:pr-0">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-sm:block max-sm:space-y-3">
        {table.rows.map((row, i) => (
          <tr
            key={i}
            className="border-b border-zinc-200 align-top max-sm:block max-sm:rounded-lg max-sm:border max-sm:px-3 max-sm:py-2"
          >
            {row.map((cell, j) => (
              <td
                key={j}
                data-label={table.columns[j]}
                className={`py-2 pr-4 last:pr-0 max-sm:block max-sm:py-1 max-sm:pr-0 max-sm:before:block max-sm:before:text-xs max-sm:before:font-semibold max-sm:before:text-zinc-900 max-sm:before:content-[attr(data-label)] ${
                  j === 0 ? "font-medium text-zinc-900" : ""
                }`}
              >
                {withMailto(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
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
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        {path ? (
          <JsonLd
            data={graph([
              // Sayfa düğümü BU sayfanın adresi (dilin ön ekiyle; eskiden EN/RU
              // sayfada Türkçe adres yazıyordu). Gövde Türkçe → `inLanguage`
              // tr-TR; kanonik ise Türkçe sürüm (`LEGAL_DOC_LOCALES`, metada).
              {
                "@type": "WebPage",
                "@id": absoluteUrl(localizePath(path, locale as Locale)),
                url: absoluteUrl(localizePath(path, locale as Locale)),
                name: title,
                inLanguage: "tr-TR",
                isPartOf: { "@id": SITE_ID() },
              },
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
        {locale !== DEFAULT_LOCALE ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" lang={locale}>
            {t("notice")}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold text-zinc-900" lang="tr">{title}</h1>
        <p className="mt-1 text-xs text-zinc-400">{t("lastUpdated", { date: formatDate(updatedAt, "long", locale) })}</p>
        <div className="mt-6 space-y-6 text-sm leading-relaxed text-zinc-700" lang="tr">
          {sections.map((s, i) => (
            <section key={i} id={s.heading ? sectionId(s.heading, i) : undefined} className="scroll-mt-24">
              {s.heading ? (
                <h2 className="mb-2 text-base font-semibold text-zinc-900">
                  {s.heading}
                </h2>
              ) : null}
              <div className="space-y-3">
                {(s.paragraphs ?? []).map((p, j) => (
                  <p key={j}>{withMailto(p)}</p>
                ))}
                {s.list ? (
                  <ul className="list-disc space-y-1.5 pl-5">
                    {s.list.map((li, j) => (
                      <li key={j}>{withMailto(li)}</li>
                    ))}
                  </ul>
                ) : null}
                {s.table ? <LegalTableView table={s.table} /> : null}
                {s.links?.length ? (
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    {s.links.map((l) => (
                      <Link key={l.href} href={l.href} className="font-medium text-blue-700 underline hover:text-blue-800">
                        {l.label}
                      </Link>
                    ))}
                  </p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}
