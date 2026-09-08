import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import type { PublicDirectoryCard } from "@/lib/public/marketplace-api";
import { ChatBubbleLeftRightIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { ActivityIcon } from "./activity-icons";
import { currencySymbol } from "@/lib/tenders/labels";
import { companyActivityLabel, countryName } from "@rothern/shared";
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
 *
 * `variant="wide"` (2026-09-07, Europages spec §8.3) — FİRMA DİZİNİ satırı:
 * solda kimlik sütunu, sağda Hakkında + BÜYÜK ürün şeridi. Aynı veriyi
 * taşır; fark yoğunluk değil OKUNABİLİRLİK: üç sütunlu ızgarada Hakkında iki
 * satıra, ürün küçük resimleri 40 px'e sıkışıyor ve "bu firma ne satıyor"
 * sorusu kartın en zayıf yeri oluyordu. Dizin bir DEĞERLENDİRME ekranı;
 * anasayfa şeridi ve panel `tile` ile devam eder.
 *
 * "Ana kategoriler" SAYILI liste (2026-09-08): artık GERÇEK — dizin yanıtı
 * firmanın YAYINDAKİ ürünlerinin kategori kırılımını taşıyor
 * (`topCategories`, sunucuda tek `groupBy`). Beyan edilen kategoriden
 * farklıdır: beyan "hangi alandayım", bu "elimde ne var".
 */
export function CompanyCard({
  company: c,
  href,
  badge,
  footer,
  variant = "tile",
  cta,
}: {
  company: PublicDirectoryCard;
  /** `tile` ızgara kartı (varsayılan) · `wide` dizin satırı. */
  variant?: "tile" | "wide";
  /** `wide`: birincil eylem etiketi (dizinde "Bilgi iste"). */
  cta?: { label: string; href: string };
  /** Panel: `/company/firma/<id>`; public: `/firma/<slug>` (varsayılan). */
  href?: string;
  /** Panel: bağlantı durumu rozeti. */
  badge?: React.ReactNode;
  /**
   * Kartın EN ALTINDAKİ ek blok (panel: "Aramanıza uyan" ürün şeridi).
   * Kartın DIŞINA eklenince araya dikiş giriyordu — kart `h-full` olduğu
   * için ızgara satır yüksekliğine uzuyor, ek blok altında boşluk kalıyordu.
   */
  footer?: React.ReactNode;
}) {
  const activities = c.activities.slice(0, 3);
  const more = c.activities.length - activities.length;
  const certs = (c.certifications ?? []).slice(0, 2);
  const facts = [
    c.productCount > 0 ? `${c.productCount.toLocaleString("tr-TR")} ürün` : null,
    c.foundedYear ? `Kuruluş ${c.foundedYear}` : null,
    c.employeeCount ? `${c.employeeCount} çalışan` : null,
  ].filter(Boolean) as string[];

  const identity = (
    <>
      {c.verified ? (
        <Badge tone="verified" size="sm">
          Doğrulanmış
        </Badge>
      ) : null}
      {c.gold ? (
        <Badge tone="gold" size="sm">
          Gold Üye
        </Badge>
      ) : null}
    </>
  );

  if (variant === "wide") {
    const preview = c.productPreview.slice(0, 4);
    const rest = c.productCount - preview.length;
    return (
      <article className="group relative rounded-lg bg-white p-5 ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-blue-500">
        {/* ÜST SATIR — kimlik solda, eylemler SAĞDA (2026-09-08, kaynak
            kalıp): "portföy" ve "iletişim" satırın en görünür yerinde;
            eskiden kartın en altındaydı ve göz onları en son buluyordu. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={c.name} src={c.logoUrl} size={64} />
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-950">
                <Link
                  href={href ?? `/firma/${c.slug}`}
                  className="after:absolute after:inset-0 after:content-[''] hover:text-blue-700 focus:outline-none"
                >
                  {c.name}
                </Link>
                {identity}
              </h3>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                {c.city || c.country ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
                    {[c.country ? countryName(c.country) : null, c.city].filter(Boolean).join(", ")}
                  </span>
                ) : null}
                {activities.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1">
                    <ActivityIcon code={a} className="size-3.5 text-zinc-400" />
                    {companyActivityLabel(a)}
                  </span>
                ))}
                {more > 0 ? <span className="tnum">+{more}</span> : null}
                {/* ÖLÇÜLMÜŞ değer: gece cron'u ortanca ilk yanıt süresini
                    yazıyor. Ölçüm yoksa rozet HİÇ çizilmez — "yavaş" demek
                    değil, "henüz veri yok". */}
                {c.fastReply ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <ChatBubbleLeftRightIcon aria-hidden className="size-3.5" />
                    Hızlı yanıt veren
                  </span>
                ) : null}
              </p>
              {badge ? <div className="mt-2">{badge}</div> : null}
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            {c.productCount > 0 ? (
              <Link
                href={`${href ?? `/firma/${c.slug}`}#urunler`}
                className="inline-flex items-center rounded-lg border border-blue-600 px-3.5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                Portföyü görüntüle ({c.productCount.toLocaleString("tr-TR")})
              </Link>
            ) : null}
            {cta ? (
              <Link
                href={cta.href}
                className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {cta.label}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* SOL — ne yaptığı: ana kategoriler (gerçek kırılım) + sertifika. */}
          <div className="min-w-0">
            {(c.topCategories ?? []).length > 0 ? (
              <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
                  Ana kategoriler
                </p>
                <ul className="mt-1.5 space-y-1">
                  {(c.topCategories ?? []).map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm text-zinc-800">
                      <span className="line-clamp-1">{t.name}</span>
                      <span className="tnum shrink-0 text-xs text-zinc-500">({t.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {certs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {certs.map((x) => (
                  <Badge key={x} tone="neutral" size="sm" className="bg-white ring-1 ring-inset ring-zinc-950/10">
                    {x}
                  </Badge>
                ))}
              </div>
            ) : null}
            {facts.length > 0 ? <p className="tnum mt-2 text-xs text-zinc-500">{facts.join(" · ")}</p> : null}
          </div>

          {/* SAĞ — ne sattığı: açıklama + fiyat/MOQ'lu ürün şeridi. */}
          <div className="min-w-0">
            {c.about ? <p className="line-clamp-2 text-sm/6 text-zinc-600">{c.about}</p> : null}
            {preview.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {preview.map((pv) => (
                  <li key={pv.slug} className="min-w-0">
                    <Thumb src={pv.image ?? undefined} alt="" size="lg" className="w-full" />
                    <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-700">{pv.name}</p>
                    {pv.moq ? (
                      <p className="tnum text-[11px] text-zinc-500">
                        MOQ: {Number(pv.moq).toLocaleString("tr-TR")} {pv.unit ?? ""}
                      </p>
                    ) : null}
                    {pv.priceAmount ? (
                      <p className="tnum text-[11px] font-medium text-zinc-800">
                        {Number(pv.priceAmount).toLocaleString("tr-TR")}{" "}
                        {currencySymbol(pv.priceCurrency ?? "TRY")}
                      </p>
                    ) : null}
                  </li>
                ))}
                {rest > 0 ? (
                  <li>
                    <Link
                      href={`${href ?? `/firma/${c.slug}`}#urunler`}
                      className="tnum relative z-10 flex aspect-square w-full items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      +{rest.toLocaleString("tr-TR")} ürün
                    </Link>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {footer ? <div className="relative z-10 mt-4 border-t border-zinc-200 pt-3">{footer}</div> : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    /* Pazar bölgesi dili (2026-09-07): küçük yarıçap, hairline çerçeve,
       gölge yalnız hover — ürün kartıyla aynı yüzey. */
    <article className="group relative flex h-full flex-col rounded-lg bg-white p-5 ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-zinc-950">
      <div className="flex items-start gap-3">
        <Avatar name={c.name} src={c.logoUrl} size={48} />
        <div className="min-w-0">
          {/* Ad İKİ SATIRA kadar sarar, rozetler adın peşinden akar
              (2026-09-07): tek satır + `truncate` üç sütunlu ızgarada
              "Kayseri Mobily…" gibi okunamaz kısaltmalar üretiyordu. Rozetler
              `inline-flex` olduğu için ad kısaysa yine aynı satırda kalır. */}
          <h3 className="text-[15px] font-semibold text-zinc-950">
            <Link
              href={href ?? `/firma/${c.slug}`}
              className="line-clamp-2 after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none"
            >
              {c.name}
            </Link>
            <span className="mt-1 flex items-center gap-1.5">
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
            </span>
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
      {footer ? <div className="relative z-10 mt-4 border-t border-zinc-200 pt-3">{footer}</div> : null}
    </article>
  );
}
