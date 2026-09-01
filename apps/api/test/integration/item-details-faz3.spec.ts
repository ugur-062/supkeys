import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { makeService } from "./make-service";
import { CompanyListingDocumentsService } from "../../src/modules/company-listing-documents/company-listing-documents.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { AuditService } from "../../src/modules/audit/audit.service";

/**
 * Faz 3 — kalem detayları, MUADİL simetrisi ve kalem-bazlı belge.
 */
describe("Faz 3 — kalem detayları", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe("muadil (alternatif) teklif simetrisi", () => {
    /**
     * `alternativeAllowed` tek başına yarım kalır: tedarikçi muadil teklif
     * edebiliyorsa NE teklif ettiğini söyleyebilmeli. Ve tersi de doğru
     * olmalı — alıcı izin VERMEDİYSE tedarikçi bayrağı zorlayamamalı.
     */
    async function scenario(alternativeAllowed: boolean) {
      const { service } = makeService();
      const buyer = await makeCompanyWithUser(prisma);
      const seller = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        type: "ALIM",
        status: "OPEN",
        visibility: "PUBLIC",
      });
      const item = await makeItem(prisma, listing.id, {
        quantity: new Prisma.Decimal(2),
        alternativeAllowed,
      });
      await service.placeBid(seller.auth, listing.id, {
        amount: 200,
        currency: "TRY",
        deliveryTime: "W1_2",
        validityDays: 30,
        items: [
          {
            itemId: item.id,
            unitPrice: 100,
            isAlternative: true,
            offeredBrand: "Muadil Marka",
            offeredMpn: "MDL-1",
          },
        ],
      } as never);
      return prisma.listingBidItem.findFirstOrThrow({
        where: { itemId: item.id },
      });
    }

    it("alıcı izin VERDİYSE muadil beyanı kaydedilir", async () => {
      const bi = await scenario(true);
      expect(bi.isAlternative).toBe(true);
      expect(bi.offeredBrand).toBe("Muadil Marka");
      expect(bi.offeredMpn).toBe("MDL-1");
    });

    it("alıcı izin VERMEDİYSE bayrak DÜŞÜRÜLÜR (tedarikçi kuralı aşamaz)", async () => {
      const bi = await scenario(false);
      expect(bi.isAlternative).toBe(false);
      // Marka/MPN bilgi olarak kalır — alıcı ne önerildiğini yine görebilsin.
      expect(bi.offeredBrand).toBe("Muadil Marka");
    });
  });

  describe("kalem detay alanları", () => {
    it("ilan detayı yanıtında geri döner (sahip + maskeli dal)", async () => {
      // NOT: buradaki odak YANIT EŞLEMESİ. Yazma yolu DTO doğrulaması +
      // typecheck ile kapalı; `create` üzerinden gitmek gerçek bir UNSPSC
      // kategorisi tohumlamayı gerektirirdi ve testin konusunu bulandırırdı.
      const { service } = makeService();
      const buyer = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        type: "ALIM",
        status: "OPEN",
      });
      await makeItem(prisma, listing.id, {
        brand: "SKF",
        mpn: "6204-2RS",
        alternativeAllowed: false,
        specification: "DIN 625, C3 boşluk",
        warrantyMonths: 24,
        hsCode: "8482.10",
      });
      const detail = (await service.getOne(buyer.auth, listing.id)) as {
        items: {
          brand: string | null;
          mpn: string | null;
          alternativeAllowed: boolean;
          specification: string | null;
          warrantyMonths: number | null;
          hsCode: string | null;
        }[];
      };
      expect(detail.items[0]).toMatchObject({
        brand: "SKF",
        mpn: "6204-2RS",
        alternativeAllowed: false,
        specification: "DIN 625, C3 boşluk",
        warrantyMonths: 24,
        hsCode: "8482.10",
      });
    });

    it("alternativeAllowed varsayılanı EVET (kısıtlamayan taraf varsayılan)", async () => {
      const { company, user } = await makeCompanyWithUser(prisma);
      const listing = await makeListing(prisma, {
        companyId: company.id,
        createdById: user.id,
      });
      const it = await makeItem(prisma, listing.id);
      expect(it.alternativeAllowed).toBe(true);
    });
  });

  describe("kalem-bazlı belge", () => {
    const storageMock = () => ({
      generatePresignedPut: jest.fn().mockResolvedValue({ url: "u", key: "k" }),
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 10, contentType: "application/pdf" }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      generatePresignedGet: jest.fn().mockResolvedValue("signed"),
      buildListingDocKey: jest.fn().mockReturnValue("k"),
    });
    const docSvc = () =>
      new CompanyListingDocumentsService(
        prisma as never,
        storageMock() as never,
        new CompanyBlocksService(
          prisma as never,
          new AuditService(prisma as never),
        ) as never,
        { log: jest.fn() } as never,
      );

    it("BAŞKA ilanın kalemine belge iliştirilemez (IDOR)", async () => {
      const a = await makeCompanyWithUser(prisma);
      const l1 = await makeListing(prisma, {
        companyId: a.company.id,
        createdById: a.user.id,
        status: "DRAFT",
      });
      const l2 = await makeListing(prisma, {
        companyId: a.company.id,
        createdById: a.user.id,
        status: "DRAFT",
      });
      const foreignItem = await makeItem(prisma, l2.id);
      await expect(
        docSvc().register(a.auth, l1.id, {
          key: `listing-docs/${l1.id}/x.pdf`,
          fileName: "x.pdf",
          mimeType: "application/pdf",
          itemId: foreignItem.id,
        }),
      ).rejects.toThrow(/Kalem bulunamadı/);
    });

    it("kendi kalemine belge bağlanır ve listede itemId ile döner", async () => {
      const a = await makeCompanyWithUser(prisma);
      const l = await makeListing(prisma, {
        companyId: a.company.id,
        createdById: a.user.id,
        status: "DRAFT",
      });
      const item = await makeItem(prisma, l.id);
      const svc = docSvc();
      await svc.register(a.auth, l.id, {
        key: `listing-docs/${l.id}/tech.pdf`,
        fileName: "tech.pdf",
        mimeType: "application/pdf",
        itemId: item.id,
      });
      const docs = (await svc.list(a.auth, l.id)) as { itemId: string | null }[];
      expect(docs).toHaveLength(1);
      expect(docs[0]!.itemId).toBe(item.id);
    });

    it("kalem silinince belgesi de gider (cascade)", async () => {
      const a = await makeCompanyWithUser(prisma);
      const l = await makeListing(prisma, {
        companyId: a.company.id,
        createdById: a.user.id,
        status: "DRAFT",
      });
      const item = await makeItem(prisma, l.id);
      await prisma.listingDocument.create({
        data: {
          listingId: l.id,
          itemId: item.id,
          key: "k1",
          fileName: "f.pdf",
          mimeType: "application/pdf",
          uploadedByCompanyId: a.company.id,
        },
      });
      await prisma.listingItem.delete({ where: { id: item.id } });
      expect(await prisma.listingDocument.count({ where: { listingId: l.id } })).toBe(0);
    });
  });
});
