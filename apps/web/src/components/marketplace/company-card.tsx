import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import type { PublicDirectoryCard } from "@/lib/public/marketplace-api";
import { MapPinIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";

/**
 * FİRMA DİZİNİ KARTI — herkese açık (görünürlük v2; kart sistemi PROMPT 5).
 *
 * Anatomi: logo/monogram · ad · Doğrulanmış · Gold Üye · sektör + şehir ·
 * Hakkında (2 satır) · faaliyet tipi rozetleri (en çok 3, kalanı "+N") ·
 * sertifikalar · 3 ürün küçük resmi · "N ürün · Kuruluş YYYY · X çalışan" ·
 * "Profili gör". Rothern ID ve iletişim üyeye — kartta YOK.
 *
 * `gold`/`about`/`foundedYear`/`employeeCount`/`certifications` alanları
 * OPSİYONEL okunur: kenar önbelleğindeki eski dizin yanıtı onları taşımıyorsa
 * satır çizilmez, kart çökmez (PROMPT 4'te facet dizilerinde öğrenilen ders).
 */
export function CompanyCard({
  company: c,
  href,
  badge,
}: {
  company: PublicDirectoryCard;
  /** Panel: `/company/firma/<id>`; public: `/firma/<slug>` (varsayılan). */
  href?: string;
  /** Panel: bağlantı durumu rozeti. */
  badge?: React.ReactNode;
}) {
  const activities = c.activities.slice(0, 3);
  const more = c.activities.length - activities.length;
  const certs = (c.certifications ?? []).slice(0, 2);
  const facts = [
    c.productCount > 0 ? `${c.productCount.toLocaleString("tr-TR")} ürün` : null,
    c.foundedYear ? `Kuruluş ${c.foundedYear}` : null,
    c.employeeCount ? `${c.employeeCount} çalışan` : null,
  ].filter(Boolean) as string[];

  return (
    <article className="group relative flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10 focus-within:ring-2 focus-within:ring-zinc-950 motion-reduce:transform-none">
      <div className="flex items-start gap-3">
        <Avatar name={c.name} src={c.logoUrl} size={48} />
        <div className="min-w-0">
          {/* Ad + rozetler AYNI satırda: ad taşarsa ad kısalır, rozet alt
              satıra düşmez (B7). Bağlantı karta yayılır. */}
          <h3 className="flex min-w-0 items-center gap-1.5 text-base font-semibold whitespace-nowrap text-zinc-950">
            <Link
              href={href ?? `/firma/${c.slug}`}
              className="min-w-0 truncate after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none"
            >
              {c.name}
            </Link>
            {c.verified ? (
              <Badge tone="verified" size="sm" className="px-1">
                <span className="sr-only">Doğrulanmış firma</span>
              </Badge>
            ) : null}
            {c.gold ? (
              <Badge tone="gold" size="sm" className="px-1">
                <span className="sr-only">Gold Üye</span>
              </Badge>
            ) : null}
          </h3>
          {badge ? <div className="mt-1">{badge}</div> : null}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            {c.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                {c.city}
              </span>
            ) : null}
            {c.mainCategory ? <span className="line-clamp-1">{c.mainCategory.name}</span> : null}
          </p>
        </div>
      </div>

      {c.about ? <p className="mt-3 line-clamp-2 text-xs/5 text-zinc-500">{c.about}</p> : null}

      {activities.length > 0 || certs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activities.map((a) => (
            <Badge key={a} tone="neutral" size="sm">
              {companyActivityLabel(a)}
            </Badge>
          ))}
          {more > 0 ? (
            <Badge tone="neutral" size="sm" className="tnum">
              +{more}
            </Badge>
          ) : null}
          {certs.map((s) => (
            <Badge key={s} tone="neutral" size="sm" className="bg-white ring-1 ring-inset ring-zinc-950/10">
              {s}
            </Badge>
          ))}
        </div>
      ) : null}

      {c.productPreview.length > 0 ? (
        <div className="mt-4 flex items-center gap-2">
          {c.productPreview.map((p) => (
            <Thumb key={p.slug} src={p.image ?? undefined} alt="" size="md" />
          ))}
          {c.productCount > c.productPreview.length ? (
            <span className="tnum text-xs font-medium text-zinc-500">
              +{c.productCount - c.productPreview.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Olgu satırı KENDİ satırında: "N ürün · Kuruluş 2008 · 50-100 çalışan"
          üç sütunlu ızgarada CTA ile aynı satıra sığmıyor ve çalışan sayısı
          kırpılıyordu — kırpılmış veri, gösterilmeyen veriden kötüdür. */}
      <div className="mt-auto pt-4">
        {facts.length > 0 ? <p className="tnum truncate text-xs text-zinc-500">{facts.join(" · ")}</p> : null}
        <p className="mt-1 text-sm font-semibold text-zinc-900 group-hover:text-zinc-600">Profili gör →</p>
      </div>
    </article>
  );
}
