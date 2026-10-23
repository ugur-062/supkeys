import {
  LEGAL_FORMS_BY_COUNTRY,
  findLocalLegalForm,
  isRegistrationOpen,
  isValidCountryCode,
  localLegalForms,
  resolveLegalForm,
} from "@rothern/shared";

/**
 * Ülkeye göre hukuki yapı listesi (`packages/shared/src/data/legal-forms.ts`) —
 * kayıt sihirbazındaki "Hukuki yapı" seçicisinin tek kaynağı. Seçilen yerel ad
 * `Company.legalFormLocal`e aynen yazılır; her yapı `CompanyType`a eşlenir.
 */
const TYPES = ["LIMITED", "JOINT_STOCK", "SOLE_PROPRIETOR", "OTHER"];
const COUNTRIES = Object.keys(LEGAL_FORMS_BY_COUNTRY);

/** Addaki harflerin yazı sistemleri (Latin + Kiril karışımı = benzer harfle yazım hatası). */
function scriptsOf(name: string): string[] {
  const scripts = [
    "Latin", "Cyrillic", "Greek", "Arabic", "Han", "Hiragana", "Katakana", "Hangul", "Thai", "Georgian",
  ];
  return scripts.filter((s) => new RegExp(`\\p{Script=${s}}`, "u").test(name));
}

describe("ülkeye göre hukuki yapılar", () => {
  it("kapsam: yaklaşık 40-50 ülke; hepsi geçerli ve kayda açık ülke kodu", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(40);
    expect(COUNTRIES.length).toBeLessThanOrEqual(55);
    for (const code of COUNTRIES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(isValidCountryCode(code)).toBe(true);
      expect(isRegistrationOpen(code)).toBe(true);
    }
  });

  it("Türkiye ve KKTC listesizdir (bugünkü genel dört seçenek kalır)", () => {
    expect(localLegalForms("TR")).toEqual([]);
    expect(localLegalForms("XN")).toEqual([]);
    expect(COUNTRIES).not.toContain("TR");
    expect(COUNTRIES).not.toContain("XN");
  });

  it("listesi olmayan, bilinmeyen ve boş kod boş liste döner", () => {
    for (const code of ["KE", "ZZ", "", null, undefined]) expect(localLegalForms(code)).toEqual([]);
  });

  it.each(COUNTRIES)("%s: adlar tekil, kırpılmış, NFC, tek yazı sisteminde ve 80 karakteri aşmaz", (code) => {
    const forms = localLegalForms(code);
    expect(forms.length).toBeGreaterThanOrEqual(4);
    const names = forms.map((f) => f.name);
    expect(new Set(names.map((n) => n.toLocaleLowerCase())).size).toBe(names.length);
    for (const form of forms) {
      expect(TYPES).toContain(form.type);
      expect(form.name).toBe(form.name.trim());
      expect(form.name).toBe(form.name.normalize("NFC"));
      // API `legalFormLocal` sınırlarının içinde (DTO tavanı 80; en kısa yerel ad 2 karakter).
      expect(form.name.length).toBeGreaterThanOrEqual(2);
      expect(form.name.length).toBeLessThanOrEqual(80);
      // Seçicinin kendi değerleriyle çakışmaz.
      expect(TYPES).not.toContain(form.name);
      // Kanji + kana birlikte olabilir; Latin / Kiril / Yunan karışımı olamaz.
      const scripts = scriptsOf(form.name).filter((s) => !["Han", "Hiragana", "Katakana"].includes(s));
      expect(scripts.length).toBeLessThanOrEqual(1);
    }
  });

  it.each(COUNTRIES)("%s: en az bir sermaye şirketi ve en az bir şahıs işletmesi var", (code) => {
    const types = new Set(localLegalForms(code).map((f) => f.type));
    expect(types.has("LIMITED") || types.has("JOINT_STOCK")).toBe(true);
    expect(types.has("SOLE_PROPRIETOR")).toBe(true);
  });

  // Tek İŞLEVSEL tür SOLE_PROPRIETOR'dur (vergi numarası başka firmalara
  // gösterilmez). Listesi olan ülkede genel "Şahıs Firması" seçeneği yoktur ve
  // "Diğer" her zaman OTHER kaydeder: ülkenin listesinde şahıs işletmesi
  // yoksa o ülkenin tek kişilik işletmesi kişisel numarasını gizleyemez.
  it("listesi olan HER ülke en az bir şahıs işletmesi (SOLE_PROPRIETOR) sunar", () => {
    const without = COUNTRIES.filter((code) => !localLegalForms(code).some((f) => f.type === "SOLE_PROPRIETOR"));
    expect(without).toEqual([]);
  });

  // İnceleme 2026-10-08 (legal-forms-sole-trader-gaps): tek kişilik işin o
  // ülkedeki yaygın adı listede yoktu → kişi "Diğer"e yazıp OTHER oluyor,
  // kişisel vergi numarası (RU 12 haneli ИНН) başka firmalara açık kalıyordu.
  it.each([
    ["RU", "Самозанятый"],
    ["RU", "КФХ"],
    ["RU", "ИП"],
    ["DE", "Freiberufler"],
    ["AT", "Freiberufler"],
    ["FR", "Micro-entrepreneur"],
    ["IT", "Libero professionista"],
    ["BR", "Autônomo"],
    ["MA", "Auto-entrepreneur"],
  ])("%s '%s' tek kişilik iş: SOLE_PROPRIETOR", (country, name) => {
    expect(findLocalLegalForm(country, name)).toEqual({ name, type: "SOLE_PROPRIETOR" });
  });

  // İnceleme 2026-10-08 (legal-forms-doubtful-entries).
  it("Kanada: şirket (Corporation / Québec'te Société par actions) LIMITED'dir; Québec adları Fransızca da var", () => {
    const type = (name: string) => findLocalLegalForm("CA", name)?.type ?? null;
    expect(type("Corporation")).toBe("LIMITED");
    expect(type("Société par actions")).toBe("LIMITED");
    expect(type("Société en nom collectif")).toBe("OTHER");
    expect(type("Société en commandite")).toBe("OTHER");
    expect(type("Coopérative")).toBe("OTHER");
    expect(type("Entreprise individuelle")).toBe("SOLE_PROPRIETOR");
    // Tek sermaye şirketi yapısı JOINT_STOCK olsaydı hiçbir Kanada şirketi LIMITED olamazdı.
    expect(localLegalForms("CA").some((f) => f.type === "LIMITED")).toBe(true);
  });

  it("Polonya: kısaltmalar kanundaki gibi boşluklu ('sp. j.', 'sp. k.'); boşluksuz yazım listede yok", () => {
    const names = localLegalForms("PL").map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["sp. z o.o.", "sp. j.", "sp. k.", "sp. p."]));
    for (const name of names.filter((n) => /^sp\./.test(n))) expect(name).toMatch(/^sp\. \S/);
    expect(findLocalLegalForm("PL", "sp.j.")).toBeNull();
    expect(findLocalLegalForm("PL", "sp.k.")).toBeNull();
  });

  it("çok dilli ülkeler: ortaklık ve kooperatif adları öteki resmî dillerde de var", () => {
    const type = (country: string, name: string) => findLocalLegalForm(country, name)?.type ?? null;
    // İsviçre: Almanca / Fransızca / İtalyanca.
    for (const name of [
      "Kollektivgesellschaft", "Société en nom collectif", "Società in nome collettivo",
      "Kommanditgesellschaft", "Société en commandite", "Società in accomandita",
      "Genossenschaft", "Société coopérative", "Società cooperativa",
    ]) expect([name, type("CH", name)]).toEqual([name, "OTHER"]);
    // Finlandiya: Fince / İsveççe.
    expect(type("FI", "Ab")).toBe("LIMITED");
    expect(type("FI", "Abp")).toBe("JOINT_STOCK");
    expect(type("FI", "Kb")).toBe("OTHER");
    // Kazakistan'da ortaklık ve kooperatif yapısı hiç yoktu.
    for (const name of ["ПТ", "КТ", "ПК"]) expect([name, type("KZ", name)]).toEqual([name, "OTHER"]);
  });

  // "Diğer" kutusunun örnekleri (vakıf, dernek, şube) BİLEREK listede olmayan
  // yapılardır: örnek olarak listedeki bir yapı gösterilirse kullanıcı onu
  // serbest metin olarak yazar ve OTHER kaydolur (inceleme 2026-10-08).
  it("kâr amacı gütmeyen yapılar ve şubeler listede yok ('Diğer' + serbest metin)", () => {
    const outside = /foundation|association|branch|stiftung|\bverein\b|fondation|fundaci[oó]n|fondazione|vakıf|dernek|şube|фонд|ассоциац|филиал/i;
    const listed = COUNTRIES.flatMap((code) =>
      localLegalForms(code).filter((f) => outside.test(f.name)).map((f) => `${code}:${f.name}`),
    );
    expect(listed).toEqual([]);
  });

  it("örnek ülkeler: yerel ad → platform karşılığı", () => {
    const type = (country: string, name: string) => findLocalLegalForm(country, name)?.type ?? null;
    expect(localLegalForms("DE").map((f) => f.name)).toEqual(
      expect.arrayContaining(["GmbH", "UG (haftungsbeschränkt)", "AG", "KG", "OHG", "GbR", "e.K."]),
    );
    expect(type("DE", "GmbH")).toBe("LIMITED");
    expect(type("DE", "AG")).toBe("JOINT_STOCK");
    expect(type("DE", "KG")).toBe("OTHER");
    expect(type("DE", "e.K.")).toBe("SOLE_PROPRIETOR");
    expect(localLegalForms("RU").map((f) => f.name)).toEqual(expect.arrayContaining(["ООО", "АО", "ПАО", "ИП"]));
    expect(type("RU", "ООО")).toBe("LIMITED");
    expect(type("RU", "ПАО")).toBe("JOINT_STOCK");
    expect(type("RU", "ИП")).toBe("SOLE_PROPRIETOR");
    expect(localLegalForms("GB").map((f) => f.name)).toEqual(
      expect.arrayContaining(["Ltd", "PLC", "LLP", "Sole trader"]),
    );
    expect(type("GB", "Ltd")).toBe("LIMITED");
    expect(type("GB", "PLC")).toBe("JOINT_STOCK");
    expect(type("GB", "LLP")).toBe("OTHER");
    expect(type("GB", "Sole trader")).toBe("SOLE_PROPRIETOR");
  });

  it("yerel adlar gerçekten yerel yazıda (Kiril ООО Latin OOO değildir)", () => {
    for (const [code, script] of [
      ["RU", "Cyrillic"], ["UA", "Cyrillic"], ["BY", "Cyrillic"], ["BG", "Cyrillic"],
      ["GR", "Greek"], ["SA", "Arabic"], ["EG", "Arabic"], ["CN", "Han"], ["JP", "Han"],
      ["KR", "Hangul"], ["TH", "Thai"], ["GE", "Georgian"],
    ] as const) {
      for (const form of localLegalForms(code)) expect([code, form.name, scriptsOf(form.name)]).toEqual([code, form.name, [script]]);
    }
    expect(findLocalLegalForm("RU", "OOO")).toBeNull();
  });

  it("findLocalLegalForm: yalnız O ülkenin listesinde arar; boşluk ve Unicode bileşimi dışında aynen", () => {
    expect(findLocalLegalForm("DE", " GmbH ")).toEqual({ name: "GmbH", type: "LIMITED" });
    expect(findLocalLegalForm("de", "GmbH")).toEqual({ name: "GmbH", type: "LIMITED" });
    // Ayrık aksanla yazılmış ad (a + U+0300) bileşik biçimle eşleşir.
    expect(findLocalLegalForm("CH", "Sàrl")?.name).toBe("Sàrl");
    // Başka ülkenin yapısı, küçük harfli yazım, bilinmeyen ad ve boş değer eşleşmez.
    expect(findLocalLegalForm("FR", "GmbH")).toBeNull();
    expect(findLocalLegalForm("DE", "gmbh")).toBeNull();
    expect(findLocalLegalForm("DE", "Kooperatif")).toBeNull();
    expect(findLocalLegalForm("TR", "GmbH")).toBeNull();
    for (const empty of ["", "  ", null, undefined]) expect(findLocalLegalForm("DE", empty)).toBeNull();
    expect(findLocalLegalForm(null, "GmbH")).toBeNull();
  });

  // EŞLEMENİN SAHİBİ API (2026-10-08): kayıt tamamlama ve admin düzeltmesi
  // saklanacak türü bu fonksiyondan alır — istemcinin gönderdiği tür ne olursa
  // olsun, ad ülkenin listesindeyse tür listeden gelir.
  describe("resolveLegalForm — saklanacak tür ve ad", () => {
    it("ad ülkenin listesindeyse tür listeden gelir (istemcinin türü ezilir), ad listedeki yazımla döner", () => {
      expect(resolveLegalForm("DE", "OTHER", " GmbH ")).toEqual({ type: "LIMITED", name: "GmbH" });
      expect(resolveLegalForm("DE", "SOLE_PROPRIETOR", "AG")).toEqual({ type: "JOINT_STOCK", name: "AG" });
      expect(resolveLegalForm("de", null, "KG")).toEqual({ type: "OTHER", name: "KG" });
      // Kişisel vergi numarası: tür istemciden OTHER gelse de şahıs işletmesi kaydolur.
      expect(resolveLegalForm("RU", "OTHER", "ИП")).toEqual({ type: "SOLE_PROPRIETOR", name: "ИП" });
      expect(resolveLegalForm("RU", "LIMITED", "Самозанятый")).toEqual({ type: "SOLE_PROPRIETOR", name: "Самозанятый" });
      // Ayrık aksanla gelen ad bileşik (listedeki) yazımıyla saklanır.
      expect(resolveLegalForm("CH", "OTHER", "Sa\u0300rl")).toEqual({ type: "LIMITED", name: "Sàrl" });
    });

    it("listede olmayan ad istemcinin türünü korur; ad kırpılır, boş ad null olur", () => {
      expect(resolveLegalForm("DE", "OTHER", " Stiftung ")).toEqual({ type: "OTHER", name: "Stiftung" });
      expect(resolveLegalForm("DE", "LIMITED", "Stiftung")).toEqual({ type: "LIMITED", name: "Stiftung" });
      // Başka ülkenin yapısı ve yazımı farklı ad bilinen yapı değildir.
      expect(resolveLegalForm("FR", "OTHER", "GmbH")).toEqual({ type: "OTHER", name: "GmbH" });
      expect(resolveLegalForm("DE", "OTHER", "gmbh")).toEqual({ type: "OTHER", name: "gmbh" });
      // Listesiz ülke (Türkiye, KKTC, Kenya…) ve ülkesiz kayıt.
      expect(resolveLegalForm("TR", "OTHER", "Kooperatif")).toEqual({ type: "OTHER", name: "Kooperatif" });
      expect(resolveLegalForm("KE", "JOINT_STOCK", "GmbH")).toEqual({ type: "JOINT_STOCK", name: "GmbH" });
      expect(resolveLegalForm(null, "LIMITED", "GmbH")).toEqual({ type: "LIMITED", name: "GmbH" });
      for (const empty of ["", "   ", null, undefined]) {
        expect(resolveLegalForm("DE", "LIMITED", empty)).toEqual({ type: "LIMITED", name: null });
      }
      expect(resolveLegalForm("DE", null, null)).toEqual({ type: null, name: null });
    });
  });
});
