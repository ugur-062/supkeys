import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedSupplierUser } from "../strategies/supplier-jwt.strategy";

/**
 * G6 madde 20 — Yalnızca firma yöneticisi (isManager) erişebilir.
 * SupplierJwtAuthGuard'tan SONRA çalışır (req.user dolu olmalı).
 */
@Injectable()
export class SupplierManagerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedSupplierUser | undefined;
    if (!user?.supplierUserId) {
      throw new ForbiddenException("Yetkisiz");
    }
    const su = await this.prisma.supplierUser.findUnique({
      where: { id: user.supplierUserId },
      select: { isManager: true },
    });
    if (!su?.isManager) {
      throw new ForbiddenException(
        "Bu işlemi yalnızca firma yöneticisi yapabilir",
      );
    }
    return true;
  }
}
