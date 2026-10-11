import { Injectable, Optional } from "@nestjs/common";
import type { CompanyActivity, Prisma } from "@rothern/db";
import { foldSearchText, hiddenPrefixesUnder, stemPrefix, tokenizeQuery, visibleCategoryId } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import { currentLocale } from "../../common/i18n/locale-context";
import { PUBLIC_PROFILE_WHERE } from "../../common/company/public-profile-gate";
import { shownCompanyDeclaration } from "../../common/company/company-directory";
import { likeLiteral } from "../../common/prisma/like-literal";

/**
 * Firma dizini — kiracılar ARASI okuma (başka firmaları listeler), bu yüzden
 * `PrismaBypassService`. Kapı controller'da: `CompanyJwtAuthGuard`.
 *
 * Görünürlük kuralı `/firma/<slug>` profiliyle AYNI olmak zorunda
 * (`common/company/public-profile-gate.ts`): dizinde görünen her satırın
 * açılabilir bir profili olmalı, aksi hâlde 404'e giden liste üretiriz.
 */
@Injectable()
export class CompanyDirectoryService {
  constructor(
    private readonly prisma: PrismaBypassService,
    /** i18n Faz 1e: kart metni okuyucunun dilinde — SONDA ve isteğe bağlı. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /**
   * FİRMA DİZİNİ — YALNIZ GİRİŞ YAPMIŞ firmalara.
   *
   * Uç `public/` altından buraya taşındı: dizin artık anonim ziyaretçiye
   * açılmıyor. Kapı çerezin VARLIĞI değil `CompanyJwtAuthGuard` — sahte bir
   * çerez basmak yetmesin diye karar sunucuda veriliyor.
   *
   * Kapı `getBySlug` ile AYNI (`PUBLIC_PROFILE_WHERE`: publicEnabled ∧ isActive
   * ∧ !isBlocked; paket şartı 2026-09-06'da kalktı): dizinde görünen her satırın tıklanabilir bir profil sayfası
   * OLMAK ZORUNDA. Kapıyı gevşetip daha kalabalık bir dizin üretmek, 404'e
   * giden bağlantılarla dolu bir sayfa üretirdi.
   *
   * Kategori süzgeci alıcı VE satıcı eksenlerinin ikisine birden bakar
   * (`hasSome`) — firma "hangi alandayım" beyanını iki ayrı alanda tutuyor ve
   * ziyaretçi bu ayrımı bilmez.
   */
  async listPublic(q: {
    q?: string;
    city?: string;
    category?: string;
    activity?: string;
    page?: number;
  }) {
    const pageSize = 24;
    const page = Math.max(1, q.page ?? 1);
    const tokens = q.q ? tokenizeQuery(q.q) : [];
    // HIDDEN SEGMENTS (owner rule 2026-10-09): a hidden code in `?category=`
    // behaves as if no category filter was given - the same rule as the shared
    // directory builder (`common/company/company-directory.ts`). Without it the
    // filter still worked and listed exactly the companies that had declared
    // the hidden segment.
    const category = visibleCategoryId(q.category);
    const declaresCategory: Prisma.CompanyWhereInput | null = category
      ? {
          OR: [
            { buyerCategoryIds: { has: category } },
            { buyerSubCategoryIds: { has: category } },
            { sellerCategoryIds: { has: category } },
            { sellerSubCategoryIds: { has: category } },
          ],
        }
      : null;
    // HIDDEN BRANCH UNDER A VISIBLE CATEGORY (2026-10-10). A declaration
    // stores the ancestor chain of every pick, so a company whose only pick
    // under this category is a hidden one still holds the visible ancestor.
    // It is not listed under it: the SHOWN declaration decides (single rule,
    // `shownCompanyDeclaration`). Only a category that has a hidden branch
    // below it needs this second pass; the page and the total then come from
    // the narrowed id set.
    const shownIds =
      category && declaresCategory && hiddenPrefixesUnder(category).length > 0
        ? (
            await this.prisma.company.findMany({
              where: { ...PUBLIC_PROFILE_WHERE, ...declaresCategory },
              select: {
                id: true,
                buyerCategoryIds: true,
                buyerSubCategoryIds: true,
                sellerCategoryIds: true,
                sellerSubCategoryIds: true,
              },
              take: 5000,
            })
          )
            .filter((c) => shownCompanyDeclaration(c).all.includes(category))
            .map((c) => c.id)
        : null;
    const where: Prisma.CompanyWhereInput = {
      ...PUBLIC_PROFILE_WHERE,
      ...(shownIds ? { id: { in: shownIds } } : {}),
      ...(q.city ? { city: q.city } : {}),
      ...(q.activity
        ? { activities: { has: q.activity as CompanyActivity } }
        : {}),
      ...(declaresCategory ?? {}),
      ...(tokens.length
        ? {
            // `likeLiteral`: `%` / `_` joker değil düz karakter (ortak dizin
            // kurucusu `common/company/company-directory.ts` ile aynı kural).
            AND: tokens.map((t) => ({
              OR: [
                { name: { contains: likeLiteral(t), mode: "insensitive" as const } },
                { industry: { contains: likeLiteral(t), mode: "insensitive" as const } },
                { aboutText: { contains: likeLiteral(t), mode: "insensitive" as const } },
                { services: { has: t } },
                { searchTextI18n: { contains: likeLiteral(stemPrefix(foldSearchText(t))) } },
              ],
            })),
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          country: true,
          industry: true,
          activities: true,
          logoUrl: true,
          aboutText: true,
          services: true,
          foundedYear: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const localized = this.translations
      ? await this.translations.localizeCompanies(rows, rows.map((r) => r.id), currentLocale())
      : rows;
    return {
      items: localized.map(({ id: _companyId, ...c }) => ({
        ...c,
        // Kart özeti — tam metin profil sayfasında.
        aboutText: c.aboutText
          ? c.aboutText.replace(/\s+/g, " ").trim().slice(0, 200)
          : null,
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Dizin süzgeçleri: şehir ve faaliyet sayaçları (kapıdan geçenler). */
  async directoryFacets() {
    const rows = await this.prisma.company.findMany({
      where: PUBLIC_PROFILE_WHERE,
      select: { city: true, activities: true },
      take: 5000,
    });
    const cities = new Map<string, number>();
    const activities = new Map<string, number>();
    for (const r of rows) {
      const city = r.city?.trim();
      if (city) cities.set(city, (cities.get(city) ?? 0) + 1);
      for (const a of new Set(r.activities)) {
        activities.set(a, (activities.get(a) ?? 0) + 1);
      }
    }
    return {
      cities: [...cities.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
      activities: [...activities.entries()]
        .map(([activity, count]) => ({ activity, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
