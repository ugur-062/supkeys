// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_DRAFT_PREFIX,
  ONBOARDING_DRAFT_VERSION,
  clearOnboardingDraft,
  readOnboardingDraft,
  saveOnboardingDraft,
} from "../onboarding-draft";
import { clearTenantSessionData } from "../tenant-storage";

const KEY = `${ONBOARDING_DRAFT_PREFIX}:u1`;
const FORM = { country: "DE", legalName: "Müller Handel", companyType: "LIMITED", legalFormLocal: "GmbH" };

/**
 * Onboarding taslağı (webA-09; kayıt denetimi 2026-10). 2026-10-08'de adım
 * sırası (Şirket → Faaliyet alanı → Yetkili ve onay) ve hukuki yapı alanlarının
 * anlamı değişti: taslak SÜRÜM taşır. Eski biçimdeki (sürüm 1) taslak ATILMAZ —
 * alan değerleri korunur, sihirbaz ilk adımdan açılır; bu kodun bilmediği
 * sürümün taslağı okunmaz.
 */
describe("onboarding taslağı", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("yazılan okunur (adım + alanlar); okumak silmez", () => {
    saveOnboardingDraft("u1", { step: 2, f: FORM });
    expect(readOnboardingDraft("u1")).toEqual({ step: 2, f: FORM });
    expect(readOnboardingDraft("u1")).toEqual({ step: 2, f: FORM });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ v: ONBOARDING_DRAFT_VERSION, step: 2, f: FORM });
  });

  it("sürüm 2: adım sırası ve hukuki yapı alanları değişti", () => {
    expect(ONBOARDING_DRAFT_VERSION).toBe(2);
  });

  // İnceleme 2026-10-08: eski biçimdeki taslak siliniyordu — dağıtım anında
  // kaydın ortasında olan kurucu yazdığı her şeyi bir kez kaybediyordu. Alan
  // adları değişmedi; değişen adım sırası olduğundan taslak İLK adımdan açılır.
  it.each([
    ["sürümsüz (dağıtımdan önceki kodun yazdığı biçim)", { step: 2, f: FORM }],
    ["sürüm 1", { v: 1, step: 1, f: FORM }],
    ["sürümsüz, adımı bozuk", { step: "2", f: FORM }],
  ])("%s taslak ATILMAZ: alan değerleri aynen, adım 0; depoya bugünkü biçimde yazılır", (_label, stored) => {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
    expect(readOnboardingDraft("u1")).toEqual({ step: 0, f: FORM });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ v: ONBOARDING_DRAFT_VERSION, step: 0, f: FORM });
    // İkinci okuma (ikinci yenileme) aynı taslağı bulur.
    expect(readOnboardingDraft("u1")).toEqual({ step: 0, f: FORM });
  });

  it("taşınan taslakta kurucu ilerleyince yeni adım saklanır (bir daha başa dönmez)", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ step: 2, f: FORM }));
    expect(readOnboardingDraft("u1")?.step).toBe(0);
    saveOnboardingDraft("u1", { step: 1, f: FORM });
    expect(readOnboardingDraft("u1")).toEqual({ step: 1, f: FORM });
  });

  it.each([
    ["yeni sürüm (eski sekmede açık kalmış yeni kod)", { v: ONBOARDING_DRAFT_VERSION + 1, step: 1, f: FORM }],
    ["metin sürüm", { v: String(ONBOARDING_DRAFT_VERSION), step: 1, f: FORM }],
    ["boş sürüm", { v: null, step: 1, f: FORM }],
    ["sıfır sürüm", { v: 0, step: 1, f: FORM }],
  ])("bilinmeyen biçim — %s — okunmaz ve depodan silinir", (_label, stored) => {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
    expect(readOnboardingDraft("u1")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("bozuk kayıt çökertmez; adımı sayı olmayan taslak ilk adımda açılır", () => {
    sessionStorage.setItem(KEY, "{bozuk");
    expect(readOnboardingDraft("u1")).toBeNull();
    sessionStorage.setItem(KEY, JSON.stringify({ v: ONBOARDING_DRAFT_VERSION, step: 1 }));
    expect(readOnboardingDraft("u1")).toBeNull();
    sessionStorage.setItem(KEY, JSON.stringify({ v: ONBOARDING_DRAFT_VERSION, step: "2", f: FORM }));
    expect(readOnboardingDraft("u1")).toEqual({ step: 0, f: FORM });
  });

  it("anahtar kullanıcıya bağlı: başka hesabın taslağı okunmaz; kimliksiz çağrı yazmaz", () => {
    saveOnboardingDraft("u2", { step: 1, f: FORM });
    expect(readOnboardingDraft("u1")).toBeNull();
    expect(readOnboardingDraft("u2")).toEqual({ step: 1, f: FORM });
    saveOnboardingDraft("", { step: 1, f: FORM });
    expect(readOnboardingDraft("")).toBeNull();
    expect(sessionStorage.length).toBe(1);
  });

  it("tamamlanınca ve çıkışta silinir", () => {
    saveOnboardingDraft("u1", { step: 1, f: FORM });
    clearOnboardingDraft("u1");
    expect(readOnboardingDraft("u1")).toBeNull();
    saveOnboardingDraft("u1", { step: 1, f: FORM });
    clearTenantSessionData();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
