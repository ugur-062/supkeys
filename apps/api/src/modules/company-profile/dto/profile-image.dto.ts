import { IsIn, IsString, MaxLength } from "class-validator";

export class ProfileImageUploadDto {
  @IsIn(["logo", "cover", "gallery"])
  kind!: "logo" | "cover" | "gallery";

  @IsString()
  @MaxLength(300)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;
}

export class ProfileImageCommitDto {
  @IsIn(["logo", "cover"])
  kind!: "logo" | "cover";

  @IsString()
  @MaxLength(500)
  key!: string;
}
