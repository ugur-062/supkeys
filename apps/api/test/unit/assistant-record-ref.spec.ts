/**
 * The assistant accepts a request / order by its NUMBER (live check 2026-10-10,
 * NEW-PF-1). "ROT-000834 talebimin kategorisi nedir?" failed twice out of two:
 * the tools took only the internal id, the model passed the number, the lookup
 * found nothing and the neutral `unavailable` made the model say "try again
 * later". DB behaviour: `test/integration/ai-assistant.spec.ts` and
 * `assistant-actions.spec.ts`.
 */
import {
  listingIdOfRef,
  listingNumberOf,
  listingRefWhere,
  orderIdOfRef,
  orderNumberOf,
  orderRefWhere,
} from "../../src/modules/ai/assistant/record-ref";
import { toolDefsForUser } from "../../src/modules/ai/assistant/assistant-tools";
import { ASSISTANT_SYSTEM_PROMPT } from "../../src/modules/ai/assistant/assistant.prompts";

describe("record reference: number or internal id", () => {
  it("a request number in any spelling the user types is the stored number", () => {
    expect(listingNumberOf("ROT-000834")).toBe("ROT-000834");
    expect(listingNumberOf("  rot-000834 ")).toBe("ROT-000834");
    expect(listingNumberOf("#ROT-000834")).toBe("ROT-000834");
    expect(listingNumberOf("ROT 000834")).toBe("ROT-000834");
    // Leading zeros dropped by the user; a number past six digits keeps its length.
    expect(listingNumberOf("ROT-834")).toBe("ROT-000834");
    expect(listingNumberOf("ROT-1234567")).toBe("ROT-1234567");
  });

  it("an internal id, an order number and free text are not request numbers", () => {
    expect(listingNumberOf("internal-listing-id")).toBeNull();
    expect(listingNumberOf("ROT-ORD-000012")).toBeNull();
    expect(listingNumberOf("ROT-")).toBeNull();
    expect(listingNumberOf("ROT-00A834")).toBeNull();
    expect(listingNumberOf("ROT-000834 talebi")).toBeNull();
    expect(listingNumberOf("")).toBeNull();
  });

  it("an order number likewise; a request number is not an order number", () => {
    expect(orderNumberOf("ROT-ORD-000012")).toBe("ROT-ORD-000012");
    expect(orderNumberOf("rot-ord-12")).toBe("ROT-ORD-000012");
    expect(orderNumberOf("ROT-000012")).toBeNull();
    expect(orderNumberOf("internal-order-id")).toBeNull();
  });

  it("the filter of a company-scoped read is the number or the id, never both", () => {
    expect(listingRefWhere("rot-834")).toEqual({ number: "ROT-000834" });
    expect(listingRefWhere(" internal-listing-id ")).toEqual({ id: "internal-listing-id" });
    expect(orderRefWhere("ROT-ORD-12")).toEqual({ number: "ROT-ORD-000012" });
    expect(orderRefWhere("abc")).toEqual({ id: "abc" });
  });

  it("number -> internal id is one unique read; an id costs no read; an unknown number is null", async () => {
    const listing = { findUnique: jest.fn().mockResolvedValueOnce({ id: "l1" }).mockResolvedValueOnce(null) };
    const db = { listing } as never;
    await expect(listingIdOfRef(db, "ROT-000834")).resolves.toBe("l1");
    expect(listing.findUnique).toHaveBeenCalledWith({ where: { number: "ROT-000834" }, select: { id: true } });
    await expect(listingIdOfRef(db, "ROT-999999")).resolves.toBeNull();
    await expect(listingIdOfRef(db, "internal-listing-id")).resolves.toBe("internal-listing-id");
    expect(listing.findUnique).toHaveBeenCalledTimes(2);

    const companyOrder = { findUnique: jest.fn().mockResolvedValue({ id: "o1" }) };
    await expect(orderIdOfRef({ companyOrder } as never, "rot-ord-12")).resolves.toBe("o1");
    expect(companyOrder.findUnique).toHaveBeenCalledWith({ where: { number: "ROT-ORD-000012" }, select: { id: true } });
  });
});

describe("the model is told that a number is accepted and what `not_found` means", () => {
  type Def = { name: string; description: string; parameters: { properties: Record<string, { description?: string }> } };
  const defs = toolDefsForUser(new Set(["satinalma", "satis"]), "GOLD") as unknown as Def[];
  const def = (name: string) => defs.find((d) => d.name === name)!;

  it("detail tools: the description names the number and the not-found answer", () => {
    expect(def("get_tender_detail").description).toMatch(/ROT-000123/);
    expect(def("get_tender_detail").description).toMatch(/not_found/);
    expect(def("get_order_detail").description).toMatch(/ROT-ORD-000123/);
    expect(def("get_order_detail").description).toMatch(/not_found/);
  });

  it("every parameter that names a request or an order says a number is accepted", () => {
    const refs = defs.flatMap((d) =>
      Object.entries(d.parameters.properties ?? {})
        .filter(([key]) => key === "listingId" || key === "orderId" || (key === "id" && d.name.startsWith("get_")))
        .map(([key, schema]) => [d.name, key, schema.description ?? ""] as const),
    );
    expect(refs.map(([tool, key]) => `${tool}.${key}`).sort()).toEqual([
      "get_order_detail.id",
      "get_tender_detail.id",
      "request_award_tender.listingId",
      "request_eliminate_bid.listingId",
      "request_mark_order_received.orderId",
      "request_place_bid.listingId",
      "request_send_invites.listingId",
    ]);
    for (const [tool, key, description] of refs) {
      expect(`${tool}.${key}: ${description}`).toMatch(key === "orderId" || tool === "get_order_detail" ? /ROT-ORD-\d+/ : /ROT-\d+/);
    }
  });

  it("system prompt: a number goes to the tool as it is; `not_found` is not an outage", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/NUMARASIYLA sorarsa numarayı ilgili araca AYNEN ver/);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/"not_found" dönerse bu bir kesinti DEĞİLDİR/);
    // The outage rule is still there, for a real outage.
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/"unavailable" dönerse, o bilgiye şu an ulaşılamadığını söyle/);
  });
});
