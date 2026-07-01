/**
 * Faz 4 — Kurumsal Kimlik profili: düzenlenebilir kimlik kalemleri (MERSİS/KEP/
 * IBAN) doğrulaması + kaydı.
 */
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

// Standart geçerli TR IBAN örneği (mod-97).
const VALID_IBAN = "TR330006100519786457841326";

function makeService() {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn(),
    deleteObject: jest.fn(),
  };
  return new CompanyProfileService(prisma as never, storage as never);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("company-profile — kurumsal kimlik kalemleri", () => {
  it("geçerli MERSİS/KEP/IBAN kaydedilir (IBAN normalize)", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await svc.update(owner.company.id, {
      mersisNo: "1234567890123456",
      kepAddress: "firma@hs01.kep.tr",
      iban: "tr33 0006 1005 1978 6457 8413 26",
      ibanHolder: "Örnek A.Ş.",
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.mersisNo).toBe("1234567890123456");
    expect(c.kepAddress).toBe("firma@hs01.kep.tr");
    expect(c.iban).toBe(VALID_IBAN); // boşluksuz + büyük harf
    expect(c.ibanHolder).toBe("Örnek A.Ş.");
  });

  it("geçersiz IBAN reddedilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, { iban: "TR00 1234" } as never),
    ).rejects.toThrow(/geçersiz/i);
  });

  it("geçersiz KEP reddedilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, {
        kepAddress: "firma@gmail.com",
      } as never),
    ).rejects.toThrow(/KEP/i);
  });

  it("boş IBAN → temizlenir (null)", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await svc.update(owner.company.id, { iban: VALID_IBAN } as never);
    await svc.update(owner.company.id, { iban: "" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBeNull();
  });
});
