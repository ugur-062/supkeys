import { IsString } from "class-validator";

export class TestConfirmPaymentDto {
  @IsString()
  paymentId!: string;
}
