import {
  CompanyRole,
  type CompanyTier,
  type ListingFormat,
  type ListingType,
  type ListingStatus,
  type ListingVisibility,
  Prisma,
  PrismaClient,
} from "@rothern/db";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { permissionsForRoles } from "@rothern/shared";

let counter = 0;
const uniq = () => `${Date.now().toString(36)}-${counter++}`;

export async function makeCompany(
  prisma: PrismaClient,
  over: Partial<Prisma.CompanyUncheckedCreateInput> = {},
) {
  return prisma.company.create({
    data: {
      name: `Firma ${uniq()}`,
      country: "TR",
      tier: "GOLD" as CompanyTier,
      isActive: true,
      // INV-KYC-1: operasyonel test firması varsayılan VERIFIED (para-taahhüdü
      // kapıları bunu ister). KYC-akış testleri (kyc-doc-review/foreign-
      // verification) status'ü explicit geçer → etkilenmez.
      companyVerificationStatus: "VERIFIED",
      // Zorunlu KYC kimlik alanları (denetim 2026-08-26 Parça 9 Dalga B):
      // GERÇEKÇİ varsayılan — TR firması doğrulamaya `submit()` ile gelir ve
      // submit bu dördünü ZORUNLU tutar, yani PENDING/VERIFIED bir firmada bu
      // alanlar prod'da her zaman doludur. Fixture'lar bunu yansıtmazsa admin
      // onay yolundaki kimlik kapısı yapay olarak kırılır.
      mersisNo: "0123456789012345",
      tradeRegistryNo: `TSR-${uniq()}`,
      // NOT: company-profile.spec'in VALID_IBAN'ından FARKLI olmalı — o spec
      // "kilitli alanı DEĞİŞTİRME" senaryosunu test ediyor; aynı değer olursa
      // değişiklik oluşmaz ve kilit hiç tetiklenmez.
      iban: "TR120006100519786457841399",
      ibanHolder: "Test Firma A.Ş.",
      ...over,
    },
  });
}

export async function makeUser(
  prisma: PrismaClient,
  companyId: string,
  roles: CompanyRole[] = [
    CompanyRole.SATIN_ALMACI,
    CompanyRole.SATISCI,
    CompanyRole.YONETICI,
  ],
  over: Partial<Prisma.CompanyUserUncheckedCreateInput> = {},
) {
  return prisma.companyUser.create({
    data: {
      companyId,
      email: `u-${uniq()}@test.local`,
      firstName: "Test",
      lastName: "User",
      roles,
      // Yetki tablosu: açık izin listesi rol hazır setinden (prod signup ile aynı).
      permissions: permissionsForRoles(roles),
      isActive: true,
      ...over,
    },
  });
}

/** Firma + sahibi (createdById için) + auth-user nesnesi bir arada. */
export async function makeCompanyWithUser(
  prisma: PrismaClient,
  opts: {
    country?: string;
    tier?: CompanyTier;
    roles?: CompanyRole[];
    name?: string;
    /** INV-KYC-1 kapı testleri için: UNVERIFIED/PENDING firma kur. Default VERIFIED. */
    companyVerificationStatus?: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  } = {},
) {
  const company = await makeCompany(prisma, {
    country: opts.country ?? "TR",
    tier: opts.tier ?? "GOLD",
    ...(opts.companyVerificationStatus
      ? { companyVerificationStatus: opts.companyVerificationStatus }
      : {}),
    ...(opts.name ? { name: opts.name } : {}),
  });
  // Faz R: SAHIP etikettir (op-izin vermez) — prod default'uyla aynı şekilde
  // Kurucu SA+ST op-rolleriyle kurulur; salt-okunur-Kurucu senaryoları
  // opts.roles=[SAHIP] ile açıkça kurar.
  const roles = opts.roles ?? [
    CompanyRole.SAHIP,
    CompanyRole.SATIN_ALMACI,
    CompanyRole.SATISCI,
  ];
  const user = await makeUser(prisma, company.id, roles);
  await prisma.company.update({
    where: { id: company.id },
    data: { ownerUserId: user.id },
  });
  company.ownerUserId = user.id;
  const auth: AuthenticatedCompanyUser = {
    userId: user.id,
    companyId: company.id,
    email: user.email,
    roles,
    // BİLİNÇLİ: auth nesnesine `permissions` YAZILMAZ — spec'ler persona'yı
    // `{ ...auth, roles: [...] }` ile türetir; liste boşken kapılar rol hazır
    // setine düşer (effectivePermissions geçiş emniyeti) ve rol-override
    // persona'ları anlamlı kalır. Açık liste isteyen spec `permissions` verir.
    country: company.country,
    tier: company.tier,
    // INV-KYC-1: auth objesi firmanın efektif doğrulama durumunu taşır (para
    // kapıları user.companyVerificationStatus okur). Factory default VERIFIED.
    companyVerificationStatus: company.companyVerificationStatus,
    isOwner: true,
  } as AuthenticatedCompanyUser;
  return { company, user, auth };
}

export async function makeListing(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    createdById: string;
    type?: ListingType;
    status?: ListingStatus;
    visibility?: ListingVisibility;
    format?: ListingFormat | null;
    isInternational?: boolean;
    targetCountries?: string[];
    requireBidDocument?: boolean;
    requireAllItems?: boolean;
    closesAt?: Date | null;
    bidsOpenAt?: Date | null;
  } & Partial<Prisma.ListingUncheckedCreateInput>,
) {
  const {
    companyId,
    createdById,
    type = "ALIM" as ListingType,
    ...rest
  } = opts;
  return prisma.listing.create({
    data: {
      companyId,
      createdById,
      type,
      title: `İhale ${uniq()}`,
      status: "OPEN",
      visibility: "PUBLIC",
      ...rest,
    },
  });
}

export async function makeItem(
  prisma: PrismaClient,
  listingId: string,
  over: Partial<Prisma.ListingItemUncheckedCreateInput> = {},
) {
  return prisma.listingItem.create({
    data: {
      listingId,
      lineNo: 1,
      name: `Kalem ${uniq()}`,
      quantity: new Prisma.Decimal(1),
      unit: "adet",
      ...over,
    },
  });
}

export async function makeBid(
  prisma: PrismaClient,
  opts: {
    listingId: string;
    bidderCompanyId: string;
    createdById: string;
    amount: number | string;
    currency?: string;
    status?: string;
    /** Geçerlilik senaryoları: submittedAt + validityDays → son geçerlilik. */
    submittedAt?: Date;
    validityDays?: number;
    /** Pazarlık tur senaryoları: teklifin turu + aktif gönderim turu. */
    round?: number;
    activeBidRound?: number;
    items?: {
      itemId: string;
      unitPrice: number | string;
      deliveryDate?: Date;
      note?: string;
    }[];
  },
) {
  const {
    items,
    amount,
    currency,
    status = "SUBMITTED",
    submittedAt,
    validityDays,
    ...rest
  } = opts;
  return prisma.listingBid.create({
    data: {
      ...rest,
      amount: new Prisma.Decimal(amount),
      ...(currency ? { currency: currency as never } : {}),
      ...(validityDays != null ? { validityDays } : {}),
      status: status as never,
      submittedAt: submittedAt ?? (status === "DRAFT" ? null : new Date()),
      ...(items
        ? {
            items: {
              create: items.map((i) => ({
                itemId: i.itemId,
                unitPrice: new Prisma.Decimal(i.unitPrice),
                ...(i.deliveryDate ? { deliveryDate: i.deliveryDate } : {}),
                ...(i.note ? { note: i.note } : {}),
              })),
            },
          }
        : {}),
    },
  });
}

/** İki firma arasında ACTIVE bağlantı (CONNECTIONS görünürlüğü için). */
export async function connect(
  prisma: PrismaClient,
  aId: string,
  bId: string,
  invitedById: string,
) {
  return prisma.companyConnection.create({
    data: {
      inviterCompanyId: aId,
      inviteeCompanyId: bId,
      invitedById,
      status: "ACTIVE",
    } as Prisma.CompanyConnectionUncheckedCreateInput,
  });
}

export async function invite(
  prisma: PrismaClient,
  listingId: string,
  invitedCompanyId: string,
  invitedById: string,
) {
  return prisma.listingInvitation.create({
    data: { listingId, invitedCompanyId, invitedById },
  });
}
