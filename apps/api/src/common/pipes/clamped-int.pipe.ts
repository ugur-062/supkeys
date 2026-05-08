import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";

export interface ClampedIntPipeOptions {
  /** Minimum kabul edilebilir değer (varsayılan: 1) */
  min?: number;
  /** Maksimum kabul edilebilir değer (varsayılan: 100) */
  max?: number;
  /** undefined / null / boş string için kullanılan değer (varsayılan: 10) */
  default?: number;
}

/**
 * Sayısal query parametreleri için katı doğrulama + clamp.
 *
 * `ParseIntPipe + DefaultValuePipe` kombinasyonu non-numeric string'leri
 * (`abc`, `1e3`) sessizce NaN'a düşürüp clamp'i atlayabiliyordu (Bug #3).
 *
 * Davranış:
 *   - undefined / null / `""` → `default`
 *   - non-integer string (`abc`, `1.5`, `1e3`) → 400 BadRequestException
 *   - integer + Number.isFinite → `Math.max(min, Math.min(max, value))` ile clamp
 */
@Injectable()
export class ClampedIntPipe implements PipeTransform {
  private readonly min: number;
  private readonly max: number;
  private readonly defaultValue: number;

  constructor(options: ClampedIntPipeOptions = {}) {
    this.min = options.min ?? 1;
    this.max = options.max ?? 100;
    this.defaultValue = options.default ?? 10;
  }

  transform(value: unknown, metadata: ArgumentMetadata): number {
    if (value === undefined || value === null || value === "") {
      return this.defaultValue;
    }

    // Global ValidationPipe transform: true → query string sayısal değilse
    // value = NaN gelir. Doğrudan number geldiyse Number.isInteger ile kontrol.
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new BadRequestException(
          `${metadata.data ?? "parameter"} must be a valid integer`,
        );
      }
      return Math.max(this.min, Math.min(this.max, value));
    }

    // String yolu: sadece /^-?\d+$/ kabul (1, 42, -5).
    // 1.5 / 1e3 / abc / Infinity reddedilir.
    const str = String(value).trim();
    if (!/^-?\d+$/.test(str)) {
      throw new BadRequestException(
        `${metadata.data ?? "parameter"} must be a valid integer (got "${value}")`,
      );
    }

    const parsed = Number(str);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new BadRequestException(
        `${metadata.data ?? "parameter"} must be a valid integer (got "${value}")`,
      );
    }

    return Math.max(this.min, Math.min(this.max, parsed));
  }
}
