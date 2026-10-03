import { ValidationPipe } from "@nestjs/common";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import {
  ListComplaintsDto,
  MembershipReportDto,
} from "../../src/modules/admin-companies/admin-companies.controller";

/**
 * Derin denetim 2026-09-29 LU-03 — admin firma uclari (dusuk):
 *  - sikayet listesi / uyelik raporu sorgu parametreleri 500 yerine 400
 *  - gerekcesiz askida TR sabit metin EN/RU sablona `{gerekce}` olarak girmez
 */

// Uretim (main.ts) ile ayni secenekler.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const validateQuery = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: "query", metatype, data: "" });

describe("ListComplaintsDto", () => {
  it("gecerli sorgu kabul, page/pageSize sayiya cevrilir", async () => {
    const dto = (await validateQuery(ListComplaintsDto, {
      status: "OPEN",
      companyId: "c1",
      q: "gecikme",
      page: "2",
      pageSize: "25",
    })) as ListComplaintsDto;
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(25);
    expect(dto.status).toBe("OPEN");
  });

  it("bos sorgu kabul", async () => {
    await expect(validateQuery(ListComplaintsDto, {})).resolves.toBeDefined();
  });

  it.each([
    [{ status: "open" }],
    [{ status: "PENDING" }],
    [{ page: "abc" }],
    [{ page: "0" }],
    [{ pageSize: "1.5" }],
    [{ pageSize: "101" }],
    [{ hacker: "1" }],
  ])("gecersiz sorgu reddedilir: %j", async (q) => {
    await expect(validateQuery(ListComplaintsDto, q)).rejects.toBeDefined();
  });
});

describe("MembershipReportDto", () => {
  it("YYYY-MM-DD kabul", async () => {
    await expect(
      validateQuery(MembershipReportDto, { from: "2026-09-01", to: "2026-09-30" }),
    ).resolves.toBeDefined();
  });

  it.each(["2026-13-01", "2026-02-30", "2026-9-1", "abc", "2026-09-01T00:00"])(
    "gecersiz tarih reddedilir: %s",
    async (from) => {
      await expect(validateQuery(MembershipReportDto, { from })).rejects.toBeDefined();
      await expect(validateQuery(MembershipReportDto, { to: from })).rejects.toBeDefined();
    },
  );
});

describe("listComplaints — servis NaN/ondalik sayfayi varsayilana dusurur", () => {
  it("skip/take tam sayi kalir", async () => {
    const tx = jest.fn(async (ops: unknown[]) => [0, []].slice(0, ops.length));
    const findMany = jest.fn(() => "findMany");
    const prisma = {
      $transaction: tx,
      companyComplaint: { count: jest.fn(() => "count"), findMany },
    };
    const svc = new AdminCompaniesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await svc.listComplaints(undefined, undefined, undefined, Number.NaN, 1.5);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
  });
});

describe("suspend — gerekcesiz askida TR sabit metin firmaya gitmez", () => {
  function rig() {
    const prisma = {
      company: {
        findUnique: jest.fn(async () => ({ id: "c1" })),
        update: jest.fn(async () => ({})),
      },
    };
    const audit = { log: jest.fn(async () => undefined) };
    const svc = new AdminCompaniesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
    ) as AdminCompaniesService & Record<string, unknown>;
    const notify = jest.fn(async () => undefined);
    svc.notifyCompany = notify;
    return { svc, prisma, notify };
  }

  it("gerekce bossa parametresiz katalog anahtari gider; ic kayit TR kalir", async () => {
    const { svc, prisma, notify } = rig();
    await svc.suspend("c1", "   ", "a1");
    const data = (prisma.company.update.mock.calls[0] as unknown as [{ data: { blockedReason: string } }])[0]
      .data;
    expect(data.blockedReason).toBeTruthy();
    const msg = (notify.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(msg.params).toBeUndefined();
    expect(msg.bodyKey).toBe("api.notifications.adminCompanies.askiyaAlindiGerekcesizGovde");
    expect(msg.paragraphKeys).toEqual([
      "api.notifications.adminCompanies.askiyaAlindiGerekcesiz",
      "api.notifications.adminCompanies.askiyaAlindiItiraz",
    ]);
  });

  it("gerekce verilirse `{gerekce}` ile gider", async () => {
    const { svc, notify } = rig();
    await svc.suspend("c1", " Sahte belge ", "a1");
    expect(notify).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        bodyKey: "api.notifications.adminCompanies.askiyaAlindiGovde",
        params: { gerekce: "Sahte belge" },
      }),
    );
  });
});
