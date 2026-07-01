import Link from "next/link";

/**
 * Sözleşme/aydınlatma metni iskeleti — PLACEHOLDER içerik. Gerçek hukuki
 * metinler hazır olunca buradaki paragraflar değiştirilecek.
 */
export function LegalDoc({
  title,
  updatedAt = "—",
  paragraphs,
}: {
  title: string;
  updatedAt?: string;
  paragraphs: string[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/company/kayit" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Kayıt ekranına dön
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">{title}</h1>
      <p className="mt-1 text-xs text-zinc-400">
        Son güncelleme: {updatedAt} · Bu metin taslaktır (placeholder).
      </p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-700">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </main>
  );
}
