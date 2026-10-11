import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";

/**
 * Arayüz testi son tur — admin talep müdahalesi bildirimi (kapat/uzat/yeniden
 * aç) talebe bağlanır: `notifyCompany` mesajın `listingId`'sini ve talep
 * CTA'sını in-app satıra geçirir. Önce satır "Rothern'e Git" → /company ile
 * ve listingId NULL yazılıyordu.
 */
function makeSvc() {
  const pushToCompany = jest.fn().mockResolvedValue(1);
  const prisma = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
  const config = { get: (k: string) => (k === "WEB_URL" ? "https://web.test" : undefined) };
  const svc = new AdminCompaniesService(
    prisma as never,
    {} as never,
    {} as never,
    { pushToCompany } as never,
    config as never,
    {} as never,
    {} as never,
  );
  return { svc, pushToCompany };
}

describe("notifyCompany — talebe bağlı bildirim", () => {
  it("listingId ve talep CTA'sı in-app satıra geçer", async () => {
    const { svc, pushToCompany } = makeSvc();
    await svc.notifyCompany("co-1", {
      type: "admin_listing_closed",
      portal: "satinalma",
      subjectKey: "api.notifications.adminInspection.ilanKapatildiBaslik",
      listingId: "lst-1",
      cta: { labelKey: "api.notifications.listings.cta.viewRequest", path: "/company/ilan/lst-1" },
    });
    expect(pushToCompany).toHaveBeenCalledWith(
      "co-1",
      expect.objectContaining({
        listingId: "lst-1",
        ctaLabelKey: "api.notifications.listings.cta.viewRequest",
        ctaPath: "https://web.test/company/ilan/lst-1",
        portal: "satinalma",
      }),
    );
  });

  it("talepsiz bildirimde listingId boş, CTA genel panel", async () => {
    const { svc, pushToCompany } = makeSvc();
    await svc.notifyCompany("co-1", {
      type: "admin_company_suspended",
      subjectKey: "api.notifications.adminInspection.ilanKapatildiBaslik",
    });
    expect(pushToCompany).toHaveBeenCalledWith(
      "co-1",
      expect.objectContaining({ listingId: null, ctaPath: "https://web.test/company" }),
    );
  });
});
