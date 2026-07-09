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
    // Yükleme sonrası varlık/boyut doğrulaması (register finalize) mock'u.
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
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
  );
  return { service, storage, blocks };
}
