/**
 * Profil KVKK veri-minimizasyonu (hassas alanlar yalnız company:manage) +
 * mesaj blok zorlaması okuma/inbox tarafında (karşılıklı-görünmezlik).
 */
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { CompanyMessagesService } from "../../src/modules/company-messages/company-messages.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("profil KVKK gate", () => {
  it("company:manage yoksa TCKN gizli + IBAN maskeli döner; varsa tam", async () => {
    const svc = new CompanyProfileService(
      prisma as never,
      {} as never,
      {} as never,
      new AuditService(prisma as never),
    );
    const co = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: { authorizedTckn: "12345678901", iban: "TR120001", ibanHolder: "X" },
    });
    const full = await svc.get(co.company.id, true);
    expect(full.authorizedTckn).toBe("12345678901");
    expect(full.iban).toBe("TR120001");
    const limited = await svc.get(co.company.id, false);
    expect(limited.authorizedTckn).toBeNull();
    // Fix(security): null yerine maskeli — banka listesiyle aynı maskIban kuralı.
    expect(limited.iban).toBe("TR**0001");
    expect(limited.ibanHolder).toBeNull();
    // Hassas olmayan alan etkilenmez.
    expect(limited.name).toBe(full.name);
  });
});

describe("mesaj blok zorlaması (okuma + inbox)", () => {
  it("engellenince karşı taraf konuşmayı okuyamaz (404) ve inbox'ta görünmez", async () => {
    const blocks = new CompanyBlocksService(
      prisma as never,
      new AuditService(prisma as never),
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const svc = new CompanyMessagesService(
      prisma as never,
      blocks,
      email as never,
      config as never,
    );
    const a = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const b = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const aCode = "AAAA-0001";
    await prisma.company.update({
      where: { id: a.company.id },
      data: { rothernId: aCode },
    });

    // A (satınalma=alıcı) → B'ye mesaj; başlangıçta konuşma okunur + inbox'ta var.
    await svc.send(a.auth, "satinalma", b.company.id, "merhaba");
    expect(
      (await svc.getThread(a.auth, "satinalma", b.company.id)).thread,
    ).not.toBeNull();

    // B, A'yı engeller → karşılıklı görünmezlik.
    await blocks.block(b.auth, aCode);

    await expect(
      svc.getThread(a.auth, "satinalma", b.company.id),
    ).rejects.toThrow(/bulunamadı/i);
    const threads = await svc.listThreads(a.auth, "satinalma");
    expect(threads.find((t) => t.otherPartyId === b.company.id)).toBeUndefined();
  });
});
