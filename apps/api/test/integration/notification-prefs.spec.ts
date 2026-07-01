/**
 * Bildirim tercihleri — (1) isNotificationEnabled saf birim, (2) notify()
 * pipeline'ının tercihleri UYGULADIĞI entegrasyon (kapalı tercih → e-posta yok).
 */
import {
  isNotificationEnabled,
  isTransactionalNotification,
} from "../../src/common/notifications/notification-prefs";
import { prisma, truncateAll } from "./test-db";
import {
  invite,
  makeCompany,
  makeCompanyWithUser,
  makeListing,
  makeUser,
} from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("isNotificationEnabled (birim)", () => {
  it("transactional tipler her zaman açık (tercihe bakılmaz)", () => {
    expect(isNotificationEnabled({ award: false }, "bid_awarded")).toBe(true);
    expect(isNotificationEnabled(null, "password_reset")).toBe(true);
    expect(isNotificationEnabled(null, "order_status_changed")).toBe(true);
    expect(isTransactionalNotification("bid_awarded")).toBe(true);
    expect(isTransactionalNotification("listing_invitation")).toBe(false);
  });

  it("kapatılabilir tip: tercih yoksa varsayılan açık", () => {
    expect(isNotificationEnabled(null, "listing_invitation")).toBe(true);
    expect(isNotificationEnabled({}, "listing_reminder")).toBe(true);
  });

  it("kapatılabilir tip: tercih false → kapalı", () => {
    expect(
      isNotificationEnabled({ invitation: false }, "listing_invitation"),
    ).toBe(false);
    expect(isNotificationEnabled({ reminder: false }, "listing_reminder")).toBe(
      false,
    );
    // listing_closed / _owner aynı anahtara (listingClosed) düşer
    expect(
      isNotificationEnabled({ listingClosed: false }, "listing_closed_owner"),
    ).toBe(false);
  });
});

describe("notify pipeline — tercih uygulanır", () => {
  it("davet bildirimini kapatan firmaya e-posta gitmez", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });

    // A: daveti kapatmış (notificationPrefs.invitation=false)
    const aCo = await makeCompany(prisma, { country: "TR" });
    await makeUser(prisma, aCo.id, undefined, {
      notificationPrefs: { invitation: false },
    });
    // B: varsayılan (tercih yok → açık)
    const bCo = await makeCompany(prisma, { country: "TR" });
    await makeUser(prisma, bCo.id);

    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      closesAt: FUTURE,
    });
    await invite(prisma, listing.id, aCo.id, owner.user.id);
    await invite(prisma, listing.id, bCo.id, owner.user.id);

    await service.notifyListingInvitees(listing.id, "invitation");
    // yalnız B alır → tek e-posta
    expect(email.send).toHaveBeenCalledTimes(1);
    const sentTo = (email.send.mock.calls[0][0] as { to: { email: string } })
      .to.email;
    const bUser = await prisma.companyUser.findFirstOrThrow({
      where: { companyId: bCo.id },
    });
    expect(sentTo).toBe(bUser.email);
  });
});
