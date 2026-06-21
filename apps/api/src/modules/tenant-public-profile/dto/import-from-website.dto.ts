import { IsString, IsUrl, MaxLength } from "class-validator";

export class ImportFromWebsiteDto {
  @IsString()
  @IsUrl({ require_protocol: true }, { message: "Geçerli bir web sitesi (https://...) girin" })
  @MaxLength(300)
  website!: string;
}
