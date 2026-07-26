import Link from "next/link";

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
}: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
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
