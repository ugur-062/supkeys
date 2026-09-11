import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
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
 */
export function LegalDoc({
  title,
  updatedAt,
  sections,
  path,
}: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
  /** Sayfa yolu — JSON-LD (WebPage + ekmek kırıntısı) için; SEO denetimi her
   *  herkese açık sayfada JSON-LD ister (2026-09-11). */
  path?: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {path ? (
        <JsonLd
          data={graph([
            { "@type": "WebPage", "@id": absoluteUrl(path), url: absoluteUrl(path), name: title, inLanguage: "tr-TR" },
            breadcrumbNode([
              { name: "Anasayfa", path: "/" },
              { name: title, path },
            ]),
          ])}
        />
      ) : null}
      <Link
        href="/company/kayit"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Kayıt ekranına dön
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">{title}</h1>
      <p className="mt-1 text-xs text-zinc-400">Son güncelleme: {updatedAt}</p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-zinc-700">
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
