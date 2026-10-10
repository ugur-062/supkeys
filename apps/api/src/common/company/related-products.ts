import { i18nMessage } from "../i18n/http-i18n";
import type { PrismaClient } from "@rothern/db";
import { NotFoundException } from "@nestjs/common";
import { publicProductWhere } from "./public-profile-gate";
import { isHiddenCategory } from "@rothern/shared";
import type { Prisma } from "@rothern/db";
import { productCategoryWhere, productSubtreeClauses } from "./product-index";
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
 *   popular: kategoride EN YENİ, FARKLI firma — görüntülenme verisi yok,
 *            uydurma sıralama yerine dürüst etiket ("Kategoride yeni").
 *
 * `popular` de kendi firmasını DIŞLAR (2026-09-07): dışlamayınca üç ürünlü
 * bir firmanın sayfasında "kategoride yeni" satırı aynı firmanın öbür iki
 * ürününü basıyordu — alıcı karşılaştıracak başka tedarikçi göremiyordu ve
 * pazar yeri hissi tam orada kırılıyordu (kullanıcı bulgusu).
 *
 * KATEGORİ BLOKLARI ürünün KENDİ saklanmış kodundan yukarı çıkar (L3 → L2 →
 * L1). İki durum (`categoryScope`):
 *  · GÖRÜNÜR kategorideki ürün: her düzeyin alt ağacı gizli torunlar OLMADAN
 *    okunur (`productSubtreeClauses`, 2026-10-10) — `4618…` ürününün "benzer" /
 *    "kategoride yeni" satırına segment 46 üzerinden `4610…` (gizli aile)
 *    ürünü girmez.
 *  · GİZLİ daldaki eski ürün: HAM kod (`productCategoryWhere`), eskisi gibi —
 *    burada süzülseydi eski ürünün blokları boşalır ya da kendi dalındaki
 *    benzerlerini kaybederdi. Gizli daldaki ürün yalnız böyle bir ürünün
 *    sayfasında ilişkili blokta çıkar; kartta kategori kodu yine yoktur.
 */
export interface RelatedViewerScope {
  /**
   * Panel görüntüleyicisi (arayüz testi D-231): "Benzer ürünler — diğer
   * tedarikçilerden" ve "Kategoride yeni" görüntüleyenin KENDİ firmasını
   * listelememeli — üye kendi ürününü "başka tedarikçi" diye görüyordu.
   */
  viewerCompanyId?: string;
  /**
   * Görüntüleyiciyle herhangi yönde engel ilişkisi olan firmalar: hiçbir
   * blokta listelenmez; ürünün kendi firması bu kümedeyse 404 (panel ürün
   * sayfası `discoverProduct` ile aynı karşılıklı görünmezlik).
   */
  blockedCompanyIds?: string[];
}

export async function relatedProducts(prisma: Db, companySlug: string, productSlug: string, viewer: RelatedViewerScope = {}) {
  const base = await prisma.companyItem.findFirst({
    // Firma slug'ı AND ile eklenir: `company` anahtarını düz yazmak
    // `publicProductWhere()`in profil kapısını (publicEnabled/aktif/bloksuz)
    // ezer ve engelli firmanın ürünü için 404 yerine 200 dönerdi.
    where: { AND: [publicProductWhere(), { slug: productSlug, company: { slug: companySlug } }] },
    select: { id: true, companyId: true, categoryId: true },
  });
  if (!base) throw new NotFoundException(i18nMessage("api.company.urunBulunamadi"));
  const blocked = viewer.blockedCompanyIds ?? [];
  if (blocked.includes(base.companyId)) throw new NotFoundException(i18nMessage("api.company.urunBulunamadi"));
  // "Diğer tedarikçiler" blokları: ürünün firması + görüntüleyen + engelliler.
  const otherCompanies = {
    notIn: [...new Set([base.companyId, ...(viewer.viewerCompanyId ? [viewer.viewerCompanyId] : []), ...blocked])],
  };
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
  const legacy = isHiddenCategory(code);
  const categoryScope = (root: string): Prisma.CompanyItemWhereInput[] =>
    legacy ? [productCategoryWhere(root)] : productSubtreeClauses(root);
  if (code && /^\d{8}$/.test(code)) {
    for (const level of [`${code.slice(0, 6)}00`, `${code.slice(0, 4)}0000`, `${code.slice(0, 2)}000000`]) {
      similar = await prisma.companyItem.findMany({
        where: { ...publicProductWhere(), AND: categoryScope(level), companyId: otherCompanies },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        take: 8,
      });
      if (similar.length >= 4) break;
    }
  }
  const popular = code
    ? await prisma.companyItem.findMany({
        where: {
          ...publicProductWhere(),
          AND: categoryScope(`${code.slice(0, 2)}000000`),
          id: { not: base.id },
          companyId: otherCompanies,
        },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ publishedAt: "desc" }],
        take: 8,
      })
    : [];
  const verifiedFirst = (rows: typeof fromCompany) =>
    rows.map(toProductIndexCard).sort((a, b) => Number(b.company.verified) - Number(a.company.verified));
  const similarCards = verifiedFirst(similar);
  const similarIds = similarCards.map((c) => similar.find((r) => r.slug === c.slug && r.company.slug === c.company.slug)?.id ?? "");
  return {
    fromCompany: { items: fromCompany.map(toProductIndexCard), total: fromTotal },
    similar: similarCards,
    popular: popular.map(toProductIndexCard),
    /** İç kimlikler — YALNIZ çeviri eşlemesi için; herkese açık uç yanıta koymadan soyar (i18n Faz 1e). */
    ids: {
      fromCompany: fromCompany.map((r) => r.id),
      similar: similarIds,
      popular: popular.map((r) => r.id),
    },
  };
}
