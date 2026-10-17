// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BID_FORM_DRAFT_PREFIX,
  BID_FORM_DRAFT_VERSION,
  bidDraftBase,
  bidFormFingerprint,
  clearBidFormDraft,
  mergeBidFormDraft,
  readBidFormDraft,
  saveBidFormDraft,
  type BidFormDraft,
  type BidFormItemDraft,
} from "../bid-form-draft";
import { clearTenantSessionData } from "@/lib/company-auth/tenant-storage";

/** Mobil denetim g08: Vazgeç / geri hareketi teklif fiyatlarını sormadan siliyordu. */
const item = (over: Partial<BidFormItemDraft> = {}): BidFormItemDraft => ({
  price: "",
  deliveryTime: "",
  currency: "",
  answers: {},
  isAlternative: false,
  offeredBrand: "",
  offeredMpn: "",
  ...over,
});

const form = (over: Partial<BidFormDraft> = {}): BidFormDraft => ({
  itemState: { i1: item({ price: "150" }), i2: item() },
  singleAmount: "",
  deliveryTime: "W1_2",
  validityDays: "30",
  currency: "",
  note: "",
  ...over,
});

const scope = { userId: "u1", companyId: "c1", listingId: "l1", base: "none" };
const KEY = `${BID_FORM_DRAFT_PREFIX}:u1:l1`;

beforeEach(() => sessionStorage.clear());

describe("bid-form-draft", () => {
  it("kaydet → oku aynı formu verir; okumak silmez; temizle siler", () => {
    saveBidFormDraft(scope, form());
    expect(readBidFormDraft(scope)).toEqual(form());
    expect(readBidFormDraft(scope)).toEqual(form());
    clearBidFormDraft("u1", "l1");
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(readBidFormDraft(scope)).toBeNull();
  });

  it("başka firmanın, sunucuda teklifi değişmiş ya da tanınmayan sürümdeki kayıt okunmaz ve silinir", () => {
    saveBidFormDraft(scope, form());
    expect(readBidFormDraft({ ...scope, companyId: "c2" })).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    saveBidFormDraft(scope, form());
    expect(readBidFormDraft({ ...scope, base: bidDraftBase({ status: "DRAFT", version: 2 }) })).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    sessionStorage.setItem(KEY, JSON.stringify({ v: BID_FORM_DRAFT_VERSION + 1, companyId: "c1", base: "none", form: form() }));
    expect(readBidFormDraft(scope)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();

    sessionStorage.setItem(KEY, "{bozuk");
    expect(readBidFormDraft(scope)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("anahtar kullanıcıya bağlı: başka kullanıcı aynı talebin taslağını okumaz", () => {
    saveBidFormDraft(scope, form());
    expect(readBidFormDraft({ ...scope, userId: "u2" })).toBeNull();
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
  });

  it("kimliksiz (oturum yok) kayıt yazılmaz", () => {
    saveBidFormDraft({ ...scope, userId: "" }, form());
    expect(sessionStorage.length).toBe(0);
  });

  it("parmak izi: boş soru cevabı ile girilmemiş cevap eş; kalem sırası ve anahtar sırası etkilemez; fiyat farkı ayırır", () => {
    const a = form({ itemState: { i1: item({ price: "150", answers: { q1: "" } }), i2: item() } });
    const b = form({ itemState: { i2: item(), i1: item({ price: "150" }) } });
    expect(bidFormFingerprint(a, ["i1", "i2"])).toBe(bidFormFingerprint(b, ["i1", "i2"]));
    const c = form({ itemState: { i1: item({ price: "151" }), i2: item() } });
    expect(bidFormFingerprint(a, ["i1", "i2"])).not.toBe(bidFormFingerprint(c, ["i1", "i2"]));
    // "Bu kaleme teklif vermiyorum" (null) boş fiyattan ayrıdır.
    const optOut = form({ itemState: { i1: item({ price: null }), i2: item() } });
    const blank = form({ itemState: { i1: item({ price: "" }), i2: item() } });
    expect(bidFormFingerprint(optOut, ["i1", "i2"])).not.toBe(bidFormFingerprint(blank, ["i1", "i2"]));
  });

  it("birleştirme: talepten çıkarılan kalem forma sızmaz, taslakta olmayan kalem tohumdan gelir", () => {
    const seed = form({ itemState: { i1: item(), i3: item({ price: "7" }) }, note: "" });
    const draft = form({ itemState: { i1: item({ price: "150" }), i2: item({ price: "9" }) }, note: "acil" });
    const merged = mergeBidFormDraft(seed, draft, ["i1", "i3"]);
    expect(merged.itemState).toEqual({ i1: item({ price: "150" }), i3: item({ price: "7" }) });
    expect(merged.note).toBe("acil");
  });

  it("bidDraftBase: teklif yokken 'none', varsa durum + sürüm + tur + güncelleme", () => {
    expect(bidDraftBase(null)).toBe("none");
    expect(bidDraftBase({ status: "LOST", version: 3, round: 2, updatedAt: "x" })).toBe("LOST|3|2|x");
  });
});

// CLAUDE.md MU-27: firma verisi taşıyan oturum deposu öneki çıkışta silinir.
describe("bid-form-draft — çıkışta silinir", () => {
  it("önek TENANT_SESSION_PREFIXES'te: çıkışta silinir", () => {
    saveBidFormDraft(scope, form());
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    clearTenantSessionData();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
