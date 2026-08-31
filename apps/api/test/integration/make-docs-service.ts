import { CompanyListingDocumentsService } from "../../src/modules/company-listing-documents/company-listing-documents.service";
import { prisma } from "./test-db";

/** Gerçek Prisma (test şeması) + mock StorageService ile belge servisi. */
export function makeDocsService() {
  const storage = {
    generatePresignedPut: jest
      .fn()
      .mockResolvedValue("https://r2.test/put?sig=x"),
    generatePresignedGet: jest
      .fn()
      .mockResolvedValue("https://r2.test/get?sig=x"),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    // Yükleme sonrası varlık/boyut/İÇERİK TİPİ doğrulaması (register finalize).
    // contentType: presigned PUT içerik tipini imzalamadığı için gerçek tip
    // HEAD'den okunup allowlist ile karşılaştırılır (denetim 2026-08-24 P5).
    checkExists: jest.fn().mockResolvedValue({
      exists: true,
      size: 1024,
      contentType: "application/pdf",
    }),
  };
  // Blok servisi mock'u — varsayılan: bloklu firma yok (görünürlük testleri
  // blok senaryosu içermez). blockedCompanyIds(companyId) → string[].
  const blocks = {
    blockedCompanyIds: jest.fn().mockResolvedValue([] as string[]),
  };
  const service = new CompanyListingDocumentsService(
    prisma as never,
    storage as never,
    blocks as never,
        { log: jest.fn() } as never,
                  );
  return { service, storage, blocks };
}
