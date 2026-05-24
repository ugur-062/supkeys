import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  // RBAC override (JSON) — guard yükler, /auth/me ek sorgu yapmadan kullanır.
  permissionsOverride: unknown;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    membershipEndAt: Date | null;
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
