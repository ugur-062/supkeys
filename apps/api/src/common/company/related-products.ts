import type { PrismaClient } from "@rothern/db";
import { NotFoundException } from "@nestjs/common";
import { publicProductWhere } from "./public-profile-gate";
import { productCategoryWhere } from "./product-index";
import {
  PRODUCT_INDEX_SELECT,
  toProductIndexCard,
} from "../../modules/public-marketplace/dto/public-product-index.projection";

type Db = Pick<PrismaClient, "companyItem">;

/**
 * ÜRÜN SAYFASI İLİŞKİLİ BLOKLARI — herkese açık sayfa ve PANEL aynı fonksiyonu
 * okur (üye, ziyaretçiden farklı bir "benzer ürünler" görmemeli):
 *   fromCompany: aynı firmanın diğer ürünleri (+ toplam),
 *   similar: aynı alt kategori (L3 → L2 → L1 genişler), FARKLI firma,
 *            doğrulanmış önce,
 *   popular: kategoride EN YENİ — görüntülenme verisi yok, uydurma sıralama
 *            yerine dürüst etiket ("Kategoride yeni").
 */
export async function relatedProducts(prisma: Db, companySlug: string, productSlug: string) {
  const base = await prisma.companyItem.findFirst({
    where: { ...publicProductWhere(), slug: productSlug, company: { slug: companySlug } },
    select: { id: true, companyId: true, categoryId: true },
  });
  if (!base) throw new NotFoundException("Ürün bulunamadı");
  const [fromCompany, fromTotal] = await Promise.all([
    prisma.companyItem.findMany({
      where: { ...publicProductWhere(), companyId: base.companyId, id: { not: base.id } },
      select: PRODUCT_INDEX_SELECT,
      orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
      take: 8,
    }),
    prisma.companyItem.count({
      where: { ...publicProductWhere(), companyId: base.companyId, id: { not: base.id } },
    }),
  ]);
  let similar: typeof fromCompany = [];
  const code = base.categoryId;
  if (code && /^\d{8}$/.test(code)) {
    for (const level of [`${code.slice(0, 6)}00`, `${code.slice(0, 4)}0000`, `${code.slice(0, 2)}000000`]) {
      similar = await prisma.companyItem.findMany({
        where: { ...publicProductWhere(), ...productCategoryWhere(level), companyId: { not: base.companyId } },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        take: 8,
      });
      if (similar.length >= 4) break;
    }
  }
  const popular = code
    ? await prisma.companyItem.findMany({
        where: { ...publicProductWhere(), ...productCategoryWhere(`${code.slice(0, 2)}000000`), id: { not: base.id } },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ publishedAt: "desc" }],
        take: 8,
      })
    : [];
  const verifiedFirst = (rows: typeof fromCompany) =>
    rows.map(toProductIndexCard).sort((a, b) => Number(b.company.verified) - Number(a.company.verified));
  return {
    fromCompany: { items: fromCompany.map(toProductIndexCard), total: fromTotal },
    similar: verifiedFirst(similar),
    popular: popular.map(toProductIndexCard),
  };
}
