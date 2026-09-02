import {
  CanActivate,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

/**
 * PAZAR YERİ YAYIN ANAHTARI — sunucu tarafı.
 *
 * Web'deki `NEXT_PUBLIC_MARKETPLACE_LIVE` yalnız SAYFALARI kapatır; uçlar açık
 * kalsaydı `api.rothern.com/api/public/listings` adresini bilen herkes veriye
 * ulaşırdı ve anahtar yarım bir söz olurdu. Kapı iki yerde de var.
 *
 * FAIL-CLOSED: env yoksa KAPALI. Yanlış tarafa düşmenin bedeli asimetrik —
 * kapalıyken açık sanmak yalnız boş bir sayfa üretir, açıkken kapalı sanmak
 * yayımlanmamış veriyi dışarı verir.
 *
 * 404 döner, 403 değil: kapalıyken bu uçların VAR OLDUĞUNU bile söylememize
 * gerek yok.
 *
 * Açmak için Render'da `MARKETPLACE_LIVE=true`. Web tarafındaki anahtarla
 * BİRLİKTE açılmalı; yalnız web açılırsa pazar yeri boş görünür (görünür ve
 * teşhis edilebilir bir hata — sessiz sızıntının tersi).
 */
export function isMarketplaceLive(): boolean {
  return process.env.MARKETPLACE_LIVE === "true";
}

@Injectable()
export class MarketplaceLiveGuard implements CanActivate {
  canActivate(): boolean {
    if (!isMarketplaceLive()) {
      throw new NotFoundException("Bulunamadı");
    }
    return true;
  }
}
