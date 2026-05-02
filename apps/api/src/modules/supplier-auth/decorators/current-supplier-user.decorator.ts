import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedSupplierUser } from "../strategies/supplier-jwt.strategy";

export type { AuthenticatedSupplierUser };

export const CurrentSupplierUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSupplierUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
