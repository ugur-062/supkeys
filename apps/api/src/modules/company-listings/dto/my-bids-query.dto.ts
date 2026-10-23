import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** Tekliflerim süzgecinin kabul ettiği teklif durumları (ListingBidStatus). */
export const MY_BID_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "WITHDRAWN",
  "WON",
  "AWARDED_PARTIAL",
  "LOST",
] as const;
export type MyBidStatusFilter = (typeof MY_BID_STATUSES)[number];

export const MY_BID_SORTS = ["newest", "oldest", "amount"] as const;
export type MyBidSort = (typeof MY_BID_SORTS)[number];

export const MY_BIDS_MAX_PAGE_SIZE = 50;

/** Sayıya çevir; ondalık/sayı olmayan değer `IsInt`e takılır (400, 500 değil). */
const toNumber = ({ value }: { value: unknown }) => {
  if (typeof value !== "string" || value.trim() === "") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

/**
 * Tekliflerim sorgusu (arayüz testi O-005): sayfalama + sunucu tarafı süzgeç.
 * Eskiden uç sabit `take: 200` ile kesiyor, süzme/sayma istemcideydi — en
 * yeni 200'ün dışındaki teklifler (karar bekleyenler dahil) hiç görünmüyordu.
 */
export class MyBidsQueryDto {
  /** Virgüllü çoklu durum (`?status=WON,AWARDED_PARTIAL`). */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? value.split(",").map((v) => v.trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(MY_BID_STATUSES.length)
  @IsIn(MY_BID_STATUSES as readonly string[], { each: true })
  status?: MyBidStatusFilter[];

  /**
   * Yalnız KARAR BEKLEYEN teklifler (SUBMITTED ∧ ilan karara bağlanmamış) —
   * `counts.active` ile aynı küme; Şirketim "Aktif Tekliflerim" KPI'ı buraya
   * bağlanır (arayüz testi D-120), sayı ile liste ayrışmaz.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "1" || value === "true")
  @IsBoolean()
  pending?: boolean;

  /** Talep adı / numarası / alıcı adı (katlanmış karşılaştırma). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  /** Son N gün içinde verilen teklifler. */
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(3660)
  days?: number;

  @IsOptional()
  @IsIn(MY_BID_SORTS as readonly string[])
  sort?: MyBidSort;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(MY_BIDS_MAX_PAGE_SIZE)
  pageSize?: number;
}
