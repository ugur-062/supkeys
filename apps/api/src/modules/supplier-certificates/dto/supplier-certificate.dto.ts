import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

// G9 madde 26 — sertifika dosyası için presigned PUT isteği.
export class RequestCertUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  filename!: string;

  @IsIn(ALLOWED, { message: "PDF veya görsel (JPG/PNG/WebP) yükleyin" })
  mimeType!: string;
}

// Yükleme tamamlanınca kayıt (key + ad).
export class CreateCertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;
}
