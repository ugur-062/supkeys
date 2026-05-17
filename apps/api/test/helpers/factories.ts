/**
 * Test factory'leri — minimum required field'larla DB'ye nesne yazar.
 * Her factory `overrides` parametresi alır; null/undefined göndererek default
 * davranışı override edebilirsin.
 *
 * Convention:
 *   - `email` ve `slug` unique olduğu için her çağrıda epoch + counter suffix.
 *   - bcrypt cost factor düşürülmedi — gerçek auth davranışını test ediyoruz.
 */
import type {
  PrismaClient,
  Tenant,
  User,
  PlatformAdmin,
  Supplier,
  SupplierUser,
  Tender,
  Bid,
  Order,
  Category,
} from "@supkeys/db";
import * as bcrypt from "bcrypt";

const HASH_ROUNDS = 4; // test'te 12 yavaş — sadece test ortamı

let counter = 0;
const uniq = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

export async function hashPwd(plain: string): Promise<string> {
  return bcrypt.hash(plain, HASH_ROUNDS);
}

// ----------------------------------------------------------------------------
// Tenant + User
// ----------------------------------------------------------------------------

export async function createTenant(
  prisma: PrismaClient,
  overrides: Partial<Tenant> = {},
): Promise<Tenant> {
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? `Test Firma ${uniq("t")}`,
      slug: overrides.slug ?? uniq("test-firma"),
      isActive: overrides.isActive ?? true,
      industry: overrides.industry ?? null,
      city: overrides.city ?? "Istanbul",
      district: overrides.district ?? "Ataşehir",
      addressLine: overrides.addressLine ?? "Test Mahallesi 1",
      taxNumber: overrides.taxNumber ?? null,
      taxOffice: overrides.taxOffice ?? null,
    },
  });
}

export async function createUser(
  prisma: PrismaClient,
  tenantId: string,
  overrides: Partial<User> & { password?: string } = {},
): Promise<User & { plaintextPassword: string }> {
  const password = overrides.password ?? "Test1234";
  const passwordHash = overrides.passwordHash ?? (await hashPwd(password));
  const created = await prisma.user.create({
    data: {
      email: overrides.email ?? `${uniq("user")}@test.local`,
      passwordHash,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      role: overrides.role ?? "COMPANY_ADMIN",
      isActive: overrides.isActive ?? true,
      phone: overrides.phone ?? null,
      tenantId,
      ...(overrides.permissionsOverride !== undefined
        ? { permissionsOverride: overrides.permissionsOverride }
        : {}),
    },
  });
  return Object.assign(created, { plaintextPassword: password });
}

// ----------------------------------------------------------------------------
// PlatformAdmin
// ----------------------------------------------------------------------------

export async function createPlatformAdmin(
  prisma: PrismaClient,
  overrides: Partial<PlatformAdmin> & { password?: string } = {},
): Promise<PlatformAdmin & { plaintextPassword: string }> {
  const password = overrides.password ?? "Admin1234";
  const passwordHash = overrides.passwordHash ?? (await hashPwd(password));
  const created = await prisma.platformAdmin.create({
    data: {
      email: overrides.email ?? `${uniq("admin")}@supkeys.test`,
      passwordHash,
      firstName: overrides.firstName ?? "Admin",
      lastName: overrides.lastName ?? "Test",
      role: overrides.role ?? "SUPER_ADMIN",
      isActive: overrides.isActive ?? true,
    },
  });
  return Object.assign(created, { plaintextPassword: password });
}

// ----------------------------------------------------------------------------
// Supplier + SupplierUser
// ----------------------------------------------------------------------------

export async function createSupplier(
  prisma: PrismaClient,
  overrides: Partial<Supplier> = {},
): Promise<Supplier> {
  return prisma.supplier.create({
    data: {
      companyName: overrides.companyName ?? `Test Tedarikçi ${uniq("s")}`,
      companyType: overrides.companyType ?? "LIMITED",
      taxNumber: overrides.taxNumber ?? `${Date.now()}${counter++}`.slice(-10),
      taxOffice: overrides.taxOffice ?? "Kadıköy",
      taxCertUrl: overrides.taxCertUrl ?? "data:application/pdf;base64,test",
      city: overrides.city ?? "Istanbul",
      district: overrides.district ?? "Kadıköy",
      addressLine: overrides.addressLine ?? "Test cad. 1",
      isActive: overrides.isActive ?? true,
      isBlocked: overrides.isBlocked ?? false,
      membership: overrides.membership ?? "STANDARD",
    },
  });
}

export async function createSupplierUser(
  prisma: PrismaClient,
  supplierId: string,
  overrides: Partial<SupplierUser> & { password?: string } = {},
): Promise<SupplierUser & { plaintextPassword: string }> {
  const password = overrides.password ?? "Test1234";
  const passwordHash = overrides.passwordHash ?? (await hashPwd(password));
  const created = await prisma.supplierUser.create({
    data: {
      email: overrides.email ?? `${uniq("supplier-user")}@test.local`,
      passwordHash,
      firstName: overrides.firstName ?? "Tedarikçi",
      lastName: overrides.lastName ?? "Kullanıcı",
      isActive: overrides.isActive ?? true,
      supplierId,
    },
  });
  return Object.assign(created, { plaintextPassword: password });
}

// ----------------------------------------------------------------------------
// Tender + Bid + Order
// ----------------------------------------------------------------------------

interface CreateTenderOpts {
  status?: Tender["status"];
  bidsCloseAt?: Date;
  primaryCurrency?: Tender["primaryCurrency"];
  items?: { quantity: number; targetUnitPrice?: number | null; name?: string }[];
}

export async function createTender(
  prisma: PrismaClient,
  tenantId: string,
  createdByUserId: string,
  opts: CreateTenderOpts = {},
): Promise<Tender> {
  // Tender numarası kendi auto-gen değil — manuel uniq.
  const tenderNumber = `SUPK-2026-${String(counter++).padStart(4, "0")}-${Date.now() % 100000}`;
  const closesAt = opts.bidsCloseAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);

  return prisma.tender.create({
    data: {
      tenantId,
      tenderNumber,
      title: `Test İhale ${uniq("ihale")}`,
      type: "RFQ",
      status: opts.status ?? "DRAFT",
      primaryCurrency: opts.primaryCurrency ?? "TRY",
      bidsCloseAt: closesAt,
      createdById: createdByUserId,
      items: {
        create: (opts.items ?? [{ quantity: 10, targetUnitPrice: 100, name: "Test Kalem" }]).map(
          (item, idx) => ({
            name: item.name ?? `Kalem ${idx + 1}`,
            quantity: item.quantity,
            targetUnitPrice: item.targetUnitPrice ?? null,
            unit: "ADET",
            orderIndex: idx + 1,
          }),
        ),
      },
    },
  });
}

/**
 * Test için minimal 4-level UNSPSC tree oluşturur.
 * Döner: { segment, family, klass, commodity } — id'ler ve level'lar set.
 */
export async function createCategoryTree(
  prisma: PrismaClient,
  opts: { segmentLetter?: string; baseCode?: number } = {},
): Promise<{
  segment: Category;
  family: Category;
  klass: Category;
  commodity: Category;
}> {
  const baseCode = opts.baseCode ?? 10000000 + counter * 1000;
  const segment = await prisma.category.create({
    data: {
      code: `${baseCode}-S-${counter++}`,
      nameTr: `Test Segment ${counter}`,
      level: 1,
      segmentLetter: opts.segmentLetter ?? "A",
      sortOrder: counter,
    },
  });
  const family = await prisma.category.create({
    data: {
      code: `${baseCode}-F-${counter++}`,
      nameTr: `Test Family ${counter}`,
      level: 2,
      parentId: segment.id,
      sortOrder: counter,
    },
  });
  const klass = await prisma.category.create({
    data: {
      code: `${baseCode}-C-${counter++}`,
      nameTr: `Test Class ${counter}`,
      level: 3,
      parentId: family.id,
      sortOrder: counter,
    },
  });
  const commodity = await prisma.category.create({
    data: {
      code: `${baseCode}-CM-${counter++}`,
      nameTr: `Test Commodity ${counter}`,
      level: 4,
      parentId: klass.id,
      sortOrder: counter,
    },
  });
  return { segment, family, klass, commodity };
}

/**
 * TenderInvitation oluşturur (supplier-tenders submit'in 403 check'ini geçmesi için şart).
 */
export async function inviteSupplierToTender(
  prisma: PrismaClient,
  tenderId: string,
  supplierId: string,
): Promise<void> {
  await prisma.tenderInvitation.create({
    data: { tenderId, supplierId },
  });
}

/**
 * Sadece ApprovalFlow + initiator + steps oluşturur (request YOK).
 * findMatchAndCreate testleri için: hem eşleşme hem null path'leri.
 */
export async function createApprovalFlow(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    createdById: string;
    initiatorUserIds: string[];
    steps: { approverUserId: string; conditionMinAmount?: number | null }[];
    type?: "TENDER_PUBLISH" | "TENDER_AWARD";
    status?: "DRAFT" | "ACTIVE" | "PASSIVE";
  },
): Promise<string> {
  const flow = await prisma.approvalFlow.create({
    data: {
      tenantId: args.tenantId,
      flowNumber: 10001 + counter++,
      name: `Test Flow ${counter}`,
      type: args.type ?? "TENDER_PUBLISH",
      status: args.status ?? "ACTIVE",
      createdById: args.createdById,
      initiators: {
        create: args.initiatorUserIds.map((uid) => ({ userId: uid })),
      },
      steps: {
        create: args.steps.map((s, idx) => ({
          orderIndex: idx + 1,
          approverUserId: s.approverUserId,
          conditionMinAmount: s.conditionMinAmount ?? null,
        })),
      },
    },
  });
  return flow.id;
}

/**
 * Approval flow + active rule + pending request for a tender.
 * Test'lerin approval cancel/reject/approve davranışını kontrol etmesi için.
 */
export async function createApprovalRequest(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    createdById: string; // user — both flow ve request initiator
    approverUserId: string;
    tenderId: string;
    amount?: number;
  },
): Promise<{ flowId: string; requestId: string; stepId: string }> {
  const flow = await prisma.approvalFlow.create({
    data: {
      tenantId: args.tenantId,
      flowNumber: 10001 + counter++,
      name: `Test Akışı ${counter}`,
      type: "TENDER_PUBLISH",
      status: "ACTIVE",
      createdById: args.createdById,
      steps: {
        create: [
          {
            orderIndex: 1,
            approverUserId: args.approverUserId,
          },
        ],
      },
    },
    include: { steps: true },
  });

  const approvalNumber = `APR-2026-${String(counter++).padStart(4, "0")}`;
  const req = await prisma.approvalRequest.create({
    data: {
      tenantId: args.tenantId,
      flowId: flow.id,
      type: "TENDER_PUBLISH",
      tenderId: args.tenderId,
      status: "PENDING",
      amount: args.amount ?? 25000,
      currency: "TRY",
      approvalNumber,
      initiatedById: args.createdById,
      steps: {
        create: [
          {
            flowStepId: flow.steps[0]!.id,
            approverUserId: args.approverUserId,
            status: "PENDING",
            orderIndex: 1,
          },
        ],
      },
    },
    include: { steps: true },
  });

  return { flowId: flow.id, requestId: req.id, stepId: req.steps[0]!.id };
}

interface CreateBidOpts {
  status?: Bid["status"];
  currency?: Bid["currency"];
  version?: number;
  totalAmount?: number;
  items?: {
    tenderItemId: string;
    unitPrice: number;
    quantity?: number;
  }[];
}

interface CreateOrderOpts {
  status?: Order["status"];
  totalAmount?: number;
  currency?: Order["currency"];
}

/**
 * Düşük seviyeli Order helper'ı — Tender + Bid (winning) varlığını şart koşar.
 * Test'in setup'ında `createTender + createBid` çağrılmış olmalı.
 */
export async function createOrder(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    supplierId: string;
    tenderId: string;
    bidId: string;
  },
  opts: CreateOrderOpts = {},
): Promise<Order> {
  const orderNumber = `ORD-2026-${String(counter++).padStart(4, "0")}-${Date.now() % 100000}`;
  return prisma.order.create({
    data: {
      orderNumber,
      tenderId: args.tenderId,
      tenantId: args.tenantId,
      supplierId: args.supplierId,
      bidId: args.bidId,
      status: opts.status ?? "PENDING",
      totalAmount: opts.totalAmount ?? 1000,
      currency: opts.currency ?? "TRY",
    },
  });
}

export async function createBid(
  prisma: PrismaClient,
  tenderId: string,
  supplierId: string,
  supplierUserId: string,
  opts: CreateBidOpts = {},
): Promise<Bid> {
  const currency = opts.currency ?? "TRY";
  const totalAmount =
    opts.totalAmount ??
    (opts.items?.reduce((sum, i) => sum + i.unitPrice * (i.quantity ?? 1), 0) ?? 100);

  return prisma.bid.create({
    data: {
      tenderId,
      supplierId,
      submittedById: supplierUserId,
      status: opts.status ?? "DRAFT",
      currency,
      totalAmount,
      version: opts.version ?? 1,
      items: opts.items
        ? {
            create: opts.items.map((it) => ({
              tenderItemId: it.tenderItemId,
              unitPrice: it.unitPrice,
              totalPrice: it.unitPrice * (it.quantity ?? 1),
              currency,
            })),
          }
        : undefined,
    },
  });
}
