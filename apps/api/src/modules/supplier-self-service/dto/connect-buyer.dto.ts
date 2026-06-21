import { IsString, MaxLength, MinLength } from "class-validator";

/** Faz 3 madde 6 — alıcı havuzundan tenantId ile bağlantı isteği. */
export class ConnectToBuyerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tenantId!: string;
}

/** Faz 3 madde 6 — Supkeys ID ile alıcıya bağlantı isteği. */
export class ConnectBySupkeysIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  supkeysId!: string;
}
