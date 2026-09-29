import { cn } from "@/lib/utils";

/**
 * NUMARALI BÖLÜM — ürün formu ve hızlı talep aynı kalıbı kullanır: solda
 * numara rozeti, başlık + tek satır açıklama, altında beyaz kart. Sağ üstte
 * isteğe bağlı durum (ör. "3 kalem", "✓").
 */
export function NumberedSection({
  id,
  n,
  title,
  lead,
  status,
  accent = "zinc",
  children,
  className,
}: {
  id?: string;
  n: number;
  title: string;
  lead?: string;
  status?: React.ReactNode;
  accent?: "zinc" | "blue";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-baslik` : undefined} className={cn("scroll-mt-28", className)}>
      {/* Dar ekranda durum rozeti başlığın altına iner (uzun özet 375 px'te
          sayfayı 502 px'e genişletiyordu — yayın denetimi 2026-09-28 Bölüm 12). */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
              accent === "blue" ? "bg-blue-600" : "bg-zinc-950",
            )}
          >
            {n}
          </span>
          <div>
            <h3 id={id ? `${id}-baslik` : undefined} className="text-base font-semibold text-zinc-950">
              {title}
            </h3>
            {lead ? <p className="mt-0.5 text-xs/5 text-zinc-500">{lead}</p> : null}
          </div>
        </div>
        {status ? <div className="min-w-0 max-w-full text-xs text-zinc-500">{status}</div> : null}
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">{children}</div>
    </section>
  );
}
