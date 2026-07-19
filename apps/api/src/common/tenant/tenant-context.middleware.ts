import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runWithTenantContext } from "./tenant-context";

/**
 * Her istekte TENANT bağlamını (mutable store) açar — RLS plumbing (Faz 1a).
 * companyId başta null; guard'lardan sonra TenantContextInterceptor doldurur.
 * `run()` `next()`'i sararak isteğin tüm downstream'ini (guard/interceptor/
 * handler + awaited servis çağrıları) aynı async context'te tutar.
 *
 * Sorgu davranışını DEĞİŞTİRMEZ — bağlam bugün hiçbir yerde okunmaz.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithTenantContext({ companyId: null, realm: null }, () => next());
  }
}
