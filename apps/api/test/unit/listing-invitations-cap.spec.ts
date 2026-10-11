import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { MAX_LISTING_INVITATIONS } from "@rothern/shared";
import { CreateListingDto } from "../../src/modules/company-listings/dto/create-listing.dto";

/**
 * Derin denetim 2026-09-29 S083/S095 + MU-26 gozden gecirme — "Baglantilarim"
 * kipinde web formu alicinin TUM baglantilarini tek govdede gonderir. Govde
 * tavani 200 iken tasan kisim kayit sonrasi ayri davet cagrisina gidiyordu;
 * canli duzenlemede sunucu davetleri govdeden yeniden yazdigi icin tasan firmalar
 * her kayitta yeniden davet e-postasi aliyordu. Web ve DTO artik ayni sabiti okur.
 */
const codes = (n: number) => Array.from({ length: n }, (_, i) => `F${String(i).padStart(4, "0")}-0001`);
const inviteErrors = (invitations: string[]) =>
  validateSync(plainToInstance(CreateListingDto, { title: "Celik boru alimi", invitations }) as object).filter(
    (e) => e.property === "invitations",
  );

describe("CreateListingDto.invitations — web ile ortak tavan", () => {
  it("eski 200'luk tavani asan baglanti listesi tek govdede kabul edilir", () => {
    expect(inviteErrors(codes(260))).toEqual([]);
    expect(inviteErrors(codes(MAX_LISTING_INVITATIONS))).toEqual([]);
  });

  it("ortak tavani asan liste reddedilir (sinir gercekten ayni)", () => {
    expect(inviteErrors(codes(MAX_LISTING_INVITATIONS + 1))).toHaveLength(1);
  });
});
