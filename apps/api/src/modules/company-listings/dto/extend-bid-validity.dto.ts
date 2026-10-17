import { IsInt, IsOptional, Max, Min } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class ExtendBidValidityDto {
  @IsInt({
    message: () => tApi("api.dto.extendBidValidity.gunSayisiTamSayiOlmali"),
  })
  @Min(1, {
    message: () => tApi("api.dto.extendBidValidity.enAz1GunUzatilabilir"),
  })
  @Max(365, {
    message: () =>
      tApi("api.dto.extendBidValidity.tekSeferdeEnFazla365GunUzatilabilir"),
  })
  additionalDays!: number;

  /**
   * İstemcinin uzattığı andaki süre (gün). Verilirse ve sunucudaki süre artık
   * farklıysa uzatma uygulanmaz (409) — yeniden deneme / ikinci sekme aynı
   * uzatmayı ikinci kez eklemesin (arayüz testi FX-00 yeniden doğrulama).
   * Opsiyonel: eski istemciler etkilenmez.
   */
  @IsOptional()
  @IsInt({
    message: () => tApi("api.dto.extendBidValidity.gunSayisiTamSayiOlmali"),
  })
  @Min(1, {
    message: () => tApi("api.dto.extendBidValidity.gunSayisiTamSayiOlmali"),
  })
  expectedValidityDays?: number;
}
