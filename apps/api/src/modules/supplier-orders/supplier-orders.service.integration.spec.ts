/**
 * V1.5 Order workflow — supplier (tedarikçi) tarafı.
 *
 * State transition: PENDING → IN_DELIVERY (sadece supplier başlatabilir)
 * Multi-supplier scope: başka supplier'a ait order → 403
 */
import { TestingModule } from "@nestjs/testing";
import {
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

  describe("startDelivery — PENDING → IN_DELIVERY", () => {
    it("happy path: PENDING → IN_DELIVERY + deliveryStartedAt + note", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);

      const updated = await service.startDelivery(
        supplier.id,
        order.id,
        supplierUser.id,
        { deliveryNote: "Kargo MNG ile gönderildi" },
      );

      expect(updated.status).toBe("IN_DELIVERY");
      expect(updated.deliveryStartedAt).toBeInstanceOf(Date);
      expect(updated.deliveryNote).toBe("Kargo MNG ile gönderildi");

      // Alıcıya `order_status_changed` (IN_DELIVERY) e-posta enqueue
      await flushMicrotasks();
      expect(emailMock.enqueue).toHaveBeenCalled();
    });

    it("expectedDeliveryDate parse + persist", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);

      const futureIso = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
      const updated = await service.startDelivery(
        supplier.id,
        order.id,
        supplierUser.id,
        { expectedDeliveryDate: futureIso },
      );
      expect(updated.expectedDeliveryDate).toBeInstanceOf(Date);
    });

    it("geçersiz expectedDeliveryDate (invalid string) → 409", async () => {
      const { supplier, supplierUser, order } = await setupSupplierOrder(prisma);
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {
          expectedDeliveryDate: "not-a-date",
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.startDelivery(supplier.id, order.id, supplierUser.id, {
          expectedDeliveryDate: "not-a-date",
        }),
      ).rejects.toThrow("Geçersiz tahmini teslim tarihi");
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
      const { supplierUser, order } = await setupSupplierOrder(prisma);
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
  });

  describe("stats", () => {
    it("kendi supplier scope'unda sayar", async () => {
      const { supplier, tenant, tender, bid } = await setupSupplierOrder(
        prisma,
        "PENDING",
      );
      await createOrder(
        prisma,
        { tenantId: tenant.id, supplierId: supplier.id, tenderId: tender.id, bidId: bid.id },
        { status: "COMPLETED" },
      );

      const stats = await service.stats(supplier.id);
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
    });

    it("başka supplier siparişleri sızmaz", async () => {
      await setupSupplierOrder(prisma);
      const intruder = await createSupplier(prisma);
      const stats = await service.stats(intruder.id);
      expect(stats.total).toBe(0);
    });
  });
});
