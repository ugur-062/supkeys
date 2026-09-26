import { IsInt, Max, Min } from "class-validator";
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
}
