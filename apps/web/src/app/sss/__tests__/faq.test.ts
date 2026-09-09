import { FAQ_FLAT, FAQ_GROUPS } from "@/app/sss/faq-data";
import { faqNode } from "@/lib/seo/jsonld";
import { describe, expect, it } from "vitest";

/**
 * SSS KALİTE KAPISI (GEO).
 *
 * `FAQPage` şeması yalnız sayfada GÖRÜNEN cevaplar için kullanılabilir ve
 * cevabın kendisi tam cümle olmalı — tek kelimelik ya da boş cevap hem
 * yönergeye aykırı hem de üretken motorda alıntılanamaz. Sayfa ve şema aynı
 * diziden beslendiği için parite testine gerek yok; burada İÇERİK kalitesi
 * ve tekillik denetleniyor.
 */
describe("SSS içeriği", () => {
  it("her soru soru işaretiyle biter", () => {
    for (const f of FAQ_FLAT) expect(f.q.trim().endsWith("?"), f.q).toBe(true);
  });

  it("her cevap tam cümledir (≥120 karakter, noktayla biter)", () => {
    for (const f of FAQ_FLAT) {
      expect(f.a.length, f.q).toBeGreaterThanOrEqual(120);
      expect(/[.!]$/.test(f.a.trim()), f.q).toBe(true);
    }
  });

  it("sorular tekildir", () => {
    const qs = FAQ_FLAT.map((f) => f.q);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("gruplar boş değildir ve düz liste hepsini taşır", () => {
    expect(FAQ_GROUPS.every((g) => g.items.length > 0)).toBe(true);
    expect(FAQ_FLAT.length).toBe(FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0));
  });

  it("şema düğümü sayfadaki soru sayısıyla birebir", () => {
    const node = faqNode(FAQ_FLAT) as { mainEntity: unknown[] };
    expect(node.mainEntity.length).toBe(FAQ_FLAT.length);
  });

  it("paket FİYATI yazmaz (fiyatlar değişince bayat kalırdı)", () => {
    for (const f of FAQ_FLAT) expect(f.a).not.toMatch(/\b\d{2,4}\s?(TL|₺|USD|\$|EUR|€)/);
  });
});
