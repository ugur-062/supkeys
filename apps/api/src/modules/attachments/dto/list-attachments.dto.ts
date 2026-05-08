import { AttachmentScope } from "@supkeys/db";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class ListAttachmentsDto {
  @IsEnum(AttachmentScope, { message: "Geçersiz scope" })
  scope!: AttachmentScope;

  @IsString()
  @IsNotEmpty({ message: "scopeRefId zorunlu" })
  scopeRefId!: string;
}
