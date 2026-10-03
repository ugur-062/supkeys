import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_LISTING_INVITATIONS } from "@rothern/shared";
import { connectedInvitees } from "../../src/modules/company-listings/listing-invitees";

/**
 * Derin denetim RM-26 (MU-26 gozden gecirme) — davet tavani 5000'e cikti.
 * create / updateListing / addInvitations davet hedeflerini baglanti listesine
 * `string[].includes` ile suzuyordu: 5000 davet x 5000 baglanti = ~25M
 * karsilastirma, her kayitta ana is parcaciginda. Suzme artik Set uzerinden,
 * hedef basina TEK arama.
 */
class CountingSet extends Set<string> {
  lookups = 0;
  override has(v: string): boolean {
    this.lookups++;
    return super.has(v);
  }
}

describe("connectedInvitees — davet hedefi suzgeci", () => {
  it("kendi firmayi ve bagli olmayan firmayi eler, bagli olanlari sirasiyla tutar", () => {
    expect(
      connectedInvitees(["self", "a", "x", "b"], {
        selfCompanyId: "self",
        connected: new Set(["a", "b", "self"]),
      }),
    ).toEqual(["a", "b"]);
  });

  it("alsoAllowed (onceki davetli) baglanti kopsa da kalir; kendi firma yine elenir", () => {
    expect(
      connectedInvitees(["self", "a", "old", "x"], {
        selfCompanyId: "self",
        connected: new Set(["a"]),
        alsoAllowed: new Set(["old", "self"]),
      }),
    ).toEqual(["a", "old"]);
  });

  it("tavan boyutunda hedef basina en fazla iki Set aramasi yapar (dogrusal)", () => {
    const n = MAX_LISTING_INVITATIONS;
    const ids = Array.from({ length: n }, (_, i) => `c${i}`);
    const connected = new CountingSet(ids.filter((_, i) => i % 2 === 0));
    const alsoAllowed = new CountingSet(ids.filter((_, i) => i % 4 === 1));
    const out = connectedInvitees(ids, { selfCompanyId: "c0", connected, alsoAllowed });
    expect(out).toHaveLength(n / 2 - 1 + n / 4);
    expect(connected.lookups).toBeLessThanOrEqual(n);
    expect(alsoAllowed.lookups).toBeLessThanOrEqual(n);
  });

  it("ilan servisi davet yollarinda baglanti dizisini includes ile taramaz", () => {
    const src = readFileSync(
      join(__dirname, "../../src/modules/company-listings/services/company-listings.service.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/connectedIds\.includes\(id\)/);
    // create + updateListing + addInvitations ortak suzgeci kullanir.
    expect(src.match(/connectedInvitees\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
