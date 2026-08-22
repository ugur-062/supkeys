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
  // 2026-08-22 FIX: "gallery" eksikti → galeri + sertifika görseli yüklemesi
  // commit adımında 400 ("kind: Geçersiz seçim") alıyor, fotoğraf hiç
  // eklenemiyordu (upload-url gallery'yi kabul ediyordu, commit etmiyordu).
  @IsIn(["logo", "cover", "gallery"])
  kind!: "logo" | "cover" | "gallery";

  @IsString()
  @MaxLength(500)
  key!: string;
}
