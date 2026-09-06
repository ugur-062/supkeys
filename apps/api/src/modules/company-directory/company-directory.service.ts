import { Injectable } from "@nestjs/common";
import type { CompanyActivity, Prisma } from "@rothern/db";
import { tokenizeQuery } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { PUBLIC_PROFILE_WHERE } from "../../common/company/public-profile-gate";

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
  constructor(private readonly prisma: PrismaBypassService) {}

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
    const where: Prisma.CompanyWhereInput = {
      ...PUBLIC_PROFILE_WHERE,
      ...(q.city ? { city: q.city } : {}),
      ...(q.activity
        ? { activities: { has: q.activity as CompanyActivity } }
        : {}),
      ...(q.category
        ? {
            OR: [
              { buyerCategoryIds: { has: q.category } },
              { buyerSubCategoryIds: { has: q.category } },
              { sellerCategoryIds: { has: q.category } },
              { sellerSubCategoryIds: { has: q.category } },
            ],
          }
        : {}),
      ...(tokens.length
        ? {
            AND: tokens.map((t) => ({
              OR: [
                { name: { contains: t, mode: "insensitive" as const } },
                { industry: { contains: t, mode: "insensitive" as const } },
                { aboutText: { contains: t, mode: "insensitive" as const } },
                { services: { has: t } },
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

    return {
      items: rows.map((c) => ({
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
