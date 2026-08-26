import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";

/**
 * Suppression türetmesi TEK KAYNAK (EmailSuppressionService) + admin firma detayı
 * rozeti. CLEAR-MARKER SIRASI kritik: yalnız EN SON marker'dan sonraki bounce/
 * complaint sayılır — yanlış sıralama sessiz yanlış sonuç verir.
 */
const svc = new EmailSuppressionService(prisma as never);

const D = {
  t1: new Date("2026-07-01T00:00:00.000Z"),
  t2: new Date("2026-07-02T00:00:00.000Z"),
  t3: new Date("2026-07-03T00:00:00.000Z"),
};

async function bounce(
  email: string,
  opts: {
    status?: "BOUNCED" | "COMPLAINED";
    bounceType?: string | null;
    at: Date;
  },
) {
  await prisma.emailLog.create({
    data: {
      template: "password_reset",
      toEmail: email,
      subject: "S",
      provider: "resend",
      status: opts.status ?? "BOUNCED",
      bounceType: opts.status === "COMPLAINED" ? null : (opts.bounceType ?? "hard"),
      bounceReason: "mailbox not found",
      queuedAt: opts.at,
    },
  });
}

async function clearMarker(email: string, at: Date) {
  await prisma.emailLog.create({
    data: {
      template: "suppression_clear",
      toEmail: email,
      subject: "clear",
      provider: "resend",
      status: "SENT",
      queuedAt: at,
    },
  });
}

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("EmailSuppressionService.getSuppressionStatus", () => {
  it("hard-bounce → suppressed", async () => {
    await bounce("a@x.com", { at: D.t1 });
    const map = await svc.getSuppressionStatus(["a@x.com"]);
    expect(map.get("a@x.com")?.status).toBe("BOUNCED");
  });

  it("complaint → suppressed", async () => {
    await bounce("a@x.com", { status: "COMPLAINED", at: D.t1 });
    const map = await svc.getSuppressionStatus(["a@x.com"]);
    expect(map.get("a@x.com")?.status).toBe("COMPLAINED");
  });

  it("soft-bounce → suppressed DEĞİL (geçici)", async () => {
    await bounce("a@x.com", { bounceType: "soft", at: D.t1 });
    const map = await svc.getSuppressionStatus(["a@x.com"]);
    expect(map.has("a@x.com")).toBe(false);
  });

  it("clear-marker bounce'tan SONRA → aklanmış (gizli)", async () => {
    await bounce("a@x.com", { at: D.t1 });
    await clearMarker("a@x.com", D.t2); // sonra akla
    const map = await svc.getSuppressionStatus(["a@x.com"]);
    expect(map.has("a@x.com")).toBe(false);
  });

  it("SIRA: clear-marker SONRASI yeni bounce → yeniden suppressed", async () => {
    await bounce("a@x.com", { at: D.t1 }); // aklanacak
    await clearMarker("a@x.com", D.t2);
    await bounce("a@x.com", { at: D.t3 }); // marker'dan SONRA → yeniden suppress
    const map = await svc.getSuppressionStatus(["a@x.com"]);
    expect(map.get("a@x.com")?.status).toBe("BOUNCED");
    expect(map.get("a@x.com")?.at).toEqual(D.t3);
  });

  it("yalnız istenen adresler döner; suppress'siz Map'te yok", async () => {
    await bounce("a@x.com", { at: D.t1 });
    const map = await svc.getSuppressionStatus(["a@x.com", "clean@x.com"]);
    expect(map.has("a@x.com")).toBe(true);
    expect(map.has("clean@x.com")).toBe(false);
  });

  it("boş liste → boş Map", async () => {
    const map = await svc.getSuppressionStatus([]);
    expect(map.size).toBe(0);
  });
});

describe("admin firma detayı — suppressions rozeti", () => {
  function adminService() {
    const storage = {
      presignStoredObject: jest.fn(async () => null),
      // Parça 9 #7: KYC önizlemesi satır-içi presign kullanıyor (aynı davranış).
      presignInlinePreview: jest.fn(async () => null),
    };
    return new AdminCompaniesService(
      prisma as never,
      storage as never,
      { send: jest.fn() } as never,
      { pushToCompany: jest.fn() } as never,
      { get: jest.fn(() => "http://localhost:3000") } as never,
      new AuditService(prisma as never),
      svc,
    );
  }

  it("kullanıcı e-postası hard-bounce → detail().suppressions gösterir; clear sonrası gizlenir", async () => {
    const co = await makeCompany(prisma, { billingEmail: null });
    await prisma.companyUser.create({
      data: {
        companyId: co.id,
        email: "user@firma.com",
        firstName: "T",
        lastName: "U",
        roles: ["YONETICI"],
        isActive: true,
      },
    });
    await bounce("user@firma.com", { at: D.t1 });

    const svc2 = adminService();
    const d1 = (await svc2.detail(co.id)) as { suppressions: { email: string }[] };
    expect(d1.suppressions.map((s) => s.email)).toContain("user@firma.com");

    // Akla → detayda artık görünmez (marker sırası).
    await clearMarker("user@firma.com", D.t2);
    const d2 = (await svc2.detail(co.id)) as { suppressions: { email: string }[] };
    expect(d2.suppressions).toHaveLength(0);
  });

  it("billingEmail suppress → detail'de görünür", async () => {
    const co = await makeCompany(prisma, { billingEmail: "billing@firma.com" });
    await bounce("billing@firma.com", { status: "COMPLAINED", at: D.t1 });
    const d = (await adminService().detail(co.id)) as {
      suppressions: { email: string; status: string }[];
    };
    expect(d.suppressions).toEqual([
      expect.objectContaining({ email: "billing@firma.com", status: "COMPLAINED" }),
    ]);
  });
});
