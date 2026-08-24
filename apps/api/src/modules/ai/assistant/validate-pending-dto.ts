import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

/**
 * Onaylanan `pendingAction` payload'ını YÜRÜTMEDEN ÖNCE gerçek DTO'suyla
 * doğrular (denetim 2026-08-24 Parça 6).
 *
 * Neden gerekli: confirm ucu gövde ALMAZ — yürütülecek DTO, aksiyon üretilirken
 * DB'ye (AiChatSession.pendingAction) yazılan JSON'dan okunup servise
 * `as PlaceBidDto` / `as CreateListingDto` şeklinde veriliyordu. Bu yalnız
 * DERLEME-ZAMANI bir iddiadır; HTTP yolundaki global ValidationPipe bu payload'a
 * hiç dokunmaz. Sonuç: normal uçta reddedilecek değerler (ör. 2 ondalıktan
 * fazla birim fiyat) AI yolundan geçip kazandırılamayan teklif üretebiliyordu.
 *
 * Aynı DTO sınıfını kullanır → tek kaynak; kural değişirse AI yolu da uyar.
 */
export function validatePendingDto<T extends object>(
  cls: new () => T,
  raw: unknown,
): T {
  const instance = plainToInstance(cls, raw ?? {}, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
    validationError: { target: false },
  });
  if (errors.length > 0) {
    const first = errors[0]!;
    const detail = Object.values(first.constraints ?? {})[0] ?? first.property;
    throw new BadRequestException(
      `Onaylanan işlem doğrulamadan geçmedi (${detail}) — lütfen ilgili sayfadan tekrar deneyin.`,
    );
  }
  return instance;
}
