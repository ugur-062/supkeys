import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class BatchInvitationsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 e-posta gerekli" })
  @ArrayMaxSize(50, { message: "En fazla 50 e-posta gönderilebilir" })
  @IsEmail({}, { each: true, message: "Geçersiz e-posta formatı" })
  emails!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class PreviewInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export type BatchInvitationFailureReason =
  | "ALREADY_INVITED"
  | "ALREADY_SUPPLIER";

export interface BatchInvitationResult {
  email: string;
  success: boolean;
  invitationId?: string;
  reason?: BatchInvitationFailureReason;
}

export interface BatchInvitationResponse {
  results: BatchInvitationResult[];
  summary: { total: number; success: number; failed: number };
}
