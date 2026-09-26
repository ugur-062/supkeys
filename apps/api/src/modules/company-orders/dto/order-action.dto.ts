import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Trim } from "../../../common/decorators/trim.decorator";
import { tApi } from "../../../common/i18n/i18n.service";

/**
 * Sipariş akış adımı DTO'ları (eski sistemle birebir).
 * Kabul: tahmini teslim tarihi zorunlu; banka hesabı KAYITLI hesaplardan
 * seçilir (Ayarlar → Banka Hesapları) — elle IBAN girilmez. Gönder: fatura no.
 */
export class AcceptOrderDto {
  /** Opsiyonel (2026-08-02): kabulde tekrar tarih SORULMAZ — teslim bilgisi
   *  teklifle gelir; verilmezse award snapshot'ındaki kalem teslim
   *  tarihlerinin en geci siparişe yazılır. */
  @IsOptional()
  @IsDateString({}, { message: () => tApi("api.dto.orderAction.gecerliBirTeslimTarihiGirin") })
  expectedDeliveryDate?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  acceptedNote?: string;

  /** Ayarlar → Banka Hesapları'ndan seçilen hesabın id'si. Genelde zorunlu
   *  (alıcının ödeyeceği hesap); S1: LC/vesaik mukabilinde OPSİYONEL (ödeme
   *  banka kanalından gider) — zorunluluk servis katmanında kategoriye göre. */
  @IsOptional()
  @Trim()
  @IsString({ message: () => tApi("api.dto.orderAction.gecersizBankaHesabiSecimi") })
  @MaxLength(60)
  bankAccountId?: string;
}

export class ShipOrderDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: () => tApi("api.dto.orderAction.faturaNumarasiZorunludur") })
  @MaxLength(100)
  invoiceNumber!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}

/** Teslim alma / tamamlama notu (opsiyonel). */
export class OrderNoteDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// Revizyon DTO'ları kaldırıldı (2026-08-02) — özellik söküldü.
