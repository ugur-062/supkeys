import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";

/**
 * V2-4 — Mesajlaşma endpoint'leri için tarayıcı + proxy cache'lemeyi kapatır.
 *
 * Express'in default `fresh` algoritması `If-None-Match`/`If-Modified-Since`
 * header'larıyla 304 dönebiliyor — 5sn polling'de bu yeni body'i blocklar.
 * İki cephede önlem:
 *   1) Conditional GET header'larını request seviyesinde sil (fresh check
 *      eşleşmesin → her zaman 200).
 *   2) Cache-Control: no-store (tarayıcı yeniden istek atarken cached body
 *      kullanmaz).
 */
@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Express conditional GET değerlendirmesini bypass et.
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];

    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return next.handle();
  }
}
