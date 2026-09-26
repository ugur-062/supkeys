import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runWithLocale } from "./locale-context";

/**
 * Her isteği dil bağlamıyla sarar (`Accept-Language` → ALS). Tenant
 * middleware'iyle aynı kalıp: `run()` `next()`'i sarar, downstream (guard,
 * pipe, handler, filtre) aynı async bağlamda kalır.
 */
@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers["accept-language"];
    runWithLocale(Array.isArray(header) ? header[0] : header, () => next());
  }
}
