import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  REQUEST_DEFAULTS_FALLBACK,
  defaultCurrencyForCountry,
  isValidForeignTaxId,
  isValidTaxIdForCountry,
  requestDefaultsFallbackFor,
} from "@rothern/shared";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { UpdateMeDto } from "../../src/modules/company-auth/dto/account.dto";
import { AcceptCompanyInvitationDto, UpdateUserDto } from "../../src/modules/company-users/dto/company-user.dto";
import { UpsertAddressDto } from "../../src/modules/company-addresses/dto/company-address.dto";
import { CompleteOnboardingDto } from "../../src/modules/company-auth/dto/onboarding.dto";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";

/**
 * Kayıt tüm ülkelere açıldıktan sonraki denetim düzeltmeleri (2026-09-27).
 */
function errorsOf<T extends object>(cls: new () => T, body: Record<string, unknown>, field: string) {
  return validateSync(plainToInstance(cls, body) as object).filter((e) => e.property === field);
}

describe("tek harfli ad/soyad (Çin, Kore, Vietnam …)", () => {
  it.each([
    [CompanySignupDto],
    [AcceptCompanyInvitationDto],
    [UpdateMeDto],
    [UpdateUserDto],
  ] as const)("%p: 'W' geçerli, boş/boşluk geçersiz", (cls) => {
    expect(errorsOf(cls as never, { firstName: "W", lastName: "L" }, "firstName")).toHaveLength(0);
    expect(errorsOf(cls as never, { firstName: "W", lastName: "L" }, "lastName")).toHaveLength(0);
    expect(errorsOf(cls as never, { firstName: "   " }, "firstName")).not.toHaveLength(0);
    expect(errorsOf(cls as never, { firstName: "x".repeat(81) }, "firstName")).not.toHaveLength(0);
  });
});

describe("adres DTO tavanları onboarding ile aynı", () => {
  it("vergi no 30, eyalet/bölge 100 karakter kabul", () => {
    const body = { type: "FATURA", title: "Merkez", addressLine: "Leopoldstr. 1", taxNumber: "X".repeat(30), stateRegion: "B".repeat(100) };
    expect(errorsOf(UpsertAddressDto, body, "taxNumber")).toHaveLength(0);
    expect(errorsOf(UpsertAddressDto, body, "stateRegion")).toHaveLength(0);
    expect(errorsOf(UpsertAddressDto, { ...body, taxNumber: "X".repeat(31) }, "taxNumber")).not.toHaveLength(0);
  });
  it("onboarding ayrı teslimat eyaleti ≤100", () => {
    expect(errorsOf(CompleteOnboardingDto, { deliveryStateRegion: "Bayern" }, "deliveryStateRegion")).toHaveLength(0);
    expect(errorsOf(CompleteOnboardingDto, { deliveryStateRegion: "B".repeat(101) }, "deliveryStateRegion")).not.toHaveLength(0);
  });
});

describe("yabancı vergi no — Latin harfler + '&'", () => {
  it("Meksika RFC'si (Ñ ve &) kabul", () => {
    expect(isValidForeignTaxId("AÑ&850101AB1")).toBe(true);
    expect(isValidForeignTaxId("GODE561231GR8")).toBe(true);
    expect(isValidTaxIdForCountry("AÑ&850101AB1", "MX", false)).toBe(true);
  });
  it("biçim hâlâ sınırlı: kısa, Latin dışı yazı, yasak işaret reddedilir", () => {
    expect(isValidForeignTaxId("AB")).toBe(false);
    expect(isValidForeignTaxId("税号123456")).toBe(false);
    expect(isValidForeignTaxId("ABC<script>")).toBe(false);
  });
  it("TR kuralı gevşemez", () => {
    expect(isValidTaxIdForCountry("AÑ&850101AB1", "TR", false)).toBe(false);
    expect(isValidTaxIdForCountry("123456789", "TR", false)).toBe(false);
  });
});

describe("talep varsayılan para birimi firmanın ülkesinden", () => {
  it("TR/KKTC → TRY, AB → EUR, desteklenen yerel birim → o, diğerleri → USD", () => {
    expect(defaultCurrencyForCountry("TR")).toBe("TRY");
    expect(defaultCurrencyForCountry("XN")).toBe("TRY");
    expect(defaultCurrencyForCountry("DE")).toBe("EUR");
    expect(defaultCurrencyForCountry("PL")).toBe("EUR");
    expect(defaultCurrencyForCountry("GB")).toBe("GBP");
    expect(defaultCurrencyForCountry("AE")).toBe("AED");
    expect(defaultCurrencyForCountry("BR")).toBe("USD");
    expect(defaultCurrencyForCountry(null)).toBe("TRY");
  });
  it("yedek yalnız para birimini değiştirir", () => {
    expect(requestDefaultsFallbackFor("DE")).toEqual({ ...REQUEST_DEFAULTS_FALLBACK, primaryCurrency: "EUR", allowedCurrencies: ["EUR"] });
    expect(requestDefaultsFallbackFor("TR")).toEqual(REQUEST_DEFAULTS_FALLBACK);
  });
});

describe("admin firma düzeltme — ülke kodu ve banka bilgisi", () => {
  function rig(before: Record<string, unknown>) {
    const prisma = {
      company: {
        findUnique: jest.fn(async () => ({
          name: "Acme", legalName: null, taxNumber: null, taxOffice: null, mersisNo: null,
          tradeRegistryNo: null, country: "TR", stateRegion: null, city: null, addressLine: null,
          billingEmail: null, website: null, industry: null, iban: null, ibanHolder: null,
          bankSwiftBic: null, bankName: null, ...before,
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const audit = { log: jest.fn(async () => undefined) };
    const svc = new AdminCompaniesService(prisma as never, {} as never, {} as never, {} as never, {} as never, audit as never, {} as never);
    return { svc, prisma };
  }

  it("listede olmayan 2 harfli ülke kodu reddedilir", async () => {
    const { svc, prisma } = rig({});
    await expect(svc.updateProfile("c1", { country: "zz" }, "a1")).rejects.toThrow();
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it("IBAN'sız ülkede hesap no değişince SWIFT + banka adı ister; verilince yazar (SWIFT normalize)", async () => {
    const { svc, prisma } = rig({ country: "IN" });
    await expect(svc.updateProfile("c1", { iban: "50100123456789" }, "a1")).rejects.toThrow();
    await expect(
      svc.updateProfile("c1", { iban: "50100123456789", bankSwiftBic: "hdfc in bb", bankName: "HDFC Bank" }, "a1"),
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankSwiftBic: "HDFCINBB", bankName: "HDFC Bank" }) }),
    );
  });

  it("geçersiz SWIFT reddedilir", async () => {
    const { svc } = rig({ country: "DE", iban: "DE89370400440532013000" });
    await expect(svc.updateProfile("c1", { bankSwiftBic: "XX" }, "a1")).rejects.toThrow();
  });
});
