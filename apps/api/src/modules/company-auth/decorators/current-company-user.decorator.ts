import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedCompanyUser } from "../strategies/company-jwt.strategy";

export type { AuthenticatedCompanyUser };

export const CurrentCompanyUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCompanyUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
