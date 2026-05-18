/**
 * Order workflow — supplier (tedarikçi) tarafı.
 *
 * State transitions:
 *   PENDING → ACCEPTED  (tedarikçi onaylar + bilgi girer)
 *   PENDING → REJECTED  (tedarikçi reddeder, sebep zorunlu)
 *   ACCEPTED → IN_DELIVERY (tedarikçi gönderim başlatır)
 * Multi-supplier scope: başka supplier'a ait order → 403
 */
import { TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupplierOrdersService } from "./services/supplier-orders.service";
import { EmailQueue } from "../email/email.queue";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import {
  createTenant,
  createUser,
  createSupplier,
  createSupplierUser,
  createTender,
  createBid,
  createOrder,
} from "../../../test/helpers/factories";

const flushMicrotasks = () => new Promise((r) => setImmediate(r));

async function setupSupplierOrder(prisma: any, status: any = "PENDING") {
  const tenant = await createTenant(prisma);
  const user = await createUser(prisma, tenant.id);
  const supplier = await createSupplier(prisma);
  const supplierUser = await createSupplierUser(prisma, supplier.id);
  const tender = await createTender(prisma, tenant.id, user.id, { status: "AWARDED" });
  const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
    status: "AWARDED_FULL",
  });
  const order = await createOrder(
    prisma,
    {
      tenantId: tenant.id,
      supplierId: supplier.id,
      tenderId: tender.id,
      bidId: bid.id,
    },
    { status },
  );
  return { tenant, user, supplier, supplierUser, tender, bid, order };
}

describe("SupplierOrdersService — supplier order state machine", () => {
  let moduleRef: TestingModule;
  let service: SupplierOrdersService;
  const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        SupplierOrdersService,
        { provide: EmailQueue, useValue: emailMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") },
        },
      ],
    });
    service = moduleRef.get(SupplierOrdersService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
  });

  describe("findOne — multi-supplier scope (IDOR)", () => {
    it("kendi siparişini görür", async () => {
      const { supplier, order } = await setupSupplierOrder(prisma);
      const found = await service.findOne(supplier.id, order.id);
      expect(found.id).toBe(order.id);
    });

    it("bilinmeyen id → 404", async () => {
      const supplier = await createSupplier(prisma);
      await expect(service.findOne(supplier.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("başka supplier'a ait order → 403", async () => {
      const { order } = await setupSupplierOrder(prisma);
      const intruder = await createSupplier(prisma);
      await expect(service.findOne(intruder.id, order.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("acceptOrder — PENDING → ACCEPTED", () => {
    const futureIso = () =>
      new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();

    it("happy path: PENDING → ACCEPTED + acceptedAt + alanlar", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);

      const updated = await service.acceptOrder(
        supplier.id,
        order.id,
        supplierUser.id,
        {
          expectedDeliveryDate: futureIso(),
          acceptedNote: "İki hafta içinde teslim",
          bankAccountHolder: "Demo Ltd.",
          bankIban: "TR00 0000 0000 0000 0000 0000 00",
          invoiceDate: futureIso(),
        },
      );

      expect(updated.status).toBe("ACCEPTED");
      expect(updated.acceptedAt).toBeInstanceOf(Date);
      expect(updated.acceptedNote).toBe("İki hafta içinde teslim");
      expect(updated.bankAccountHolder).toBe("Demo Ltd.");
      expect(updated.bankIban).toBe("TR00 0000 0000 0000 0000 0000 00");
      expect(updated.expectedDeliveryDate).toBeInstanceOf(Date);
      expect(updated.invoiceDate).toBeInstanceOf(Date);

      // Alıcıya `order_status_changed` (ACCEPTED) e-posta enqueue
      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("geçersiz expectedDeliveryDate → 400", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);
      await expect(
        service.acceptOrder(supplier.id, order.id, supplierUser.id, {
          expectedDeliveryDate: "not-a-date",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("geçmiş expectedDeliveryDate → 400", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);
      const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      await expect(
        service.acceptOrder(supplier.id, order.id, supplierUser.id, {
          expectedDeliveryDate: past,
        }),
      ).rejects.toThrow(/geçmişte/);
    });

    it("ACCEPTED'dan tekrar acceptOrder → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "ACCEPTED",
      );
      await expect(
        service.acceptOrder(supplier.id, order.id, supplierUser.id, {
          expectedDeliveryDate: futureIso(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("başka supplier acceptOrder → 403", async () => {
      const { supplierUser, order } = await setupSupplierOrder(prisma);
      const intruder = await createSupplier(prisma);
      await expect(
        service.acceptOrder(intruder.id, order.id, supplierUser.id, {
          expectedDeliveryDate: futureIso(),
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen orderId → 404", async () => {
      const supplier = await createSupplier(prisma);
      await expect(
        service.acceptOrder(supplier.id, "yok", "user-yok", {
          expectedDeliveryDate: futureIso(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("rejectOrder — PENDING → REJECTED", () => {
    it("happy path: PENDING → REJECTED + rejectReason", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);

      const updated = await service.rejectOrder(
        supplier.id,
        order.id,
        supplierUser.id,
        { reason: "Stoğumuzda yok, üretim takvimi dolu." },
      );

      expect(updated.status).toBe("REJECTED");
      expect(updated.rejectedAt).toBeInstanceOf(Date);
      expect(updated.rejectReason).toContain("Stoğumuzda");

      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("sebep <10 char → 400", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);
      await expect(
        service.rejectOrder(supplier.id, order.id, supplierUser.id, {
          reason: "kısa",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("ACCEPTED'dan rejectOrder → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "ACCEPTED",
      );
      await expect(
        service.rejectOrder(supplier.id, order.id, supplierUser.id, {
          reason: "Çok geç oldu, üretim dolu",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("başka supplier reject → 403", async () => {
      const { supplierUser, order } = await setupSupplierOrder(prisma);
      const intruder = await createSupplier(prisma);
      await expect(
        service.rejectOrder(intruder.id, order.id, supplierUser.id, {
          reason: "İlgisiz red sebebi 10+ karakter",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("startDelivery — ACCEPTED → IN_DELIVERY", () => {
    it("happy path: ACCEPTED → IN_DELIVERY + deliveryStartedAt", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "ACCEPTED",
      );

      const updated = await service.startDelivery(
        supplier.id,
        order.id,
        supplierUser.id,
        { deliveryNote: "Kargo MNG ile gönderildi" },
      );

      expect(updated.status).toBe("IN_DELIVERY");
      expect(updated.deliveryStartedAt).toBeInstanceOf(Date);
      expect(updated.deliveryNote).toBe("Kargo MNG ile gönderildi");

      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("PENDING'den startDelivery → 409 (önce ACCEPTED gerek)", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("IN_DELIVERY'den tekrar startDelivery → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "IN_DELIVERY",
      );
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("COMPLETED'dan startDelivery → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "COMPLETED",
      );
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("CANCELLED'dan startDelivery → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(
        prisma,
        "CANCELLED",
      );
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("başka supplier startDelivery → 403", async () => {
      const { supplierUser, order } = await setupSupplierOrder(prisma, "ACCEPTED");
      const intruder = await createSupplier(prisma);
      await expect(
        service.startDelivery(intruder.id, order.id, supplierUser.id, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it("bilinmeyen orderId → 404", async () => {
      const supplier = await createSupplier(prisma);
      await expect(
        service.startDelivery(supplier.id, "yok", "user-yok", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("list — filter + search + sort + pagination (supplier scope)", () => {
    async function seedSupplierOrders() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });

      const orderPending = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "PENDING", totalAmount: 200 },
      );
      const orderInDelivery = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "IN_DELIVERY", totalAmount: 600 },
      );
      const orderCompleted = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "COMPLETED", totalAmount: 100 },
      );
      return { tenant, supplier, orderPending, orderInDelivery, orderCompleted };
    }

    it("filtre yoksa tüm siparişleri döner (supplier scope)", async () => {
      const { supplier } = await seedSupplierOrders();
      const result = await service.list(supplier.id, {});
      expect(result.items.length).toBe(3);
      expect(result.pagination.total).toBe(3);
    });

    it("status=PENDING → sadece PENDING", async () => {
      const { supplier, orderPending } = await seedSupplierOrders();
      const result = await service.list(supplier.id, { status: "PENDING" });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.id).toBe(orderPending.id);
    });

    it("search=order no → eşleşme", async () => {
      const { supplier, orderPending } = await seedSupplierOrders();
      const result = await service.list(supplier.id, {
        search: orderPending.orderNumber.slice(0, 10),
      });
      expect(result.items.some((o) => o.id === orderPending.id)).toBe(true);
    });

    it("sort=totalAmount:desc", async () => {
      const { supplier } = await seedSupplierOrders();
      const result = await service.list(supplier.id, {
        sort: "totalAmount:desc",
      });
      const amounts = result.items.map((o) => Number(o.totalAmount));
      const sorted = [...amounts].sort((a, b) => b - a);
      expect(amounts).toEqual(sorted);
    });

    it("invalid sort → createdAt:desc fallback", async () => {
      const { supplier } = await seedSupplierOrders();
      const result = await service.list(supplier.id, { sort: "evil:hack" });
      expect(result.items.length).toBe(3); // fallback OK
    });

    it("pagination: pageSize=2", async () => {
      const { supplier } = await seedSupplierOrders();
      const result = await service.list(supplier.id, { page: 1, pageSize: 2 });
      expect(result.items.length).toBe(2);
      expect(result.pagination.total).toBe(3);
    });

    it("başka supplier'ın siparişleri sızmaz (multi-supplier scope)", async () => {
      await seedSupplierOrders();
      const intruder = await createSupplier(prisma);
      const result = await service.list(intruder.id, {});
      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it("tenantId filter → sadece o tenant'tan gelen siparişler", async () => {
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tenantA = await createTenant(prisma);
      const userA = await createUser(prisma, tenantA.id);
      const tenantB = await createTenant(prisma);
      const userB = await createUser(prisma, tenantB.id);
      const tenderA = await createTender(prisma, tenantA.id, userA.id, {
        status: "AWARDED",
      });
      const tenderB = await createTender(prisma, tenantB.id, userB.id, {
        status: "AWARDED",
      });
      const bidA = await createBid(prisma, tenderA.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });
      const bidB = await createBid(prisma, tenderB.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });
      await createOrder(prisma, {
        tenantId: tenantA.id,
        supplierId: supplier.id,
        tenderId: tenderA.id,
        bidId: bidA.id,
      });
      await createOrder(prisma, {
        tenantId: tenantB.id,
        supplierId: supplier.id,
        tenderId: tenderB.id,
        bidId: bidB.id,
      });
      const result = await service.list(supplier.id, { tenantId: tenantA.id });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.tenantId).toBe(tenantA.id);
    });

    it("range=7d → eski siparişler elendi", async () => {
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const tender = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      const bid = await createBid(prisma, tender.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });
      // Bugün ve 30 gün önce 2 sipariş
      await createOrder(prisma, {
        tenantId: tenant.id,
        supplierId: supplier.id,
        tenderId: tender.id,
        bidId: bid.id,
      });
      await prisma.order.create({
        data: {
          orderNumber: `ORD-old-${Date.now()}`,
          tenantId: tenant.id,
          supplierId: supplier.id,
          tenderId: tender.id,
          bidId: bid.id,
          status: "PENDING",
          currency: "TRY",
          totalAmount: 25,
          createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        },
      });
      const result = await service.list(supplier.id, { range: "7d" });
      expect(result.items.length).toBe(1);
    });
  });

  describe("counterparts — distinct alıcı (tenant) listesi", () => {
    it("siparişi olan tenant'lar döner, orderCount azalan", async () => {
      const supplier = await createSupplier(prisma);
      const supplierUser = await createSupplierUser(prisma, supplier.id);
      const tenantA = await createTenant(prisma, { name: "Alıcı A" });
      const userA = await createUser(prisma, tenantA.id);
      const tenantB = await createTenant(prisma, { name: "Alıcı B" });
      const userB = await createUser(prisma, tenantB.id);
      const tenderA = await createTender(prisma, tenantA.id, userA.id, {
        status: "AWARDED",
      });
      const tenderB = await createTender(prisma, tenantB.id, userB.id, {
        status: "AWARDED",
      });
      const bidA = await createBid(prisma, tenderA.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });
      const bidB = await createBid(prisma, tenderB.id, supplier.id, supplierUser.id, {
        status: "AWARDED_FULL",
      });
      // A: 2 sipariş, B: 1 sipariş
      await createOrder(prisma, {
        tenantId: tenantA.id,
        supplierId: supplier.id,
        tenderId: tenderA.id,
        bidId: bidA.id,
      });
      await createOrder(prisma, {
        tenantId: tenantA.id,
        supplierId: supplier.id,
        tenderId: tenderA.id,
        bidId: bidA.id,
      });
      await createOrder(prisma, {
        tenantId: tenantB.id,
        supplierId: supplier.id,
        tenderId: tenderB.id,
        bidId: bidB.id,
      });
      const result = await service.counterparts(supplier.id);
      expect(result.length).toBe(2);
      expect(result[0]?.name).toBe("Alıcı A");
      expect(result[0]?.orderCount).toBe(2);
      expect(result[1]?.orderCount).toBe(1);
    });

    it("siparişi olmayan supplier → boş array", async () => {
      const supplier = await createSupplier(prisma);
      const result = await service.counterparts(supplier.id);
      expect(result).toEqual([]);
    });
  });

  describe("stats", () => {
    it("kendi supplier scope'unda tüm statüleri sayar", async () => {
      const { supplier, tenant, tender, bid } = await setupSupplierOrder(
        prisma,
        "PENDING",
      );
      await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "ACCEPTED" },
      );
      await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "IN_DELIVERY" },
      );
      await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "COMPLETED" },
      );
      await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "REJECTED" },
      );

      const stats = await service.stats(supplier.id);
      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.inDelivery).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.rejected).toBe(1);
    });

    it("başka supplier siparişleri sızmaz", async () => {
      await setupSupplierOrder(prisma);
      const intruder = await createSupplier(prisma);
      const stats = await service.stats(intruder.id);
      expect(stats.total).toBe(0);
    });
  });
});
