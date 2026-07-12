import { IsInt, Max, Min } from "class-validator";

export class ExtendBidValidityDto {
  @IsInt({ message: "Gün sayısı tam sayı olmalı" })
  @Min(1, { message: "En az 1 gün uzatılabilir" })
  @Max(365, { message: "Tek seferde en fazla 365 gün uzatılabilir" })
  additionalDays!: number;
}
