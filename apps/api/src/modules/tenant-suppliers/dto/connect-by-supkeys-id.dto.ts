import { IsString, MaxLength, MinLength } from "class-validator";

/** Faz 3 madde 6 — alıcı, Supkeys ID ile tedarikçi ekler. */
export class ConnectBySupkeysIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  supkeysId!: string;
}
