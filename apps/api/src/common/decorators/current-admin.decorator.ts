import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
