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
  };
  const service = new CompanyListingDocumentsService(
    prisma as never,
    storage as never,
  );
  return { service, storage };
}
