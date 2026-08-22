import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { resolveClientIp } from "./client-ip";

/** `@Ip()` yerine — Cloudflare arkasında gerçek istemci IP'si (bkz. client-ip.ts). */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    resolveClientIp(ctx.switchToHttp().getRequest()),
);
