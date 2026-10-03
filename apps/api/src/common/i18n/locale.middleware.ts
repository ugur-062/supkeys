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
  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers["accept-language"];
    // Yanıt (hata mesajı, çevrilmiş ad/özet, para birimi) bu başlığa göre
    // değişir → paylaşımlı önbellek dili ayırmalı. Herkese açık uçlar
    // `s-maxage` taşıyor ve yalnız geo ucu `Vary` ekliyordu; ilk isteğin dili
    // herkese dağıtılabiliyordu (yayın denetimi 2026-09-28 Bölüm 5). `vary`
    // EKLER (CORS'un `Vary: Origin`ini ezmez).
    res.vary?.("Accept-Language");
    runWithLocale(Array.isArray(header) ? header[0] : header, () => next());
  }
}
