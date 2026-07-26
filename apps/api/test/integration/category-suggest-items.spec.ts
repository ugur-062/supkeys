/**
 * Wizard "kalemlerden otomatik kategori" ucu — suggestForItems sözleşmesi:
 *  - Erişim kapısı (assertAiAccess) try DIŞINDA: yetkisiz kullanıcı sessiz
 *    boş liste değil, net hata alır (403/503 frontend'de otomatik öneriyi
 *    kalıcı kapatır).
 *  - İki aşamalı akış: family daralt → yalnız o family'lerin L3 çocukları;
 *    dönen kodlar DB'ye karşı doğrulanır (model id uyduramaz).
 *  - Model/parse hatası boş öneriye düşer — form akışı bozulmaz.
 */
import { ForbiddenException } from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import { CategorySuggestService } from "../../src/modules/ai/tender-extract/category-suggest.service";
import type { AiService } from "../../src/modules/ai/ai.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";

const USER = { userId: "u1", companyId: "c1" } as never;

function makeAiStub(responses: string[]) {
  const callAi = jest.fn();
  for (const r of responses) callAi.mockResolvedValueOnce({ text: r });
  return {
    assertAiAccess: jest.fn(),
    callAi,
  };
}

function makeService(ai: ReturnType<typeof makeAiStub>) {
  return new CategorySuggestService(
    ai as unknown as AiService,
    prisma as unknown as PrismaService,
  );
}

async function seedTree() {
  const mk = (code: string, nameTr: string, level: number, parentId?: string) =>
    prisma.category.create({
      data: {
        id: code,
        code,
        nameTr,
        searchText: foldSearchText(nameTr),
        level,
        parentId: parentId ?? null,
        isActive: true,
        sortOrder: 0,
      },
    });
  await mk("40000000", "Endüstriyel makineler", 1);
  await mk("40150000", "Pompa ve kompresörler", 2, "40000000");
  await mk("40151500", "Pompalar", 3, "40150000");
  await mk("40151600", "Kompresörler", 3, "40150000");
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("CategorySuggestService.suggestForItems", () => {
  it("erişim kapısı try dışında — assertAiAccess hatası aynen fırlar", async () => {
    const ai = makeAiStub([]);
    ai.assertAiAccess.mockImplementation(() => {
      throw new ForbiddenException("AI özellikleri Silver+ gerektirir.");
    });
    const svc = makeService(ai);

    await expect(
      svc.suggestForItems(USER, [{ name: "Vidalı kompresör" }]),
    ).rejects.toThrow(ForbiddenException);
    expect(ai.callAi).not.toHaveBeenCalled();
  });

  it("iki aşamalı akış: family → L3 class, doğrulanmış id döner", async () => {
    await seedTree();
    const ai = makeAiStub([
      JSON.stringify({ codes: ["40150000"] }), // aşama 1: family
      JSON.stringify({ codes: ["40151600", "99999999"] }), // aşama 2: class (+uydurma)
    ]);
    const svc = makeService(ai);

    const res = await svc.suggestForItems(USER, [
      { name: "Vidalı kompresör 22kW", description: "hava hattı için" },
    ]);

    // Uydurma kod (99999999) DB doğrulamasından geçemez, elenir.
    expect(res).toEqual({ categoryIds: ["40151600"] });
    expect(ai.callAi).toHaveBeenCalledTimes(2);
  });

  it("model hatası boş öneriye düşer (kapıdan geçen kullanıcıda fail-open)", async () => {
    await seedTree();
    const ai = makeAiStub([]);
    ai.callAi.mockRejectedValue(new Error("bütçe doldu"));
    const svc = makeService(ai);

    const res = await svc.suggestForItems(USER, [{ name: "Pompa" }]);
    expect(res).toEqual({ categoryIds: [] });
  });

  it("adsız kalemler elenir; hiç ad yoksa AI çağrısı yapılmaz", async () => {
    const ai = makeAiStub([]);
    const svc = makeService(ai);

    const res = await svc.suggestForItems(USER, [{ name: "" }]);
    expect(res).toEqual({ categoryIds: [] });
    expect(ai.callAi).not.toHaveBeenCalled();
  });
});
