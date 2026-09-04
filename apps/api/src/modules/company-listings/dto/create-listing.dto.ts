import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { MAX_MONEY } from "../../../common/constants/money";
import { UNITS } from "@rothern/shared";
import { Trim } from "../../../common/decorators/trim.decorator";

/** DTO `@IsIn` için kod listesi — TEK KAYNAK UNITS. */
const UNIT_CODES = UNITS.map((u) => u.code);

/** Yalnız ALIM — satış ilanı (SATIS) 2026-09-04'te sistemden kaldırıldı. */
export enum ListingTypeDto {
  ALIM = "ALIM",
}

export enum ListingVisibilityDto {
  PUBLIC = "PUBLIC",
  CONNECTIONS = "CONNECTIONS",
  PRIVATE = "PRIVATE",
}

export enum ListingFormatDto {
  RFQ = "RFQ",
  ENGLISH_AUCTION = "ENGLISH_AUCTION",
}

export enum CurrencyDto {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
  JPY = "JPY",
  AED = "AED",
  CNY = "CNY",
  RUB = "RUB",
}

export enum DeliveryTermDto {
  DOMESTIC_DELIVERED = "DOMESTIC_DELIVERED",
  DOMESTIC_PICKUP = "DOMESTIC_PICKUP",
  DOMESTIC_CARRIER_COLLECT = "DOMESTIC_CARRIER_COLLECT",
  DOMESTIC_ON_VEHICLE = "DOMESTIC_ON_VEHICLE",
  EXW = "EXW",
  FCA = "FCA",
  CPT = "CPT",
  CIP = "CIP",
  DAP = "DAP",
  DPU = "DPU",
  DDP = "DDP",
  FAS = "FAS",
  FOB = "FOB",
  CFR = "CFR",
  CIF = "CIF",
}

export enum PaymentCategoryDto {
  ADVANCE = "ADVANCE",
  DEFERRED = "DEFERRED",
  OPEN_ACCOUNT = "OPEN_ACCOUNT",
  MAL_MUKABILI = "MAL_MUKABILI",
  CHEQUE = "CHEQUE",
  SENET = "SENET",
  LETTER_OF_CREDIT = "LETTER_OF_CREDIT",
  CASH_AGAINST_DOCS = "CASH_AGAINST_DOCS",
  CUSTOM = "CUSTOM",
}

export enum LcTypeDto {
  SIGHT = "SIGHT",
  USANCE = "USANCE",
}

export enum BidVisibilityDto {
  OWN_ONLY = "OWN_ONLY",
  BEST_PRICE = "BEST_PRICE",
  OWN_RANK = "OWN_RANK",
  BEST_AND_OWN_RANK = "BEST_AND_OWN_RANK",
  ALL = "ALL",
}

export enum AnswerTypeDto {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  YES_NO = "YES_NO",
  DATE = "DATE",
}

export class ItemQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsEnum(AnswerTypeDto)
  answerType!: AnswerTypeDto;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class ListingItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // @Max: qty × unitPrice → Decimal(18,2) taşmasını önler. 1 milyar üst sınır
  // gerçekçi B2B miktarları için bol; Decimal(18,3) kolonuna güvenle sığar.
  // NOT: unitPrice üst sınırı AYRI (docs/business-rules.md açık madde) — çarpım
  // taşmasını TAM kapatmak için o da sınırlanmalı (bu turda kapsam dışı).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;

  /**
   * Serbest metin birim (LEGACY ama zorunlu kalır — expand→contract).
   * Katalogda tanınan bir birimse `unitCode` de dolar; tanınmazsa metin
   * olduğu gibi saklanır ve kullanıcı uyarılır. Liste bilinçli KAPALI DEĞİL.
   */
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  /**
   * Kanonik birim kodu (@rothern/shared UNITS). İstemci gönderirse doğrulanır;
   * göndermezse servis `unit` metninden türetir (`normalizeUnit`).
   */
  @IsOptional()
  @IsString()
  @IsIn(UNIT_CODES, { message: "Geçersiz ölçü birimi" })
  unitCode?: string;

  // ── Faz 3: kalem detayları (hepsi opsiyonel) ─────────────────────────
  @IsOptional() @Trim() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) mpn?: string;

  /** Muadil/eşdeğer teklif kabul edilir mi (varsayılan: evet). */
  @IsOptional() @IsBoolean() alternativeAllowed?: boolean;

  @IsOptional() @Trim() @IsString() @MaxLength(5000) specification?: string;

  @IsOptional() @IsInt() @Min(0) @Max(600) warrantyMonths?: number;

  /** GTİP/HS kodu — yalnız uluslararası ilanda anlamlı, serbest bırakılır. */
  @IsOptional() @Trim() @IsString() @MaxLength(20) hsCode?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  targetPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  materialCode?: string;

  /**
   * Kalem görselleri — katalogdan eklenen ürünün kapağı (ilk = kapak). İlanın
   * kart kapağı buradan TÜRER (`coverImageUrl ?? items[0].images[0]`).
   * Sihirbazda yükleme alanı yok; yalnız ürün kaydından taşınır.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  images?: string[];

  @IsOptional()
  @IsISO8601()
  requiredByDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemQuestionDto)
  @ArrayMaxSize(20)
  questions?: ItemQuestionDto[];
}

/** Lojistik ihalesi alanları — serbest yapılı; JSON olarak saklanır. */
export class LogisticsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  transportMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  originCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  originDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  originAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  destinationCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  destinationDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cargoType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeM3?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  packageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleType?: string;

  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  @IsOptional()
  @IsBoolean()
  refrigerated?: boolean;

  @IsOptional()
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  // Serbest metin — boş string de kabul (FE seçilmeden gönderebilir); lojistik
  // verisi JSON olarak saklanır, tarih mantığı yok.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  loadingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateListingDto {
  @IsEnum(ListingTypeDto, { message: "Geçersiz ilan tipi" })
  type!: ListingTypeDto;

  // true → taslak olarak kaydet (yayınlama); false/undefined → yayınla.
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;

  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;

  // Sınır ötesi hedef ülkeler (ISO 3166-1 alpha-2). Boş = tüm yabancı ülkeler.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  @ArrayMaxSize(200)
  targetCountries?: string[];

  // Teslimat / fatura adresi (CompanyAddress id).
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsString()
  billingAddressId?: string;

  @IsOptional()
  @IsEnum(ListingFormatDto, { message: "Geçersiz format" })
  format?: ListingFormatDto;

  @IsOptional()
  @IsEnum(ListingVisibilityDto, { message: "Geçersiz görünürlük" })
  visibility?: ListingVisibilityDto;

  @IsString()
  @MinLength(3, { message: "Başlık en az 3 karakter olmalı" })
  @MaxLength(200, { message: "Başlık en fazla 200 karakter" })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz tarih" })
  closesAt?: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz tarih" })
  bidsOpenAt?: string;

  // ── Kalemler / davet / kategori ──
  // Tavan web MAX_LISTING_ITEMS (500) ile birebir — teklif/award DTO'larının
  // kalem tavanları da bu sayıya eşit olmalı (tam-kalem teklif zorunluluğu).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingItemDto)
  @ArrayMaxSize(500)
  items?: ListingItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  invitations?: string[];

  // İhale kategorisi ana konuyu tanımlar (detay kalemlerde) — AI önerisi
  // tavanıyla hizalı: en fazla 3. Fazla kategori PUBLIC ihalede alakasız
  // firmalara kategori-eşleşme bildirimi saçar.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(10)
  keywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsBoolean()
  requireAllItems?: boolean;

  @IsOptional()
  @IsBoolean()
  requireBidDocument?: boolean;

  // CC-1: kalem hedef/istenen fiyatını karşı tarafa göster (opt-in, varsayılan false).
  @IsOptional()
  @IsBoolean()
  showTargetToSuppliers?: boolean;

  @IsOptional()
  @IsBoolean()
  isSealedBid?: boolean;

  @IsOptional()
  @IsEnum(CurrencyDto)
  primaryCurrency?: CurrencyDto;

  @IsOptional()
  @IsArray()
  @IsEnum(CurrencyDto, { each: true })
  @ArrayMaxSize(8)
  allowedCurrencies?: CurrencyDto[];

  // ── Teslim / ödeme ──
  @IsOptional()
  @IsEnum(DeliveryTermDto)
  deliveryTerm?: DeliveryTermDto;

  /** Ödeme planı — zamanlama SORULMAZ, servis plandan türetir (Faz 2).
   *  Koşullu zorunluluklar (yüzde/vade/LC alt tip/özel not) serviste doğrulanır. */
  @IsOptional()
  @IsEnum(PaymentCategoryDto)
  paymentCategory?: PaymentCategoryDto;

  /** Yalnız ADVANCE: peşin yüzdesi (ZORUNLU — eski sessiz %100 varsayımı kalktı).
   *  %<100 yalnız yurtiçi ilanda geçerli (serviste enforce). ValidateIf: ADVANCE
   *  dışında atlanır (opsiyonel), ADVANCE'ta undefined → @IsInt hatası. */
  @ValidateIf((o: { paymentCategory?: PaymentCategoryDto }) => o.paymentCategory === PaymentCategoryDto.ADVANCE)
  @IsInt()
  @Min(1)
  @Max(100)
  advancePercent?: number;

  /** Tek "vade günü" alanı: DEFERRED/CHEQUE vadesi, LC-USANCE vadesi, kısmi
   *  peşinde kalanın vadesi (opsiyonel). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  paymentDays?: number;

  @IsOptional()
  @IsEnum(LcTypeDto)
  lcType?: LcTypeDto;

  /** Teyitli akreditif — ikinci banka da ödeme garantisi verir. */
  @IsOptional()
  @IsBoolean()
  lcConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNote?: string;

  /** Teslim öncesi ödemede satıcıdan teminat mektubu istensin mi? Opsiyonel —
   *  ilan sahibi seçer; yalnız PEŞİN kategorisinde anlamlı, aksi normalize. */
  @IsOptional()
  @IsBoolean()
  requireGuaranteeLetter?: boolean;

  // ── Lojistik ──
  @IsOptional()
  @IsBoolean()
  isLogistics?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LogisticsDto)
  logistics?: LogisticsDto;

  // ── İngiliz Usulü açık eksiltme ──
  // Minimum azaltma payı alanları kaldırıldı (2026-07-13) — pazarlıkta tek
  // kural "kendi öncekinden kesin iyi" + turda tek aktif gönderim.
  @IsOptional()
  @IsEnum(BidVisibilityDto)
  bidVisibility?: BidVisibilityDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimalPlaces?: number;

  // Kapanış hatırlatması artık her ilanda otomatik — client kontrol etmez.

  @IsOptional()
  @IsBoolean()
  autoExtendOnLateBid?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendThresholdMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendByMinutes?: number;
}
