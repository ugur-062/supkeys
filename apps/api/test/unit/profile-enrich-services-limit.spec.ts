import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { COMPANY_SERVICE_MAX_LENGTH } from "@rothern/shared";
import { aiDraftServices } from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import { UpdateCompanyProfileDto } from "../../src/modules/company-profile/dto/update-company-profile.dto";

/**
 * Derin denetim 2026-09-29 S069 — AI profil doldurma hizmet basliklarini 80'e
 * kirpiyordu, PATCH /company/profile DTO'su ise 60'ta reddediyordu: AI taslagini
 * uygulayan kullanicinin ilk Kaydet'i 400 ile dusuyordu. Iki taraf artik ayni
 * sabiti (`COMPANY_SERVICE_MAX_LENGTH`) okur.
 */
describe("aiDraftServices — DTO ile ayni uzunluk tavani", () => {
  const long = "Endustriyel otomasyon sistemleri kurulumu ve periyodik bakim hizmetleri"; // 72

  it("tavandan uzun hizmet DTO sinirina kirpilir", () => {
    const out = aiDraftServices([long, "  Kaynak  ", "", 42]);
    expect(out[0]!.length).toBeLessThanOrEqual(COMPANY_SERVICE_MAX_LENGTH);
    expect(out).toEqual([long.slice(0, COMPANY_SERVICE_MAX_LENGTH).trim(), "Kaynak"]);
  });

  it("AI taslagindaki hizmetler PATCH DTO dogrulamasindan gecer", () => {
    const services = aiDraftServices([long, "x".repeat(200)]);
    const errors = validateSync(plainToInstance(UpdateCompanyProfileDto, { services }) as object);
    expect(errors.filter((e) => e.property === "services")).toEqual([]);
  });

  it("DTO tavandan uzun hizmeti reddeder (sinir gercekten ayni)", () => {
    const errors = validateSync(
      plainToInstance(UpdateCompanyProfileDto, { services: ["x".repeat(COMPANY_SERVICE_MAX_LENGTH + 1)] }) as object,
    );
    expect(errors.some((e) => e.property === "services")).toBe(true);
  });

  it("dizi degilse bos liste, en fazla 12", () => {
    expect(aiDraftServices("abc")).toEqual([]);
    expect(aiDraftServices(Array.from({ length: 20 }, (_, i) => `h${i}`))).toHaveLength(12);
  });
});
