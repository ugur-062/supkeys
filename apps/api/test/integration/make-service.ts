import { CompanyListingsService } from "../../src/modules/company-listings/services/company-listings.service";
import { prisma } from "./test-db";

/**
 * Gerçek Prisma (test şeması) + yan-etki bağımlılıkları mock'lanmış servis.
 * Onay akışı varsayılan: requestApproval → approved:true (doğrudan uygulama).
 */
export function makeService() {
  const blocks = {
    blockedCompanyIds: jest.fn().mockResolvedValue([] as string[]),
  };
  const approvals = {
    requestApproval: jest.fn().mockResolvedValue({ approved: true }),
    pendingForListing: jest.fn().mockResolvedValue(null),
  };
  const exchangeRates = {
    getCurrentRate: jest.fn().mockResolvedValue(30),
  };
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "test" }),
  };
  const config = {
    get: jest.fn().mockReturnValue("http://localhost:3000"),
  };

  const service = new CompanyListingsService(
    prisma as never,
    blocks as never,
    approvals as never,
    exchangeRates as never,
    email as never,
    config as never,
  );

  return { service, blocks, approvals, exchangeRates, email, config };
}
