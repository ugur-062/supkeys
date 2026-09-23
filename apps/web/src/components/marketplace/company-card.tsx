import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import type { PublicDirectoryCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon, CalendarDaysIcon, ChatBubbleLeftRightIcon, ChevronRightIcon, CubeIcon, MapPinIcon, ShieldCheckIcon, UsersIcon } from "@heroicons/react/20/solid";
import { ActivityIcon } from "./activity-icons";
import { currencySymbol } from "@/lib/tenders/labels";
import { companyActivityLabel, countryName } from "@rothern/shared";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

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
  accent = "blue",
}: {
  company: PublicDirectoryCard;
  /** `tile` ızgara kartı (varsayılan) · `wide` dizin satırı. */
  variant?: "tile" | "wide";
  /** `wide`: birincil eylem etiketi (dizinde "Bilgi iste"). */
  cta?: { label: string; href: string };
  /** `wide`: eylem rengi — satınalma/herkese açık MAVİ, satış portalı EMERALD (2026-09-19). */
  accent?: "blue" | "emerald";
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
  const t = useTranslations("web.marketplace.companyCard");
  const fmt = useFormatter();
  const activities = c.activities.slice(0, 3);
  const more = c.activities.length - activities.length;
  const certs = (c.certifications ?? []).slice(0, 2);
  const facts = [
    c.productCount > 0 ? t("products", { n: c.productCount }) : null,
    c.foundedYear ? t("founded", { year: c.foundedYear }) : null,
    c.employeeCount ? t("employees", { n: c.employeeCount }) : null,
  ].filter(Boolean) as string[];

  const identity = (
    <>
      {c.verified ? (
        <Badge tone="verified" size="sm">
          {t("verified")}
        </Badge>
      ) : null}
      {c.gold ? (
        <Badge tone="gold" size="sm">
          {t("goldMember")}
        </Badge>
      ) : null}
    </>
  );

  if (variant === "wide") {
    const preview = c.productPreview.slice(0, 4);
    const rest = c.productCount - preview.length;
    const tone =
      accent === "emerald"
        ? { outline: "border-emerald-600 text-emerald-700 hover:bg-emerald-50", fill: "bg-emerald-600 hover:bg-emerald-700", soft: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" }
        : { outline: "border-blue-600 text-blue-700 hover:bg-blue-50", fill: "bg-blue-600 hover:bg-blue-700", soft: "bg-blue-50 text-blue-700 hover:bg-blue-100" };
    return (
      /* v3 (2026-09-19, kullanıcı mockup'ı "örnek bir firma görüntülenmesi"):
         büyük tonlu avatar, kalın ad + Doğrulanmış pili, ikonlu konum/tip
         satırı; sağda "Portföyü görüntüle (N)" çerçeveli + "Bilgi iste →"
         dolgulu; solda gri "ANA KATEGORİLER" paneli (satır · sayı · ok);
         sağda açıklama + kartlı ürün şeridi (görsel · ad · MOQ · fiyat);
         altta ayraçlı olgu satırı (sertifika rozeti · N ürün · Kuruluş · çalışan). */
      // BOYUT ESKİ KARTLA AYNI (aynı gün, kullanıcı: "küçült, eski boyutunda
      // olsun"): p-5, 64 px avatar, text-base ad, text-xs meta; düzen v3.
      <article className="group relative rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition hover:shadow-md hover:ring-zinc-950/10 focus-within:ring-2 focus-within:ring-blue-500">
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
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                {c.city || c.country ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon aria-hidden className="size-3.5 text-zinc-500" />
                    {[c.country ? countryName(c.country) : null, c.city].filter(Boolean).join(", ")}
                  </span>
                ) : null}
                {activities.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1">
                    <ActivityIcon code={a} className="size-3.5 text-zinc-500" />
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
                    {t("fastReply")}
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
                className={`inline-flex items-center rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition ${tone.outline}`}
              >
                {t("viewPortfolio", { n: fmt.number(c.productCount) })}
              </Link>
            ) : null}
            {cta ? (
              <Link
                href={cta.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition ${tone.fill}`}
              >
                {cta.label}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>

        <div className={cn("mt-4 grid gap-4", (c.topCategories ?? []).length > 0 && "lg:grid-cols-[14rem_minmax(0,1fr)]")}>
          {/* SOL — ne yaptığı: ana kategoriler (gerçek kırılım); yoksa sütun
              hiç açılmaz (boş gri alan kalmasın). */}
          {(c.topCategories ?? []).length > 0 ? (
          <div className="min-w-0">
            {(c.topCategories ?? []).length > 0 ? (
              <div className="rounded-lg bg-zinc-100/70 px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
                  {t("mainCategories")}
                </p>
                <ul className="mt-0.5 divide-y divide-zinc-950/5">
                  {(c.topCategories ?? []).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm text-zinc-800">
                      <span className="line-clamp-1">{t.name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-zinc-500">
                        <span className="tnum text-xs">({t.count})</span>
                        <ChevronRightIcon aria-hidden className="size-4 text-zinc-400" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          ) : null}

          {/* SAĞ — ne sattığı: açıklama + kartlı ürün şeridi. */}
          <div className="min-w-0">
            {c.about ? <p className="line-clamp-2 text-sm/6 text-zinc-600">{c.about}</p> : null}
            {preview.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {preview.map((pv) => (
                  <li key={pv.slug} className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-zinc-200">
                    <Thumb src={pv.image ?? undefined} alt="" size="lg" className="aspect-[16/10] w-full rounded-md" />
                    <p className="mt-1.5 line-clamp-2 text-xs/5 font-medium text-zinc-900">{pv.name}</p>
                    {pv.moq ? (
                      <p className="tnum text-[11px] text-zinc-500">
                        {t("moq", { n: fmt.number(Number(pv.moq)), unit: pv.unit ?? "" })}
                      </p>
                    ) : null}
                    {pv.priceAmount ? (
                      <p className="tnum text-xs font-bold text-zinc-900">
                        {fmt.number(Number(pv.priceAmount))}{" "}
                        {currencySymbol(pv.priceCurrency ?? "TRY")}
                      </p>
                    ) : null}
                  </li>
                ))}
                {rest > 0 && preview.length < 4 ? (
                  <li>
                    <Link
                      href={`${href ?? `/firma/${c.slug}`}#urunler`}
                      className={`tnum relative z-10 flex h-full min-h-24 w-full items-center justify-center rounded-lg text-sm font-semibold transition ${tone.soft}`}
                    >
                      {t("moreProducts", { n: fmt.number(rest) })}
                    </Link>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {footer ? <div className="relative z-10 mt-4 border-t border-zinc-200 pt-3">{footer}</div> : null}
          </div>
        </div>

        {/* OLGU SATIRI — sertifika rozeti · N ürün · Kuruluş · çalışan (ayraçlı). */}
        {certs.length > 0 || facts.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-950/5 pt-3 text-xs text-zinc-600">
            {certs.map((x) => (
              <span key={x} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800">
                <ShieldCheckIcon aria-hidden className="size-3.5 text-zinc-700" />
                {x}
              </span>
            ))}
            {c.productCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 tnum border-l border-zinc-950/10 pl-4 first:border-0 first:pl-0">
                <CubeIcon aria-hidden className="size-3.5 text-zinc-500" />
                {t("products", { n: c.productCount })}
              </span>
            ) : null}
            {c.foundedYear ? (
              <span className="inline-flex items-center gap-1.5 tnum border-l border-zinc-950/10 pl-4 first:border-0 first:pl-0">
                <CalendarDaysIcon aria-hidden className="size-3.5 text-zinc-500" />
                {t("founded", { year: c.foundedYear })}
              </span>
            ) : null}
            {c.employeeCount ? (
              <span className="inline-flex items-center gap-1.5 tnum border-l border-zinc-950/10 pl-4 first:border-0 first:pl-0">
                <UsersIcon aria-hidden className="size-3.5 text-zinc-500" />
                {t("employees", { n: c.employeeCount })}
              </span>
            ) : null}
          </div>
        ) : null}
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
                  <span className="sr-only">{t("verifiedCompany")}</span>
                </Badge>
              ) : null}
              {c.gold ? (
                <Badge tone="gold" size="sm" className="px-1">
                  <span className="sr-only">{t("goldMember")}</span>
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
        <p className="mt-1 text-sm font-semibold text-zinc-900 group-hover:text-zinc-600">{t("viewProfile")}</p>
      </div>
      {footer ? <div className="relative z-10 mt-4 border-t border-zinc-200 pt-3">{footer}</div> : null}
    </article>
  );
}
