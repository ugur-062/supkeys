import { IsEmail } from "class-validator";

import { tApi } from "../../../common/i18n/i18n.service";

export class CompanyForgotPasswordDto {
  @IsEmail({}, { message: () => tApi("api.dto.companyForgotPassword.gecerliEpostaGirin") })
  email!: string;
}
