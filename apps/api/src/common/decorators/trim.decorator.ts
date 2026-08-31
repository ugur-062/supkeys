import { Transform } from "class-transformer";

/**
 * Gövdeden gelen string'i doğrulamadan ÖNCE trim'ler (Dalga B, P3).
 *
 * Sorun: `@IsNotEmpty()` / `@MinLength(1)` ham değere bakıyordu, dolayısıyla
 * `"   "` (yalnız boşluk) zorunluluk kapısından GEÇİYORDU. Sipariş gönderiminde
 * fatura numarası bu şekilde boş kalabiliyor, ödeme yönteminde boşluklu değer
 * çek-alanı kuralını atlatabiliyordu — sonra DB'ye boşluk yazılıp arayüzde boş
 * görünüyor ama "dolu" sayılıyordu.
 *
 * `class-transformer` `@Transform`'u validation'dan ÖNCE koştuğu için doğru
 * katman burası (servise trim eklemek doğrulamayı düzeltmez).
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  );
}
