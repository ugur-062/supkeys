/**
 * Controller/auth katmanı — servis testlerinin atladığı iki şey:
 *  1) DTO doğrulaması: üretimdeki global ValidationPipe (whitelist + transform +
 *     forbidNonWhitelisted) ile gövde reddi/kabulü.
 *  2) Token-tipi izolasyonu: CompanyJwtStrategy.validate() yalnızca type=company
 *     kabul eder, kullanıcı/firma durumunu DB'den taze doğrular.
 */
import { ValidationPipe } from "@nestjs/common";
import { CompanyJwtStrategy } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { CreateListingDto } from "../../src/modules/company-listings/dto/create-listing.dto";
import { PlaceBidDto } from "../../src/modules/company-listings/dto/place-bid.dto";
import {
  RecordPaymentDto,
  RejectPaymentReasonDto,
} from "../../src/modules/company-orders/dto/order-payment.dto";
import { ProposeRevisionDto } from "../../src/modules/company-orders/dto/order-action.dto";
import { CreateApprovalFlowDto } from "../../src/modules/company-approvals/dto/approval.dto";
import { CompleteOnboardingDto } from "../../src/modules/company-auth/dto/onboarding.dto";
import {
  InviteCompanyUserDto,
  UpdateUserPermissionsDto,
} from "../../src/modules/company-users/dto/company-user.dto";
import {
  AddInvitationsDto,
  ChangeClosingDto,
  ListingReasonDto,
} from "../../src/modules/company-listings/dto/owner-action.dto";
import { MAX_MONEY, MAX_QUANTITY } from "../../src/common/constants/money";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeUser } from "./factories";

// Üretim (main.ts) ile aynı seçenekler.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const validate = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: "body", metatype, data: "" });

describe("DTO doğrulama (global ValidationPipe)", () => {
  describe("CreateListingDto", () => {
    it("geçerli minimal gövde kabul edilir", async () => {
      await expect(
        validate(CreateListingDto, { type: "ALIM", title: "Test ihale" }),
      ).resolves.toBeDefined();
    });

    it("başlık zorunlu / en az 3 karakter", async () => {
      await expect(
        validate(CreateListingDto, { type: "ALIM" }),
      ).rejects.toBeDefined();
      await expect(
        validate(CreateListingDto, { type: "ALIM", title: "ab" }),
      ).rejects.toBeDefined();
    });

    it("geçersiz tip enum reddedilir", async () => {
      await expect(
        validate(CreateListingDto, { type: "FOO", title: "Test ihale" }),
      ).rejects.toBeDefined();
    });

    it("bilinmeyen alan reddedilir (forbidNonWhitelisted)", async () => {
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          hacker: 1,
        }),
      ).rejects.toBeDefined();
    });

    it("ADVANCE'ta advancePercent ZORUNLU (eski sessiz %100 kalktı)", async () => {
      // Peşin kategorisi seçilip yüzde verilmezse reddedilir.
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          paymentCategory: "ADVANCE",
        }),
      ).rejects.toBeDefined();
      // Yüzde verilirse kabul.
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          paymentCategory: "ADVANCE",
          advancePercent: 50,
        }),
      ).resolves.toBeDefined();
    });

    it("ADVANCE dışında advancePercent opsiyonel kalır (ValidateIf atlar)", async () => {
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          paymentCategory: "OPEN_ACCOUNT",
        }),
      ).resolves.toBeDefined();
    });

    it("kalem miktarı üst sınırı (@Max 1 milyar — Decimal taşma koruması)", async () => {
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          items: [{ name: "Kalem", quantity: 2_000_000_000, unit: "adet" }],
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          items: [{ name: "Kalem", quantity: 1000, unit: "adet" }],
        }),
      ).resolves.toBeDefined();
    });

    it("targetCountries ISO-2 olmalı (F10)", async () => {
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          isInternational: true,
          targetCountries: ["TUR"],
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          isInternational: true,
          targetCountries: ["TR", "DE"],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("AddInvitationsDto", () => {
    it("dizi olmalı ve 500'ü aşmamalı", async () => {
      await expect(
        validate(AddInvitationsDto, { rothernIds: "x" }),
      ).rejects.toBeDefined();
      await expect(
        validate(AddInvitationsDto, {
          rothernIds: Array.from({ length: 501 }, (_, i) => `c${i}`),
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(AddInvitationsDto, { rothernIds: ["c1", "c2"] }),
      ).resolves.toBeDefined();
    });
  });

  describe("ChangeClosingDto / ListingReasonDto", () => {
    it("kapanış tarihi ISO olmalı", async () => {
      await expect(
        validate(ChangeClosingDto, { closesAt: "yarın" }),
      ).rejects.toBeDefined();
      await expect(
        validate(ChangeClosingDto, {
          closesAt: new Date().toISOString(),
        }),
      ).resolves.toBeDefined();
    });

    it("gerekçe en fazla 1000 karakter (opsiyonel)", async () => {
      await expect(validate(ListingReasonDto, {})).resolves.toBeDefined();
      await expect(
        validate(ListingReasonDto, { reason: "x".repeat(1001) }),
      ).rejects.toBeDefined();
    });
  });

  describe("PlaceBidDto", () => {
    it("negatif birim fiyat reddedilir", async () => {
      await expect(
        validate(PlaceBidDto, {
          items: [{ itemId: "i1", unitPrice: -5 }],
        }),
      ).rejects.toBeDefined();
    });

    it("birim fiyat MAX_MONEY tavanı (tam-sınır kabul, aşan red)", async () => {
      await expect(
        validate(PlaceBidDto, {
          items: [{ itemId: "i1", unitPrice: MAX_MONEY }],
        }),
      ).resolves.toBeDefined();
      await expect(
        validate(PlaceBidDto, {
          items: [{ itemId: "i1", unitPrice: MAX_MONEY + 1 }],
        }),
      ).rejects.toBeDefined();
    });

    it("tek-tutar amount MAX_MONEY tavanı (aşan red)", async () => {
      await expect(
        validate(PlaceBidDto, { amount: MAX_MONEY + 1 }),
      ).rejects.toBeDefined();
    });
  });

  describe("Parasal tavan (@Max MAX_MONEY) — tekil değer alanları", () => {
    it("CreateListingDto minPrice/targetPrice tavanı aşan red", async () => {
      await expect(
        validate(CreateListingDto, {
          type: "SATIS",
          title: "Test ihale",
          minPrice: MAX_MONEY + 1,
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(CreateListingDto, {
          type: "ALIM",
          title: "Test ihale",
          items: [
            {
              name: "Kalem",
              quantity: 1,
              unit: "adet",
              targetPrice: MAX_MONEY + 1,
            },
          ],
        }),
      ).rejects.toBeDefined();
    });

    it("RecordPaymentDto amount tavanı (tam-sınır kabul, aşan red)", async () => {
      await expect(
        validate(RecordPaymentDto, { amount: MAX_MONEY }),
      ).resolves.toBeDefined();
      await expect(
        validate(RecordPaymentDto, { amount: MAX_MONEY + 1 }),
      ).rejects.toBeDefined();
    });

    it("ProposeRevisionDto kalem miktar/birim fiyat çarpım-faktör tavanları", async () => {
      const validItem = {
        name: "Kalem",
        quantity: 10,
        unit: "adet",
        unitPrice: 100,
      };
      await expect(
        validate(ProposeRevisionDto, { items: [validItem] }),
      ).resolves.toBeDefined();
      // Miktar tavanı (MAX_QUANTITY) aşan red.
      await expect(
        validate(ProposeRevisionDto, {
          items: [{ ...validItem, quantity: MAX_QUANTITY + 1 }],
        }),
      ).rejects.toBeDefined();
      // Birim fiyat tavanı (MAX_MONEY) aşan red — eskiden İKİSİ de sınırsızdı.
      await expect(
        validate(ProposeRevisionDto, {
          items: [{ ...validItem, unitPrice: MAX_MONEY + 1 }],
        }),
      ).rejects.toBeDefined();
      // BK-2: 0-fiyatlı revizyon reddedilir (placeBid ile simetri); 0.01 kabul.
      await expect(
        validate(ProposeRevisionDto, {
          items: [{ ...validItem, unitPrice: 0 }],
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(ProposeRevisionDto, {
          items: [{ ...validItem, unitPrice: 0.01 }],
        }),
      ).resolves.toBeDefined();
    });

    it("CreateApprovalFlowDto conditionMinAmount tavanı aşan red", async () => {
      await expect(
        validate(CreateApprovalFlowDto, {
          name: "Akış",
          type: "LISTING_PUBLISH",
          steps: [{ approverUserId: "u1", conditionMinAmount: MAX_MONEY + 1 }],
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(CreateApprovalFlowDto, {
          name: "Akış",
          type: "LISTING_PUBLISH",
          steps: [{ approverUserId: "u1", conditionMinAmount: 1000 }],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("Dizi tavanları (DoS koruması)", () => {
    const validOnboarding = {
      legalName: "Test A.Ş.",
      companyType: "LIMITED",
      taxNumber: "1234567890",
      city: "İstanbul",
      addressLine: "Örnek Mah. No 1 Kadıköy",
      mainCategoryIds: ["c1"],
      declarationAccepted: true,
    };

    it("onboarding subCategoryIds ≤ 50 (51 eleman red, 50 kabul)", async () => {
      await expect(
        validate(CompleteOnboardingDto, {
          ...validOnboarding,
          subCategoryIds: Array.from({ length: 50 }, (_, i) => `s${i}`),
        }),
      ).resolves.toBeDefined();
      await expect(
        validate(CompleteOnboardingDto, {
          ...validOnboarding,
          subCategoryIds: Array.from({ length: 51 }, (_, i) => `s${i}`),
        }),
      ).rejects.toBeDefined();
    });

    it("onboarding subCategoryIds her eleman ≤ 40 karakter", async () => {
      await expect(
        validate(CompleteOnboardingDto, {
          ...validOnboarding,
          subCategoryIds: ["x".repeat(41)],
        }),
      ).rejects.toBeDefined();
    });

    it("roller dizisi ≤ 5 (6 eleman red)", async () => {
      await expect(
        validate(InviteCompanyUserDto, {
          email: "a@b.com",
          roles: Array.from({ length: 6 }, () => "YONETICI"),
        }),
      ).rejects.toBeDefined();
      await expect(
        validate(InviteCompanyUserDto, {
          email: "a@b.com",
          roles: ["YONETICI"],
        }),
      ).resolves.toBeDefined();
    });

    it("izin override dizileri ≤ 100 (101 eleman red)", async () => {
      await expect(
        validate(UpdateUserPermissionsDto, {
          added: Array.from({ length: 101 }, (_, i) => `p${i}`),
          removed: [],
        }),
      ).rejects.toBeDefined();
    });
  });

  describe("RejectPaymentReasonDto", () => {
    it("red sebebi min 10 karakter (iptal gerekçesiyle simetri)", async () => {
      await expect(
        validate(RejectPaymentReasonDto, { reason: "geç" }),
      ).rejects.toBeDefined();
      await expect(
        validate(RejectPaymentReasonDto, { reason: "Dekont eşleşmiyor" }),
      ).resolves.toBeDefined();
    });
  });
});

describe("CompanyJwtStrategy — token-tipi izolasyonu", () => {
  const config = { getOrThrow: () => "test-secret" };
  const strategy = new CompanyJwtStrategy(config as never, prisma as never);

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it("type=company dışı token reddedilir", async () => {
    for (const type of ["tenant", "admin", "supplier"]) {
      await expect(
        strategy.validate({ type, userId: "x" } as never),
      ).rejects.toThrow(/token tipi/i);
    }
  });

  it("geçerli company token → DB'den taze kullanıcı döner", async () => {
    const company = await makeCompany(prisma, { country: "TR", tier: "GOLD" });
    const user = await makeUser(prisma, company.id);
    const res = await strategy.validate({
      type: "company",
      userId: user.id,
      companyId: company.id,
      sub: user.id,
      email: user.email,
    } as never);
    expect(res.companyId).toBe(company.id);
    expect(res.country).toBe("TR");
    expect(res.tier).toBe("GOLD");
  });

  it("pasif kullanıcı reddedilir", async () => {
    const company = await makeCompany(prisma);
    const user = await makeUser(prisma, company.id, undefined, {
      isActive: false,
    });
    await expect(
      strategy.validate({ type: "company", userId: user.id } as never),
    ).rejects.toThrow(/geçersiz/i);
  });

  it("engellenmiş firma reddedilir", async () => {
    const company = await makeCompany(prisma, { isBlocked: true });
    const user = await makeUser(prisma, company.id);
    await expect(
      strategy.validate({ type: "company", userId: user.id } as never),
    ).rejects.toThrow(/pasif|engel/i);
  });

  it("olmayan kullanıcı reddedilir", async () => {
    await expect(
      strategy.validate({ type: "company", userId: "yok" } as never),
    ).rejects.toThrow();
  });
});
