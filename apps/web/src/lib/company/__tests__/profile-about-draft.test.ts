// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindSessionOwner, clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import {
  PROFILE_ABOUT_DRAFT_PREFIX,
  PROFILE_ABOUT_DRAFT_VERSION,
  clearProfileAboutDraft,
  readProfileAboutDraft,
  saveProfileAboutDraft,
  type ProfileAboutDraft,
} from "../profile-about-draft";

const KEY = `${PROFILE_ABOUT_DRAFT_PREFIX}:u1`;
const AI_DRAFT: ProfileAboutDraft = {
  text: "Demo Firma olarak İstanbul'da dağıtım panosu üretiyoruz.",
  result: { productCount: 0, remaining: 4, previous: "Biz demo firmayız." },
};

/**
 * Profilim "Hakkında" taslağı (canlı doğrulama 2026-10-09, PD-01): AI tanıtım
 * taslağı tarayıcının Geri düğmesinde, dil değişiminde ve bildirim tıklamasında
 * sormadan siliniyor, harcanan deneme geri gelmiyordu. Taslak kullanıcıya bağlı
 * bir `sessionStorage` anahtarında tutulur; bu dosya deponun sözleşmesini kilitler.
 */
describe("Profilim Hakkında taslağı — depo", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yazılan okunur (metin + sonuç notu + önceki metin); okumak SİLMEZ", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    expect(readProfileAboutDraft("u1", "c1")).toEqual(AI_DRAFT);
    // İkinci açılış (ikinci yenileme) aynı taslağı bulur.
    expect(readProfileAboutDraft("u1", "c1")).toEqual(AI_DRAFT);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      v: PROFILE_ABOUT_DRAFT_VERSION,
      companyId: "c1",
      ...AI_DRAFT,
    });
  });

  it("elle yazılmış taslak sonuç notu taşımaz; boş metin de taslaktır (kutu bilerek temizlenmiş)", () => {
    saveProfileAboutDraft("u1", "c1", { text: "Elle yazdım.", result: null });
    expect(readProfileAboutDraft("u1", "c1")).toEqual({ text: "Elle yazdım.", result: null });
    saveProfileAboutDraft("u1", "c1", { text: "", result: null });
    expect(readProfileAboutDraft("u1", "c1")).toEqual({ text: "", result: null });
  });

  it("depo `sessionStorage`dır — kalıcı depoya (localStorage) hiçbir şey yazılmaz", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("anahtar KULLANICIYA bağlı: başka hesabın taslağı okunmaz ve ona dokunulmaz", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    expect(readProfileAboutDraft("u2", "c1")).toBeNull();
    clearProfileAboutDraft("u2");
    expect(readProfileAboutDraft("u1", "c1")).toEqual(AI_DRAFT);
  });

  it("BAŞKA firmaya ait kayıt okunmaz ve silinir", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    expect(readProfileAboutDraft("u1", "c2")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("silme: Kaydet / Vazgeç sonrası taslak kalmaz", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    clearProfileAboutDraft("u1");
    expect(readProfileAboutDraft("u1", "c1")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["bozuk JSON", "{bozuk"],
    ["nesne değil", JSON.stringify("metin")],
    ["tanınmayan sürüm", JSON.stringify({ v: PROFILE_ABOUT_DRAFT_VERSION + 1, companyId: "c1", text: "x", result: null })],
    ["sürümsüz", JSON.stringify({ companyId: "c1", text: "x", result: null })],
    ["metni yok", JSON.stringify({ v: PROFILE_ABOUT_DRAFT_VERSION, companyId: "c1", result: null })],
    ["metni metin değil", JSON.stringify({ v: PROFILE_ABOUT_DRAFT_VERSION, companyId: "c1", text: 42, result: null })],
    [
      "sonuç notu bozuk (ürün sayısı metin)",
      JSON.stringify({
        v: PROFILE_ABOUT_DRAFT_VERSION,
        companyId: "c1",
        text: "x",
        result: { productCount: "3", remaining: null, previous: null },
      }),
    ],
    [
      "sonuç notu bozuk (önceki metin sayı)",
      JSON.stringify({
        v: PROFILE_ABOUT_DRAFT_VERSION,
        companyId: "c1",
        text: "x",
        result: { productCount: 3, remaining: null, previous: 7 },
      }),
    ],
    [
      "sonuç notu bozuk (kalan hak metin)",
      JSON.stringify({
        v: PROFILE_ABOUT_DRAFT_VERSION,
        companyId: "c1",
        text: "x",
        result: { productCount: 3, remaining: "4", previous: null },
      }),
    ],
  ])("bozuk kayıt — %s — çökertmez: okunmaz ve depodan silinir", (_ad, stored) => {
    sessionStorage.setItem(KEY, stored);
    expect(readProfileAboutDraft("u1", "c1")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("kimliksiz çağrı hiçbir şey yazmaz / okumaz (oturum anlık görüntüsü henüz yok)", () => {
    saveProfileAboutDraft("", "c1", AI_DRAFT);
    saveProfileAboutDraft("u1", "", AI_DRAFT);
    expect(sessionStorage.length).toBe(0);
    expect(readProfileAboutDraft("", "c1")).toBeNull();
    clearProfileAboutDraft("");
  });

  it("depo kapalıysa (gizli sekme / kota) sessizce yok sayılır", () => {
    const kapali = () => {
      throw new DOMException("kapalı", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(kapali);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(kapali);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(kapali);
    expect(() => saveProfileAboutDraft("u1", "c1", AI_DRAFT)).not.toThrow();
    expect(readProfileAboutDraft("u1", "c1")).toBeNull();
    expect(() => clearProfileAboutDraft("u1")).not.toThrow();
  });

  // Öneki `TENANT_SESSION_PREFIXES`te: firma verisi çıkışta tarayıcıda kalmaz.
  it("çıkışta silinir (tenant-storage öneki)", () => {
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    clearTenantSessionData();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(readProfileAboutDraft("u1", "c1")).toBeNull();
  });

  it("oturum düşüp aynı sekmede FARKLI kullanıcı girerse silinir; aynı kullanıcıda korunur", () => {
    bindSessionOwner("u1");
    saveProfileAboutDraft("u1", "c1", AI_DRAFT);
    bindSessionOwner("u1");
    expect(readProfileAboutDraft("u1", "c1")).toEqual(AI_DRAFT);
    bindSessionOwner("u2");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
