import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** Sitemap parçası — sayfa numarası (0 tabanlı). Üst sınır: 50 × 20k = 1M URL. */
export class SitemapPageDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(50)
  page = 0;
}
