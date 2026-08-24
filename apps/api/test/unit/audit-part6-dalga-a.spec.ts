import { Prisma } from "@rothern/db";
import {
  costFromUsage,
  type AiTokenUsage,
} from "../../src/modules/ai/ai-budget.service";
import { GROUNDED_REQUEST_USD } from "../../src/modules/ai/ai.config";
import { parseModelNumber } from "../../src/modules/ai/bid-price-extract/bid-price-extract.service";
import { validatePendingDto } from "../../src/modules/ai/assistant/validate-pending-dto";
import { PlaceBidDto } from "../../src/modules/company-listings/dto/place-bid.dto";

/**
 * Denetim 2026-08-24 Parça 6 (AI katmanı) — Dalga A sözleşmeleri.
 * Rapor: docs/audit-2026-08-24-part6-ai.md
 */

describe("#Grounding maliyeti bütçeye yansır", () => {
  const pricing = {
    inputPerMTok: 1,
    outputPerMTok: 2,
    cacheReadPerMTok: 0.1,
  };
  const usage: AiTokenUsage = {
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  it("grounded olmayan çağrı yalnız token maliyeti", () => {
    expect(costFromUsage(usage, pricing).toString()).toBe("1");
  });

  it("grounded çağrıya istek-başı ücret EKLENİR (token-dışı kalem artık ifade edilebiliyor)", () => {
    const cost = costFromUsage(usage, pricing, { grounded: true });
    expect(cost.toString()).toBe(
      new Prisma.Decimal(1).add(GROUNDED_REQUEST_USD).toString(),
    );
    expect(GROUNDED_REQUEST_USD).toBeGreaterThan(0);
  });
});

describe("#AI teklif payload'ı YÜRÜTMEDEN ÖNCE DTO ile doğrulanır", () => {
  const validItem = {
    itemId: "c".repeat(25),
    unitPrice: 10.5,
  };

  it("geçerli payload doğrulamadan geçer", () => {
    const dto = validatePendingDto(PlaceBidDto, {
      items: [validItem],
      validityDays: 30,
      deliveryDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(dto.items?.[0]?.unitPrice).toBe(10.5);
  });

  it("2 ondalıktan FAZLA birim fiyat reddedilir (kazandırılamayan teklif üretmez)", () => {
    expect(() =>
      validatePendingDto(PlaceBidDto, {
        items: [{ ...validItem, unitPrice: 10.333 }],
        validityDays: 30,
      }),
    ).toThrow(/doğrulamadan geçmedi/i);
  });

  it("negatif/sıfır fiyat gibi DTO ihlalleri de reddedilir", () => {
    expect(() =>
      validatePendingDto(PlaceBidDto, {
        items: [{ ...validItem, unitPrice: -1 }],
        validityDays: 30,
      }),
    ).toThrow(/doğrulamadan geçmedi/i);
  });
});

describe("#Model çıktısındaki sayıya TR binlik sezgisi UYGULANMAZ", () => {
  it("nokta ondalıktır: '1.875' → 1.875 (eskiden 1875 = 1000× hata)", () => {
    expect(parseModelNumber("1.875")).toBe(1.875);
    expect(parseModelNumber("12.375")).toBe(12.375);
    expect(parseModelNumber("2.750")).toBe(2.75);
  });

  it("sözleşme dışı TR biçimi yine de doğru okunur", () => {
    expect(parseModelNumber("1.500,50")).toBe(1500.5);
    expect(parseModelNumber("12,5")).toBe(12.5);
  });

  it("para sembolü/boşluk atılır, geçersiz değer null", () => {
    expect(parseModelNumber("185.50 ₺")).toBe(185.5);
    expect(parseModelNumber("abc")).toBeNull();
    expect(parseModelNumber("")).toBeNull();
  });
});
