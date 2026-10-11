import { describe, expect, it } from "vitest";
import { mergeMessages, messagesFor, rawMessages } from "../messages";

describe("messagesFor — düşüş zinciri", () => {
  it("tr kataloğu kendisidir", () => {
    const tr = messagesFor("tr", ["common"]);
    expect(tr.common.errors.forbidden).toBe("Bu işlem için yetkiniz yok");
  });

  it("en'de olan anahtar en'den, olmayan tr'den gelir", () => {
    const en = messagesFor("en", ["common", "api"]);
    expect(en.common.errors.forbidden).toBe("You do not have permission for this action");
    // Kaynakta olup İngilizcesi olmayan anahtar boş kalmaz — Türkçeye düşer.
    const trFlat = rawMessages("tr", "api");
    const enFlat = rawMessages("en", "api");
    expect(Object.keys(trFlat)).toEqual(Object.keys(enFlat));
  });

  it("ru → en → tr sırasıyla düşer", () => {
    const ru = messagesFor("ru", ["common"]);
    // Rusça henüz makine çevirisi almadıysa İngilizce, o da yoksa Türkçe görünür;
    // hiçbir durumda undefined/boş dönmez.
    expect(typeof ru.common.errors.forbidden).toBe("string");
    expect(ru.common.errors.forbidden.length).toBeGreaterThan(0);
  });

  it("mergeMessages derin birleştirir, üstteki değer kazanır", () => {
    const merged = mergeMessages(
      { a: { x: "tr-x", y: "tr-y" }, b: "tr-b" },
      { a: { x: "en-x" } },
    );
    expect(merged).toEqual({ a: { x: "en-x", y: "tr-y" }, b: "tr-b" });
  });

  it("yalnız istenen ad alanlarını döner", () => {
    const web = messagesFor("tr", ["common", "web"]) as Record<string, unknown>;
    expect(Object.keys(web).sort()).toEqual(["common", "web"]);
  });
});
