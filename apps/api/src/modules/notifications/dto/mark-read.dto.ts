import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class MarkReadDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}
