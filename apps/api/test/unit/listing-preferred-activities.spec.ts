// `@Type` süslemesi çözümleme anında Reflect.getMetadata ister — bu birim
// testi Nest önyüklemesi yapmadığı için polyfill ELLE yüklenmeli.
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MAX_COMPANY_ACTIVITIES } from "@rothern/shared";
import { CreateListingDto } from "../../src/modules/company-listings/dto/create-listing.dto";

/**
 * ARANAN TEDARİKÇİ TİPİ — SÖZLEŞME.
 *
 * NEDEN EKLENDİ: `Company.activities` 2026-09-06'dan beri toplanıyordu ama
 * ölçüldü (2026-09-14) — `activities` kelimesi `company-listings.service.ts`,
 * `company-affinity.service.ts` ve `supplier-discovery.service.ts` içinde
 * SIFIR kez geçiyordu. Yani "alıcı üreticiyi bayiden ayırt etsin" fikri
 * yalnız kullanıcı ELLE süzerse işliyordu; hiçbir otomatik seçimde ağırlığı
 * yoktu. Eksik halka alıcı tarafıydı: tercihi söyleyecek alan yoktu.
 *
 * Bu dosya iki değişmezi tutar:
 *  1. tavan `MAX_COMPANY_ACTIVITIES` — firma beyanıyla AYNI sabit; beşin
 *     hepsini isteyen alıcı hiçbir şey söylememiş olur.
 *  2. yalnız bilinen kodlar — serbest metin eşleştirmeyi sessizce bozardı.
 *
 * Sıralama davranışının kendisi (eleme DEĞİL öne alma) servis testinde.
 */
describe("Listing.preferredActivities — DTO kapısı", () => {
  const taban = {
    title: "Çelik boru alımı",
    type: "RFQ",
    visibility: "PUBLIC",
  };

  async function hatalar(payload: object) {
    const errs = await validate(plainToInstance(CreateListingDto, payload));
    return errs.filter((e) => e.property === "preferredActivities");
  }

  it("alan İSTEĞE BAĞLI — tercih belirtmeyen alıcının akışı uzamaz", async () => {
    expect(await hatalar(taban)).toHaveLength(0);
  });

  it("boş dizi geçerli — 'fark etmez' açık bir cevaptır", async () => {
    expect(await hatalar({ ...taban, preferredActivities: [] })).toHaveLength(0);
  });

  it("tavan kadar seçim geçer", async () => {
    expect(
      await hatalar({
        ...taban,
        preferredActivities: [
          "MANUFACTURER",
          "DISTRIBUTOR",
          "IMPORTER_EXPORTER",
        ].slice(0, MAX_COMPANY_ACTIVITIES),
      }),
    ).toHaveLength(0);
  });

  it("tavanın üstü REDDEDİLİR — hepsini isteyen hiçbir şey söylememiştir", async () => {
    expect(
      await hatalar({
        ...taban,
        preferredActivities: [
          "MANUFACTURER",
          "DISTRIBUTOR",
          "SERVICE_PROVIDER",
          "IMPORTER_EXPORTER",
          "CONTRACT_MANUFACTURER",
        ],
      }),
    ).toHaveLength(1);
  });

  it("bilinmeyen kod REDDEDİLİR — serbest metin eşleştirmeyi sessizce bozar", async () => {
    expect(
      await hatalar({ ...taban, preferredActivities: ["TOPTANCI"] }),
    ).toHaveLength(1);
  });
});
