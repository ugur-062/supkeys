import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class EliminateBidDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
