import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  /** AdminJwtStrategy DB'den taze okur; AdminRolesGuard 2FA kapısı kullanır. */
  twoFactorEnabled?: boolean;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
