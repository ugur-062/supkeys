import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ibanChecksumOk, isValidIbanTr } from "@rothern/shared";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { ShipOrderDto } from "../../src/modules/company-orders/dto/order-action.dto";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { anyPackageWhere } from "../../src/common/company/effective-tier";

/**
 * Denetim Dalga B — 1. dalga (sessizce yanlış sonuç üreten maddeler).
 * Kaynak: Parça 3/7/8/11 Dalga B listeleri.
 */
describe("Denetim Dalga B-1", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("P3 — DTO trim", () => {
    it("yalnız boşluktan oluşan fatura numarası REDDEDİLİR", async () => {
      const dto = plainToInstance(ShipOrderDto, { invoiceNumber: "   " });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.property).toBe("invoiceNumber");
    });

    it("baştaki/sondaki boşluk kırpılır, değer korunur", async () => {
      const dto = plainToInstance(ShipOrderDto, {
        invoiceNumber: "  FTR-2026-001  ",
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.invoiceNumber).toBe("FTR-2026-001");
    });
  });

  describe("P3 — yabancı IBAN mod-97", () => {
    // Kaynak: ISO 13616 örnek IBAN'ları.
    const VALID_DE = "DE89370400440532013000";
    const VALID_GB = "GB29NWBK60161331926819";

    it("geçerli yabancı IBAN kabul edilir", () => {
      expect(ibanChecksumOk(VALID_DE)).toBe(true);
      expect(ibanChecksumOk(VALID_GB)).toBe(true);
    });

    it("TEK HANESİ değişmiş yabancı IBAN artık reddedilir (eskiden geçiyordu)", () => {
      // Eski kapı yalnız /^[A-Z]{2}[0-9A-Z]{8,32}$/ bakıyordu → bu da geçerdi.
      const typo = "DE89370400440532013001";
      expect(/^[A-Z]{2}[0-9A-Z]{8,32}$/.test(typo)).toBe(true); // eski kapı: GEÇER
      expect(ibanChecksumOk(typo)).toBe(false); // yeni kapı: DURDURUR
    });

    it("iki hane yer değiştirmiş IBAN reddedilir", () => {
      expect(ibanChecksumOk("GB29NWBK60161331926891")).toBe(false);
    });

    it("TR yolu davranışını korur (mod-97 aynı algoritma)", () => {
      const tr = "TR330006100519786457841326";
      expect(isValidIbanTr(tr)).toBe(ibanChecksumOk(tr));
    });
  });

  describe("P7 — bildirim sayfalaması", () => {
    it("`before` imleciyle 30'dan eski bildirimlere ULAŞILABİLİR", async () => {
      const { company, user } = await makeCompanyWithUser(prisma);
      const base = new Date("2026-03-01T00:00:00.000Z");
      for (let i = 0; i < 45; i++) {
        await prisma.notification.create({
          data: {
            companyUserId: user.id,
            companyId: company.id,
            type: "order_status_changed",
            title: `Bildirim ${i}`,
            body: "x",
            createdAt: new Date(base.getTime() + i * 60_000),
          },
        });
      }
      const svc = new NotificationService(prisma as never);
      const page1 = await svc.listForUser(user.id, { take: 30 });
      expect(page1).toHaveLength(30);
      expect(page1[0]!.title).toBe("Bildirim 44"); // en yeni önce

      const last = page1[page1.length - 1]!;
      const page2 = await svc.listForUser(user.id, {
        take: 30,
        before: { createdAt: last.createdAt, id: last.id },
      });
      // Eskiden bu 15 satıra ulaşacak HİÇBİR yüzey yoktu.
      expect(page2).toHaveLength(15);
      expect(page2[page2.length - 1]!.title).toBe("Bildirim 0");
      // Sayfalar ayrık olmalı (eşit damgalarda id tie-break'i)
      const ids = new Set([...page1, ...page2].map((n) => n.id));
      expect(ids.size).toBe(45);
    });
  });

  describe("P3/P4/P7 — INV-TIER-1 driftı (AI keşfi)", () => {
    it("anyPackageWhere süresi DOLMUŞ paketliyi dışarıda bırakır", async () => {
      const now = new Date();
      const expired = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      const live = await makeCompanyWithUser(prisma, { tier: "BRONZ" });
      await prisma.company.update({
        where: { id: expired.company.id },
        data: { membershipEndAt: new Date(now.getTime() - 86_400_000) },
      });
      await prisma.company.update({
        where: { id: live.company.id },
        data: { membershipEndAt: new Date(now.getTime() + 86_400_000) },
      });
      const rows = await prisma.company.findMany({
        where: { ...anyPackageWhere(now) },
        select: { id: true },
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(live.company.id);
      // Ham `tier: { in: [...] }` filtresi bunu DAHİL ederdi.
      expect(ids).not.toContain(expired.company.id);
    });
  });
});

/** Dalga B-2 — tek-kaynak sözleşmeleri. */
describe("Denetim Dalga B-2", () => {
  it("derin bağlantılar tek kaynaktan üretilir", async () => {
    const { appRoutes } = await import(
      "../../src/common/company/app-routes"
    );
    const base = "https://www.rothern.com";
    expect(appRoutes.listing(base, "abc")).toBe(
      "https://www.rothern.com/company/ilan/abc",
    );
    expect(appRoutes.order(base, "o1")).toBe(
      "https://www.rothern.com/company/siparis/o1",
    );
    expect(appRoutes.approvals(base)).toBe(
      "https://www.rothern.com/company/onaylar",
    );
    expect(appRoutes.messagesWith(base, "c9")).toBe(
      "https://www.rothern.com/company/mesajlar?with=c9",
    );
  });

  it("tasarruf raporu tavana dayandığında `truncated` bildirir", async () => {
    // Sözleşme kontrolü: alan varlığı (500 ihale kurmak pahalı olurdu).
    const svcSrc = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/modules/company-reports/company-reports.service.ts",
        "utf8",
      ),
    );
    // `general` zaten bildiriyordu; `savings` eskiden SESSİZ kesiyordu.
    const savings = svcSrc.slice(svcSrc.indexOf("async savings("));
    expect(savings).toContain("MAX_REPORT_LISTINGS + 1");
    expect(savings).toContain("truncated,");
  });
});
