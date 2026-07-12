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
      tier: "PAKET" as CompanyTier,
      isActive: true,
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
  } = {},
) {
  const company = await makeCompany(prisma, {
    country: opts.country ?? "TR",
    tier: opts.tier ?? "PAKET",
    ...(opts.name ? { name: opts.name } : {}),
  });
  // Gerçek model: Kurucu (SAHIP) tam yetkilidir — tek başına, ek op-rol yok.
  const roles = opts.roles ?? [CompanyRole.SAHIP];
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
    country: company.country,
    tier: company.tier,
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
    items?: { itemId: string; unitPrice: number | string }[];
  },
) {
  const { items, amount, currency, status = "SUBMITTED", ...rest } = opts;
  return prisma.listingBid.create({
    data: {
      ...rest,
      amount: new Prisma.Decimal(amount),
      ...(currency ? { currency: currency as never } : {}),
      status: status as never,
      submittedAt: status === "DRAFT" ? null : new Date(),
      ...(items
        ? {
            items: {
              create: items.map((i) => ({
                itemId: i.itemId,
                unitPrice: new Prisma.Decimal(i.unitPrice),
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
