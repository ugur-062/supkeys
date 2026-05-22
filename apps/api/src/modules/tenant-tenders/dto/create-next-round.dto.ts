import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
} from "class-validator";
import { TenderTypeDto } from "./create-tender.dto";

export enum BidCarryMode {
  /** Önceki SUBMITTED teklifleri yeni turda otomatik DRAFT bid olarak oluştur. */
  AUTO = "AUTO",
  /** Sadece form prefill — tedarikçi teklif sayfasını açtığında önceki değerler doldurulur. */
  LAZY = "LAZY",
  /** Hiç taşıma yok. */
  NONE = "NONE",
}

/**
 * V2-7 — "Yeni Tur Oluştur" payload'ı.
 * Önceki tender (IN_AWARD / OPEN_FOR_BIDS) tabanlı yeni Tender türetir.
 * Items + categories + addresses + auction settings kopyalanır;
 * invitations carryBids ve eliminateNonBidders'a göre filtrelenir.
 */
export class CreateNextRoundDto {
  /** Yeni tur ihale tipi. Önceki turdan bağımsız değiştirilebilir. */
  @IsEnum(TenderTypeDto)
  type!: TenderTypeDto;

  /** Önceki teklifleri taşıma modu. */
  @IsEnum(BidCarryMode)
  carryBids!: BidCarryMode;

  /** Önceki turda SUBMITTED teklif vermeyen tedarikçileri davet dışı bırak. */
  @IsBoolean()
  eliminateNonBidders!: boolean;

  /**
   * true → bidsOpenAt=null, yeni tender oluşturulur oluşturulmaz yayına alınır.
   * false → bidsOpenAt zorunlu, scheduled bir başlangıç.
   */
  @IsBoolean()
  openImmediately!: boolean;

  @IsOptional()
  @IsDateString()
  bidsOpenAt?: string;

  @IsDateString()
  bidsCloseAt!: string;

  /** Açılış öncesi tedarikçi ön izleyebilsin (status=OPEN_FOR_BIDS değil ama görünür). */
  @IsOptional()
  @IsBoolean()
  previewBeforeOpen?: boolean;

  /** Snipe koruma override (tender modelinde alan var; bu da set'leyebilir). */
  @IsOptional()
  @IsBoolean()
  autoExtendOnLateBid?: boolean;
}
