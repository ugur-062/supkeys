import { AttachmentScope } from "@supkeys/db";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export class RequestUploadUrlDto {
  @IsEnum(AttachmentScope, { message: "Geçersiz scope" })
  scope!: AttachmentScope;

  @IsString()
  @IsNotEmpty({ message: "scopeRefId zorunlu" })
  scopeRefId!: string;

  @IsString()
  @IsNotEmpty({ message: "Dosya adı zorunlu" })
  @MaxLength(255, { message: "Dosya adı 255 karakteri aşamaz" })
  originalFilename!: string;

  @IsString()
  @IsNotEmpty({ message: "MIME tipi zorunlu" })
  @MaxLength(127)
  mimeType!: string;

  @IsInt()
  @Min(1, { message: "Dosya boş olamaz" })
  @Max(MAX_FILE_SIZE_BYTES, { message: "Dosya 50 MB'tan büyük olamaz" })
  fileSize!: number;
}
