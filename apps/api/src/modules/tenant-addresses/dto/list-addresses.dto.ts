import { IsBooleanString, IsEnum, IsOptional } from "class-validator";
import { AddressTypeDto } from "./create-address.dto";

export class ListAddressesDto {
  @IsOptional()
  @IsEnum(AddressTypeDto)
  type?: AddressTypeDto;

  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}
