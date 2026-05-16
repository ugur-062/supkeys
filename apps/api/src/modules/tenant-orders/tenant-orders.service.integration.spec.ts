/**
 * V1.5 Order workflow — buyer (tenant) tarafı.
 *
 * State machine:
 *   PENDING → IN_DELIVERY (supplier startDelivery — bu testin scope dışı)
 *   IN_DELIVERY → COMPLETED (buyer completeOrder)
 *   PENDING|IN_DELIVERY → CANCELLED (buyer cancelOrder)
 *   COMPLETED|CANCELLED → 409 (final state)
 *
 * Multi-tenant scope: başka tenant'a ait order → 404 + 403 (önce 404, sonra 403)
 */
import { TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TenantOrdersService } from "./services/tenant-orders.service";
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

/** Servis fire-and-forget e-posta gönderir (setImmediate). Test'te bekle. */
const flushMicrotasks = () => new Promise((r) => setImmediate(r));

async function setupOrder(prisma: any, status: any = "PENDING") {
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

describe("TenantOrdersService — buyer order state machine", () => {
  let moduleRef: TestingModule;
  let service: TenantOrdersService;
  // EmailQueue mock — gerçek BullMQ bağlantısı yok
  const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        TenantOrdersService,
        { provide: EmailQueue, useValue: emailMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") },
        },
      ],
    });
    service = moduleRef.get(TenantOrdersService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
  });

  describe("findOne — multi-tenant scope", () => {
    it("kendi siparişini görür", async () => {
      const { tenant, order } = await setupOrder(prisma);
      const found = await service.findOne(tenant.id, order.id);
      expect(found.id).toBe(order.id);
    });

    it("bilinmeyen orderId → 404", async () => {
      const tenant = await createTenant(prisma);
      await expect(service.findOne(tenant.id, "yok")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("başka tenant'a ait order → 403 (IDOR koruması)", async () => {
      const { order } = await setupOrder(prisma);
      const intruder = await createTenant(prisma);
      await expect(service.findOne(intruder.id, order.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("completeOrder — IN_DELIVERY → COMPLETED", () => {
    it("happy path: IN_DELIVERY → COMPLETED + completedAt + completedBy + note", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "IN_DELIVERY");

      const updated = await service.completeOrder(tenant.id, order.id, user.id, {
        completedNote: "Eksiksiz teslim alındı",
      });

      expect(updated.status).toBe("COMPLETED");
      expect(updated.completedAt).toBeInstanceOf(Date);
      expect(updated.completedById).toBe(user.id);
      expect(updated.completedNote).toBe("Eksiksiz teslim alındı");
      // Tedarikçiye `order_status_changed` enqueue (fire-and-forget)
      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("not opsiyonel — boş gönderilirse null kalır", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "IN_DELIVERY");
      const updated = await service.completeOrder(tenant.id, order.id, user.id, {});
      expect(updated.status).toBe("COMPLETED");
      expect(updated.completedNote).toBeNull();
    });

    it("PENDING state'ten complete → 409 (sadece IN_DELIVERY)", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "PENDING");

      await expect(
        service.completeOrder(tenant.id, order.id, user.id, {}),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.completeOrder(tenant.id, order.id, user.id, {}),
      ).rejects.toThrow("Sadece IN_DELIVERY");
    });

    it("COMPLETED state'ten tekrar complete → 409", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "COMPLETED");
      await expect(
        service.completeOrder(tenant.id, order.id, user.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("CANCELLED state'ten complete → 409", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "CANCELLED");
      await expect(
        service.completeOrder(tenant.id, order.id, user.id, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant complete → 403", async () => {
      const { user, order } = await setupOrder(prisma, "IN_DELIVERY");
      const intruder = await createTenant(prisma);
      await expect(
        service.completeOrder(intruder.id, order.id, user.id, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("cancelOrder — PENDING|IN_DELIVERY → CANCELLED", () => {
    it("PENDING → CANCELLED (sebep dolu)", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "PENDING");

      const updated = await service.cancelOrder(tenant.id, order.id, user.id, {
        reason: "Tedarikçi süreyi geçirdi — iptal ediyoruz",
      });

      expect(updated.status).toBe("CANCELLED");
      expect(updated.cancelledAt).toBeInstanceOf(Date);
      expect(updated.cancelledById).toBe(user.id);
      expect(updated.cancelReason).toContain("Tedarikçi süreyi geçirdi");
      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("IN_DELIVERY → CANCELLED", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "IN_DELIVERY");
      const updated = await service.cancelOrder(tenant.id, order.id, user.id, {
        reason: "Teslimat sırasında ürün hasarlı geldi",
      });
      expect(updated.status).toBe("CANCELLED");
    });

    it("COMPLETED → 409 (final state)", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "COMPLETED");
      await expect(
        service.cancelOrder(tenant.id, order.id, user.id, {
          reason: "Sonradan iptal denemesi",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("CANCELLED → 409 (tekrar iptal)", async () => {
      const { tenant, user, order } = await setupOrder(prisma, "CANCELLED");
      await expect(
        service.cancelOrder(tenant.id, order.id, user.id, {
          reason: "Tekrar iptal denemesi",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("başka tenant cancel → 403", async () => {
      const { user, order } = await setupOrder(prisma);
      const intruder = await createTenant(prisma);
      await expect(
        service.cancelOrder(intruder.id, order.id, user.id, {
          reason: "Yetkisiz iptal denemesi (>=10 char)",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("list — filter + search + sort + pagination", () => {
    async function seedMultipleOrders() {
      const tenant = await createTenant(prisma);
      const user = await createUser(prisma, tenant.id);
      const supplierA = await createSupplier(prisma, {
        companyName: "Alfa Tedarik",
      });
      const supplierAUser = await createSupplierUser(prisma, supplierA.id);
      const supplierB = await createSupplier(prisma, {
        companyName: "Beta Şirket",
      });
      const supplierBUser = await createSupplierUser(prisma, supplierB.id);

      const tenderA = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      const tenderB = await createTender(prisma, tenant.id, user.id, {
        status: "AWARDED",
      });
      const bidA = await createBid(prisma, tenderA.id, supplierA.id, supplierAUser.id, {
        status: "AWARDED_FULL",
      });
      const bidB = await createBid(prisma, tenderB.id, supplierB.id, supplierBUser.id, {
        status: "AWARDED_FULL",
      });

      const orderPending = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplierA.id, tenderId: tenderA.id, bidId: bidA.id },
        { status: "PENDING", totalAmount: 500 },
      );
      const orderInDelivery = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplierB.id, tenderId: tenderB.id, bidId: bidB.id },
        { status: "IN_DELIVERY", totalAmount: 1000 },
      );
      const orderCompleted = await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplierA.id, tenderId: tenderA.id, bidId: bidA.id },
        { status: "COMPLETED", totalAmount: 200 },
      );

      return {
        tenant,
        supplierA,
        supplierB,
        orderPending,
        orderInDelivery,
        orderCompleted,
      };
    }

    it("filtre yoksa tüm siparişleri döner", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, {});
      expect(result.items.length).toBe(3);
      expect(result.pagination.total).toBe(3);
    });

    it("status=PENDING → sadece PENDING", async () => {
      const { tenant, orderPending } = await seedMultipleOrders();
      const result = await service.list(tenant.id, { status: "PENDING" });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.id).toBe(orderPending.id);
    });

    it("supplierId filtresi → sadece o supplier'ın siparişleri", async () => {
      const { tenant, supplierA } = await seedMultipleOrders();
      const result = await service.list(tenant.id, { supplierId: supplierA.id });
      expect(result.items.length).toBe(2); // pending + completed (A)
      expect(result.items.every((o) => o.supplier.companyName === "Alfa Tedarik")).toBe(true);
    });

    it("search=Alfa → şirket adına göre filtre", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, { search: "Alfa" });
      expect(result.items.length).toBe(2);
    });

    it("search=ORD- → sipariş no eşleşmesi", async () => {
      const { tenant, orderPending } = await seedMultipleOrders();
      const result = await service.list(tenant.id, {
        search: orderPending.orderNumber.slice(0, 10),
      });
      expect(result.items.some((o) => o.id === orderPending.id)).toBe(true);
    });

    it("sort=totalAmount:desc → büyükten küçüğe", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, {
        sort: "totalAmount:desc",
      });
      const amounts = result.items.map((o) => Number(o.totalAmount));
      const sorted = [...amounts].sort((a, b) => b - a);
      expect(amounts).toEqual(sorted);
    });

    it("sort=totalAmount:asc → küçükten büyüğe", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, {
        sort: "totalAmount:asc",
      });
      const amounts = result.items.map((o) => Number(o.totalAmount));
      const sorted = [...amounts].sort((a, b) => a - b);
      expect(amounts).toEqual(sorted);
    });

    it("invalid sort string → createdAt:desc fallback (kırılmaz)", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, {
        sort: "invalid:nonexistent",
      });
      expect(result.items.length).toBe(3); // fallback doğru çalışır
    });

    it("pagination: pageSize=2 → 2 item + total=3 + page=1", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, { page: 1, pageSize: 2 });
      expect(result.items.length).toBe(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
    });

    it("pagination: page=2 → kalan 1 item", async () => {
      const { tenant } = await seedMultipleOrders();
      const result = await service.list(tenant.id, { page: 2, pageSize: 2 });
      expect(result.items.length).toBe(1);
    });
  });

  describe("stats — agregasyon", () => {
    it("boş tenant → tümü 0", async () => {
      const tenant = await createTenant(prisma);
      const stats = await service.stats(tenant.id);
      expect(stats).toEqual({
        total: 0,
        pending: 0,
        inDelivery: 0,
        completed: 0,
        cancelled: 0,
      });
    });

    it("karışık siparişler doğru sayılır", async () => {
      const { tenant, supplier, tender, bid } = await setupOrder(prisma, "PENDING");
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
        { status: "COMPLETED" },
      );

      const stats = await service.stats(tenant.id);
      expect(stats).toEqual({
        total: 4,
        pending: 1,
        inDelivery: 1,
        completed: 2,
        cancelled: 0,
      });
    });

    it("başka tenant'ın siparişleri stats'a sızmaz", async () => {
      await setupOrder(prisma, "PENDING");
      const intruder = await createTenant(prisma);
      const stats = await service.stats(intruder.id);
      expect(stats.total).toBe(0);
    });
  });
});
