import { IsOptional, IsString, MaxLength } from "class-validator";

export class CompleteOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  completedNote?: string;
}
