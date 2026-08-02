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
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
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
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
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

describe("mesaj gönderme rol kapısı (salt-okunur garanti #4)", () => {
  function makeMsgService() {
    const blocks = new CompanyBlocksService(
      prisma as never,
      new AuditService(prisma as never),
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    return new CompanyMessagesService(
      prisma as never,
      blocks,
      email as never,
      config as never,
    );
  }

  it("etiket-only/onaylayıcı/rolsüz üye gönderemez VE okuyamaz; portal-yönlü rol geçer", async () => {
    const svc = makeMsgService();
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const withRoles = (roles: string[], isOwner = false) =>
      ({ ...a.auth, roles, isOwner }) as typeof a.auth;

    for (const p of [
      withRoles(["SAHIP"], true),
      withRoles(["YONETICI"]),
      withRoles(["ONAYLAYICI"]),
      withRoles([]),
    ]) {
      await expect(
        svc.send(p, "satinalma", b.company.id, "merhaba"),
      ).rejects.toThrow(/Satın Almacı rolü gerekir/);
    }
    // Portal-yönlü: satinalma'da yalnız-Satışçı da gönderemez (yön uyuşmaz).
    await expect(
      svc.send(withRoles(["SATISCI"]), "satinalma", b.company.id, "m"),
    ).rejects.toThrow(/Satın Almacı rolü gerekir/);
    await expect(
      svc.send(withRoles(["SATIN_ALMACI"]), "satis", b.company.id, "m"),
    ).rejects.toThrow(/Satışçı rolü gerekir/);

    // Doğru yön geçer.
    await svc.send(withRoles(["SATIN_ALMACI"]), "satinalma", b.company.id, "merhaba");

    // Okuma uçları da rol kapısının arkasında (kullanıcı isteği 2026-08-02):
    // rolsüz Kurucu konuşmayı OKUYAMAZ, gelen kutusunu LİSTELEYEMEZ.
    await expect(
      svc.getThread(withRoles(["SAHIP"], true), "satinalma", b.company.id),
    ).rejects.toThrow(/görüntülemek için Satın Almacı rolü gerekir/);
    await expect(
      svc.listThreads(withRoles([]), "satinalma"),
    ).rejects.toThrow(/görüntülemek için Satın Almacı rolü gerekir/);
    // Yön uyuşmayan rol de okuyamaz (satis rozetiyle satınalma kutusu açılmaz).
    await expect(
      svc.listThreads(withRoles(["SATISCI"]), "satinalma"),
    ).rejects.toThrow(/görüntülemek için Satın Almacı rolü gerekir/);

    // Rozet ucu hata üretmez: rolsüz portal 0 sayılır, rollü portal sayar.
    const bAuth = { ...b.auth, roles: ["SATISCI"] } as typeof b.auth;
    expect((await svc.unreadCount(bAuth, "satis")).count).toBe(1);
    expect(
      (await svc.unreadCount(withRoles(["SAHIP"], true), "satinalma")).count,
    ).toBe(0);
    // Portal'sız toplam yalnız rollü tarafları sayar.
    expect(
      (await svc.unreadCount({ ...b.auth, roles: [] } as typeof b.auth)).count,
    ).toBe(0);
    const read = await svc.getThread(
      withRoles(["SATIN_ALMACI"]),
      "satinalma",
      b.company.id,
    );
    expect(read.thread).not.toBeNull();

    // BİRLEŞİK kutu ("all", 2026-08-02): yalnız ROLÜ OLAN tarafların
    // konuşmaları döner, satırlar portal etiketi taşır; rolsüz kullanıcıda boş.
    const allRows = await svc.listThreads(withRoles(["SATIN_ALMACI"]), "all");
    expect(allRows).toHaveLength(1);
    expect(allRows[0]).toMatchObject({
      portal: "satinalma",
      otherPartyId: b.company.id,
    });
    // Yalnız Satışçı rolüyle "all": satınalma konuşması SIZMAZ.
    expect(await svc.listThreads(withRoles(["SATISCI"]), "all")).toHaveLength(0);
    expect(await svc.listThreads(withRoles([]), "all")).toHaveLength(0);
  });
});
