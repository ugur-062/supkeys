import { assistantSystemPrompt } from "../../src/modules/ai/assistant/assistant.prompts";
import { searchIntentSystemPrompt } from "../../src/modules/ai/search-intent/search-intent.prompts";
import { unitCodeListForPrompt } from "../../src/modules/ai/ai-text";

/**
 * AI ÇIKTI DİLİ — istem sözleşmeleri (2026-09-27 uluslararası denetim).
 * İçerik alanları GİRDİNİN dilinde (kayıt tek dilli kalsın), kullanıcıya
 * gösterilen alanlar ARAYÜZ dilinde; kurallar istemin SONUNDA.
 */
describe("asistan istemi", () => {
  it("taslak içeriği girdinin dilinde, yanıt arayüz dilinde — yanıt kuralı EN SONDA", () => {
    const p = assistantSystemPrompt("en");
    expect(p).toContain("TASLAK DİLİ");
    expect(p).toContain("ÇIKTI DİLİ (propose_tender_draft — title, description, items.name");
    expect(p.indexOf("ÇIKTI DİLİ (propose_tender_draft")).toBeLessThan(p.indexOf("YANIT DİLİ:"));
    expect(p.trimEnd().endsWith("Yanıt dili: English (en)")).toBe(true);
  });

  it("araç listesiyle çelişmez: teklif/kazandırma/teslim alma için 'aracın yok' demez (derin denetim LU-04)", () => {
    const p = assistantSystemPrompt("tr");
    for (const tool of ["request_place_bid", "request_award_tender", "request_mark_order_received"]) {
      expect(p).toContain(tool);
    }
    expect(p).not.toContain("(teklif verme, kazandırma, sipariş aksiyonu) için ilgili sayfaya YÖNLENDİR");
    expect(p).toContain("Teklif verme, toplu kazandırma ve teslim alma için araç VAR");
  });
});

describe("AI arama istemi", () => {
  it("özet arayüz dilinde, başlık/kalem/anahtar kelime girdinin dilinde; sabit 'Anladığım' ve 'Türkiye'de bir il' yok", () => {
    const p = searchIntentSystemPrompt("ru", ["TRY", "USD", "EUR"]);
    expect(p).toContain("KULLANICI METNİ DİLİ (summary)");
    expect(p).toContain("ÇIKTI DİLİ (title, itemName, keywords)");
    expect(p).toContain("Русский (ru)");
    expect(p).not.toMatch(/"Anladığım: …" ile başlayan|Türkiye'de bir il/);
    // Şehir dünya genelinde + ülke ISO kodu; faaliyet eşlemesinde EN/RU örnekleri.
    expect(p).toMatch(/country: .*ISO 3166-1/);
    expect(p).toContain("manufacturer/producer/factory");
    expect(p).toContain("производитель");
    // Para birimi ve birim listeleri tek kaynaktan yerleşir.
    expect(p).toContain("TRY/USD/EUR");
    expect(p).toContain(unitCodeListForPrompt());
    expect(p).not.toMatch(/\{CURRENCIES\}|\{UNITS\}/);
    expect(p.trimEnd().endsWith("korunur.")).toBe(true);
  });
});
