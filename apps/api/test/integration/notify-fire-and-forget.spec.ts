/**
 * Fire-and-forget bildirim güvenliği (2026-07-17 sweep): `void this.notifyX(...)`
 * çağrıları reddi YUTMALI — aksi halde UNHANDLED rejection → prod'da Node süreç
 * çökmesi (test suite'i tam koşumda bu yüzden çöküyordu). notifyListingInvitees
 * iç try/catch taşımaz; çağıran `.catch` ile korur (CL:561, scheduler:145).
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem } from "./factories";
import { makeService } from "./make-service";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("void bildirim reddi → çağıran etkilenmez + unhandled rejection YOK", () => {
  it("notifyListingInvitees reddederse announceListingOpen resolve olur, unhandledRejection oluşmaz", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    await makeItem(prisma, l.id);

    const internal = service as unknown as {
      notifyListingInvitees: (id: string, k: string) => Promise<void>;
      notifyCategoryMatchedCompanies: (id: string) => Promise<void>;
      announceListingOpen: (id: string, k: string) => Promise<void>;
    };
    const spy = jest
      .spyOn(internal, "notifyListingInvitees")
      .mockRejectedValue(new Error("bildirim patladı"));
    // Kategori-eşleşme bildirimini izole et (kendi .catch'i var; DB'ye gitmesin).
    const catSpy = jest
      .spyOn(internal, "notifyCategoryMatchedCompanies")
      .mockResolvedValue(undefined);

    const rejections: unknown[] = [];
    const onRej = (e: unknown) => rejections.push(e);
    process.on("unhandledRejection", onRej);
    try {
      // Çağıran, reddeden void-bildirimden ETKİLENMEZ (resolve).
      await expect(
        internal.announceListingOpen(l.id, "invitation"),
      ).resolves.toBeUndefined();
      // Mikrotask kuyruğunu boşalt — .catch olmasaydı burada unhandledRejection düşerdi.
      await new Promise((r) => setImmediate(r));
      // mockRestore çağrı verisini sıfırlar → assert'ler restore'dan ÖNCE.
      expect(spy).toHaveBeenCalled();
      expect(rejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onRej);
      spy.mockRestore();
      catSpy.mockRestore();
    }
  });
});
