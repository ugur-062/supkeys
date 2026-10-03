import type { TenderExternalInviteData } from "@rothern/email";
import type { Locale } from "@rothern/i18n";
import { listingPath } from "@rothern/shared";
import { Prisma } from "@rothern/db";
import type { PrismaBypassService } from "../prisma/prisma.service";
import type { ContentTranslationService } from "../../modules/content-translation/content-translation.service";
import { CATEGORY_NAME_SELECT, categoryName } from "./category-name";
import { localizeAppPath } from "./app-routes";
import { marketplaceListingWhere } from "./listing-visibility";
import { formatInviteDeadline, formatInvitePlace, INVITE_ITEM_PREVIEW } from "./invite-delivery";
import { tApi } from "../i18n/i18n.service";

/**
 * DIŞ TALEP DAVETİNİN İÇERİĞİ — tek kaynak (2026-09-27, Faz 0b).
 *
 * Tekli davet, hatırlatma ve özet e-postası aynı olgulardan üretilir; alan
 * seçimi BEYAZ LİSTE: başlık, numara, ilk kalemler (ad + miktar + birim),
 * kalem sayısı, teslim yeri (yalnız şehir + ülke), son teklif tarihi, kategori,
 * aranan tedarikçi tipi, vitrindeyse herkese açık sayfa ve DAVET EDEN FİRMANIN
 * ADI (alıcı bu tedarikçiyi kendisi davet etti — herkese açık sayfadaki
 * anonimlik kuralı genel duyurular içindir). Hedef fiyat, marka/şartname/belge,
 * ticari şartlar, tam adres, teklif sayısı ve diğer davetliler ASLA seçilmez.
 */
export const INVITE_LISTING_SELECT = {
  id: true,
  title: true,
  number: true,
  status: true,
  closesAt: true,
  categoryIds: true,
  companyId: true,
  deliveryAddressId: true,
  preferredActivities: true,
  inviteShowName: true,
  company: { select: { name: true } },
  items: {
    select: { name: true, quantity: true, unit: true, unitCode: true },
    orderBy: { lineNo: "asc" },
    take: INVITE_ITEM_PREVIEW,
  },
  _count: { select: { items: true } },
} satisfies Prisma.ListingSelect;

export type InviteListing = Prisma.ListingGetPayload<{ select: typeof INVITE_LISTING_SELECT }>;

export type InviteContent = Omit<TenderExternalInviteData, "registerUrl" | "optOutUrl" | "reminder"> & {
  /** Ad gizliyse gönderen "Rothern" kalır (ad "Rothern üzerinden" yazılmaz). */
  showName: boolean;
};

/**
 * Davet eden firmanın adı; alıcı adını gizlediyse (`Listing.inviteShowName`
 * kapalı) ya da ad yoksa nötr ad ("Bir alıcı firma") — alıcının dilinde.
 */
export function inviterDisplayName(name: string | null | undefined, locale: Locale, show = true): string {
  if (!show) return tApi("api.companyConnections.anonymousBuyer", undefined, locale);
  return name?.trim() || tApi("api.notifications.companyConnections.someCompany", undefined, locale);
}

/**
 * Talep × dil başına içerik — bir gönderim turunda aynı talep birden çok
 * alıcıya gideceği için önbellekli (kategori, adres, vitrin sorgusu bir kez).
 */
export class InviteContentBuilder {
  private readonly cache = new Map<string, InviteContent>();
  private readonly facts = new Map<
    string,
    Promise<{ cats: Array<Prisma.CategoryGetPayload<{ select: typeof CATEGORY_NAME_SELECT }>>; place: { city: string | null; country: string | null } | null; inVitrine: boolean }>
  >();

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly baseUrl: string,
    private readonly translations?: ContentTranslationService,
  ) {}

  private loadFacts(listing: InviteListing) {
    let hit = this.facts.get(listing.id);
    if (!hit) {
      hit = (async () => {
        const [cats, place, vitrine] = await Promise.all([
          this.prisma.category.findMany({
            where: { id: { in: listing.categoryIds.slice(0, 3) } },
            select: CATEGORY_NAME_SELECT,
          }),
          listing.deliveryAddressId
            ? this.prisma.companyAddress.findFirst({
                where: { id: listing.deliveryAddressId, companyId: listing.companyId },
                select: { city: true, country: true },
              })
            : Promise.resolve(null),
          listing.number
            ? this.prisma.listing.count({
                where: { AND: [{ id: listing.id }, marketplaceListingWhere(new Date())] },
              })
            : Promise.resolve(0),
        ]);
        return { cats, place, inVitrine: vitrine > 0 };
      })();
      this.facts.set(listing.id, hit);
    }
    return hit;
  }

  async content(listing: InviteListing, locale: Locale): Promise<InviteContent> {
    const key = `${listing.id}|${locale}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { cats, place, inVitrine } = await this.loadFacts(listing);
    const base = { title: listing.title, items: listing.items.map((i) => ({ name: i.name })) };
    const [loc] = this.translations
      ? await this.translations.localizeListings([base], [listing.id], locale)
      : [base];
    const content: InviteContent = {
      inviterName: inviterDisplayName(listing.company?.name, locale, listing.inviteShowName),
      tenderTitle: loc?.title ?? listing.title,
      tenderNumber: listing.number ?? null,
      categories: cats.map((c) => categoryName(c, locale)),
      closesAt: listing.closesAt ? formatInviteDeadline(listing.closesAt, locale) : null,
      items: listing.items.map((it, i) => ({
        name: loc?.items?.[i]?.name ?? it.name,
        quantity: Number(it.quantity),
        unitCode: it.unitCode,
        unit: it.unit,
      })),
      itemCount: listing._count.items,
      deliveryPlace: place ? formatInvitePlace(place.city, place.country, locale) : null,
      supplierTypes: listing.preferredActivities,
      publicUrl:
        inVitrine && listing.number
          ? `${this.baseUrl}${localizeAppPath(listingPath(listing.number, listing.title), locale)}`
          : null,
      showName: listing.inviteShowName,
    };
    this.cache.set(key, content);
    return content;
  }
}
