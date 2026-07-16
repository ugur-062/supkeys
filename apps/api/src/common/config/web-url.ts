import type { ConfigService } from "@nestjs/config";

const DEV_FALLBACK = "http://localhost:3000";

/**
 * E-posta linklerinin kök URL'i — TEK KAYNAK (eskiden 14 yerde
 * `config.get("WEB_URL") ?? "http://localhost:3000"` tekrarlanıyordu).
 * Prod'da WEB_URL zorunlu (assertProdWebUrl boot'ta doğrular → localhost'a
 * düşemez); dev'de localhost fallback.
 */
export function resolveWebUrl(config: ConfigService): string {
  const url = config.get<string>("WEB_URL");
  return url && url.trim() !== "" ? url : DEV_FALLBACK;
}

/**
 * Boot guard (fail-closed): production'da WEB_URL SET + non-localhost olmalı,
 * aksi halde THROW → deploy fail. Eskiden fail-OPEN'dı: WEB_URL prod'da unset
 * ise TÜM e-posta linkleri (reset/davet/doğrulama) sessizce `localhost:3000`'e
 * düşüp ölü link gönderiyordu. R2/Supabase env boot-guard deseniyle aynı.
 */
export function assertProdWebUrl(config: ConfigService): void {
  if (config.get<string>("NODE_ENV") !== "production") return;
  const url = config.get<string>("WEB_URL");
  if (!url || url.trim() === "") {
    throw new Error(
      "WEB_URL prod'da ZORUNLU — e-posta linkleri (şifre sıfırlama/davet/doğrulama) bu köke kurulur; boş bırakılırsa link'ler localhost'a düşer ve kullanıcıya ölü link gider.",
    );
  }
  if (/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error(
      `WEB_URL prod'da localhost olamaz (aldı: "${url}") — e-posta linkleri erişilemez olur. Gerçek domain'i verin (ör. https://app.rothern.com).`,
    );
  }
}
