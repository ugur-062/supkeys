import * as fs from "node:fs";
import * as path from "node:path";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  PASSWORD_DIGIT_RE,
  PASSWORD_LOWERCASE_RE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_RE,
  PASSWORD_UPPERCASE_RE,
  isPolicyPassword,
  passwordByteLength,
} from "../../src/common/auth/password-policy";
import { ChangePasswordDto } from "../../src/modules/company-auth/dto/account.dto";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { AcceptCompanyInvitationDto } from "../../src/modules/company-users/dto/company-user.dto";
import { ConfirmPasswordResetDto } from "../../src/modules/password-reset/dto/confirm-password-reset.dto";

/**
 * Şifre politikası TEK: kayıt, ekip daveti kabulü, şifre değiştirme ve şifre
 * sıfırlama AYNI şifreleri kabul/ret eder (yayın denetimi 2026-09-28 Bölüm 9 —
 * değiştirme/sıfırlama 8 karakter + özel karaktersiz kabul ediyor, kayıtta
 * konan 10 karakter + özel karakter kuralı sıfırlamayla zayıflatılabiliyordu).
 *
 * API tek kaynağı `common/auth/password-policy.ts` (`@PasswordPolicy()`); web
 * aynı kuralı `apps/web/src/lib/company-auth/password-rules.ts`ten okur. Bu
 * dosya ÜÇ şeyi kilitler: (1) dört DTO aynı sonucu verir, (2) kurallar
 * Unicode bilir (arayüz testi 2026-10 login-4), (3) web kaynağındaki sabitler
 * API'ninkilerle BİREBİR aynıdır ve aynı örneklerde aynı kararı verir.
 *
 * ÜST SINIR 72 UTF-8 BAYTTIR, karakter değil (kimlik sağlayıcı şifreyi orada
 * keser): "ş" ve Kiril harfleri 2, emoji 4 bayt. Form ve sunucu aynı sayıyı
 * ölçer ve TEK metinle söyler.
 */
async function passwordOk(cls: new () => object, field: string, pw: string): Promise<boolean> {
  const errs = await validate(plainToInstance(cls, { [field]: pw }) as object);
  return !errs.some((e) => e.property === field);
}

async function passwordMessages(cls: new () => object, field: string, pw: string): Promise<string[]> {
  const errs = await validate(plainToInstance(cls, { [field]: pw }) as object);
  return errs
    .filter((e) => e.property === field)
    .flatMap((e) => Object.values(e.constraints ?? {}))
    .sort();
}

const PATHS: Array<[string, new () => object, string]> = [
  ["kayıt", CompanySignupDto, "password"],
  ["davet kabulü", AcceptCompanyInvitationDto, "password"],
  ["şifre değiştirme", ChangePasswordDto, "newPassword"],
  ["şifre sıfırlama", ConfirmPasswordResetDto, "newPassword"],
];

const CASES: Array<[string, boolean]> = [
  ["Guclu!Sifre9", true],
  ["Kisa!9a", false], // 7 karakter
  ["Parola12!", false], // 9 karakter — eski değiştirme/sıfırlama kuralı kabul ediyordu
  ["GucluParola12", false], // özel karakter yok — eski kural kabul ediyordu
  ["gucluparola!9", false], // büyük harf yok
  ["GUCLUPAROLA!9", false], // küçük harf yok
  ["Guclu!Parola", false], // rakam yok

  // --- Unicode (arayüz testi 2026-10 login-4) ---
  // Kiril ve yalnız Türkçe harfli şifre: eskiden "küçük harf yok" deniyordu.
  ["Пароль-Секрет1!", true],
  ["ŞİĞÜÖÇ-şığüöç1!", true],
  ["Çiçekler12!", true],
  ["Ελληνικά-κωδ1", true],
  // Harf ÖZEL KARAKTER DEĞİLDİR: eskiden ASCII dışı her harf özel karakter
  // sayılıyor, simgesiz şifre kabul ediliyordu (bulgunun C adımı).
  ["şifreŞİFRE12", false],
  ["ПарольСекрет12", false],
  ["Sifrem12345ş", false],
  // Boşluk da özel karakter değildir (web kuralıyla aynı).
  ["Guclu Sifre 99", false],
  ["Guclu\tSifre99", false],
  // Büyük/küçük harf başka alfabede de aranır: yalnız büyük Kiril yetmez.
  ["ПАРОЛЬ-СЕКРЕТ1!", false],
  ["пароль-секрет1!", false],
  // Rakam ASCII 0-9: Arap-Hint rakamı rakam kuralını karşılamaz, harf/rakam
  // sınıfında olduğu için özel karakter de sayılmaz.
  ["Guclu!Sifre٣٤", false],
  ["GucluSifre12٣", false],
  // Rakam özel karakter değildir; simge sınıfı (Sm/Sc …) özel karakterdir.
  ["GucluSifre12€", true],
  ["GucluSifre12_", true],

  // --- uzunluk sınırları ---
  [`Aa1!${"x".repeat(PASSWORD_MIN_LENGTH - 5)}`, false], // 9
  [`Aa1!${"x".repeat(PASSWORD_MIN_LENGTH - 4)}`, true], // 10
  [`Aa1!${"x".repeat(PASSWORD_MAX_LENGTH - 4)}`, true], // 72
  [`Aa1!${"x".repeat(PASSWORD_MAX_LENGTH - 3)}`, false], // 73

  // --- üst sınır BAYT sayar (72 UTF-8 bayt) ---
  // Kiril harf 2 bayt: 4 + 34×2 = 72 bayt (38 karakter) kabul, 74 bayt
  // (39 karakter — 72 KARAKTERİN çok altında) ret. Eski kural ikisini de
  // kabul ediyor, uzun olanı kimlik sağlayıcı reddediyordu.
  [`Aa1!${"я".repeat(34)}`, true],
  [`Aa1!${"я".repeat(35)}`, false],
  [`Aa1!${"я".repeat(68)}`, false], // tam 72 KARAKTER, 140 bayt
  // Türkçe harf de 2 bayt.
  [`Aa1!${"ş".repeat(34)}`, true],
  [`Aa1!${"ş".repeat(35)}`, false],
  // Tek bir 2 baytlık harf sınırı bir kaydırır: 72 karakter ama 73 bayt.
  [`Aa1!${"x".repeat(66)}ş`, true], // 71 karakter, 72 bayt
  [`Aa1!${"x".repeat(67)}ş`, false], // 72 karakter, 73 bayt
  // Emoji 4 bayt (2 UTF-16 birimi): 8 + 16×4 = 72 kabul, 76 ret.
  [`Aa1!xxxx${"😀".repeat(16)}`, true],
  [`Aa1!xxxx${"😀".repeat(17)}`, false],
];

describe("şifre politikası — dört yol aynı kuralı uygular", () => {
  it.each(CASES)("%s → %s", async (pw, expected) => {
    for (const [name, cls, field] of PATHS) {
      expect({ path: name, ok: await passwordOk(cls, field, pw) }).toEqual({ path: name, ok: expected });
    }
    // Dekoratörün veriyle aynı kararı verdiği (tek kaynak) ayrıca kilitlenir.
    expect(isPolicyPassword(pw)).toBe(expected);
  });

  it("dört yol aynı ihlalde AYNI mesajları verir (tek kaynak, tek metin)", async () => {
    for (const pw of ["kisa", "şifreŞİFRE12", "GUCLUPAROLA!9", `Aa1!${"x".repeat(80)}`, `Aa1!${"я".repeat(40)}`, ""]) {
      const [, firstCls, firstField] = PATHS[0]!;
      const expected = await passwordMessages(firstCls, firstField, pw);
      expect(expected.length).toBeGreaterThan(0);
      for (const [name, cls, field] of PATHS) {
        expect({ path: name, pw, messages: await passwordMessages(cls, field, pw) }).toEqual({
          path: name,
          pw,
          messages: expected,
        });
      }
    }
  });

  it("üst sınır 72 UTF-8 bayttır: ölçü, sabitler ve dört yolda TEK ileti", async () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(PASSWORD_MAX_LENGTH).toBe(PASSWORD_MAX_BYTES);
    expect(passwordByteLength("Aa1!")).toBe(4);
    expect(passwordByteLength("şя")).toBe(4);
    expect(passwordByteLength("😀")).toBe(4);
    expect(passwordByteLength(`Aa1!${"я".repeat(34)}`)).toBe(72);

    // 39 karakterlik Kiril şifre: tek ihlal üst sınır, tek ileti — ve o ileti
    // uzun ASCII şifreninkiyle aynı (karakter/bayt için iki ayrı metin yok).
    const cyrillic = `Aa1!${"я".repeat(35)}`;
    const ascii = `Aa1!${"x".repeat(69)}`;
    const [, firstCls, firstField] = PATHS[0]!;
    const expected = await passwordMessages(firstCls, firstField, ascii);
    expect(expected).toHaveLength(1);
    expect(expected[0]).toContain("72");
    for (const [name, cls, field] of PATHS) {
      for (const pw of [cyrillic, ascii]) {
        const errs = await validate(plainToInstance(cls, { [field]: pw }) as object);
        const constraints = errs.find((e) => e.property === field)?.constraints ?? {};
        expect({ path: name, pw, constraints }).toEqual({
          path: name,
          pw,
          constraints: { passwordMaxBytes: expected[0] },
        });
      }
    }
  });

  it("mesajlar harf kuralını Latin alfabesiyle sınırlamaz ('(a-z)' / '(A-Z)' yok)", async () => {
    const [, cls, field] = PATHS[2]!; // şifre değiştirme: eski metni "(A-Z)" diyordu
    const all = [
      ...(await passwordMessages(cls, field, "GUCLUPAROLA!9")),
      ...(await passwordMessages(cls, field, "gucluparola!9")),
    ];
    expect(all).toEqual([
      "Şifre en az bir küçük harf içermeli",
      "Şifre en az bir büyük harf içermeli",
    ]);
  });

  it("birden çok karakter kuralı eksikse söylenen kural: küçük harf → büyük harf → rakam → özel karakter", async () => {
    // class-validator `matches` için TEK mesaj tutar; sıra web denetim
    // listesiyle aynı kalmalı (form ile sunucu aynı eksiği söylesin).
    const first = async (pw: string) => {
      const out: string[] = [];
      for (const [, cls, field] of PATHS) {
        const errs = await validate(plainToInstance(cls, { [field]: pw }) as object);
        out.push(errs.find((e) => e.property === field)?.constraints?.matches ?? "");
      }
      expect(new Set(out).size).toBe(1);
      return out[0];
    };
    expect(await first("----------")).toBe("Şifre en az bir küçük harf içermeli");
    expect(await first("aaaaaaaaaa")).toBe("Şifre en az bir büyük harf içermeli");
    expect(await first("aaaaaAAAAA")).toBe("Şifre en az bir rakam içermeli");
    expect(await first("aaaaaAAAA1")).toBe("Şifre en az bir özel karakter içermeli");
  });

  it("string olmayan değer hiçbir yolda kabul edilmez", async () => {
    for (const [name, cls, field] of PATHS) {
      for (const bad of [undefined, null, 1234567890, ["Guclu!Sifre9"], { a: 1 }]) {
        const errs = await validate(plainToInstance(cls, { [field]: bad }) as object);
        expect({ path: name, rejected: errs.some((e) => e.property === field) }).toEqual({
          path: name,
          rejected: true,
        });
      }
    }
  });
});

/**
 * WEB ↔ API. Web formu şifreyi API'ye göndermeden önce aynı kuralla denetler;
 * iki taraf ayrışırsa kullanıcı ya formda kabul edilip sunucudan 400 alır ya
 * da geçerli şifresi formda reddedilir. Web paketi API testinden içe
 * aktarılamaz (next-intl, yol takma adları) → kaynak dosyadaki sabitler okunur.
 *
 * Web tarafı AYNI turda başka bir ajan tarafından değiştiriliyor: sabitler
 * eski (ASCII) hâlindeyse ya da adları değiştiyse bu blok KIRMIZI olur — iki
 * taraf birlikte yeşil olmalı.
 */
describe("şifre politikası — web kuralları API ile aynı", () => {
  const WEB_RULES = path.resolve(__dirname, "../../../web/src/lib/company-auth/password-rules.ts");
  const source = fs.readFileSync(WEB_RULES, "utf8");

  /** `export const AD = <değer>;` satırının değeri (kaynak metni). */
  function webConst(name: string): string {
    const m = new RegExp(`^export const ${name}\\s*=\\s*(.+?);\\s*$`, "m").exec(source);
    if (!m) {
      throw new Error(
        `web password rules: "export const ${name} = …;" not found in ${WEB_RULES}`,
      );
    }
    return m[1]!.trim();
  }
  function webRegex(name: string): RegExp {
    const literal = webConst(name);
    const m = /^\/(.+)\/([a-z]*)$/.exec(literal);
    if (!m) throw new Error(`web password rules: ${name} is not a regex literal: ${literal}`);
    return new RegExp(m[1]!, m[2]);
  }

  it("uzunluk sınırları aynı", () => {
    expect(Number(webConst("PASSWORD_MIN_LENGTH"))).toBe(PASSWORD_MIN_LENGTH);
    expect(Number(webConst("PASSWORD_MAX_BYTES"))).toBe(PASSWORD_MAX_BYTES);
    expect(Number(webConst("PASSWORD_MAX_LENGTH"))).toBe(PASSWORD_MAX_LENGTH);
  });

  it("web üst sınırı da BAYT ölçer (karakter sayan eski denetim kalmadı)", () => {
    // Web paketi buradan çalıştırılamaz → ölçünün kendisi kaynakta aranır:
    // UTF-8 bayt sayan yardımcı ve onu `PASSWORD_MAX_BYTES` ile kıyaslayan satır.
    expect(source).toMatch(/new TextEncoder\(\)\.encode\(p\)\.length/);
    expect(source).toMatch(/return passwordByteLength\(p\) > PASSWORD_MAX_BYTES;/);
    expect(source).toMatch(/if \(isPasswordTooLong\(p\)\) return "max";/);
    expect(source).not.toMatch(/p\.length > PASSWORD_MAX_LENGTH/);
  });

  it("dört karakter kuralı birebir aynı düzenli ifade", () => {
    expect({
      lower: String(webRegex("PASSWORD_LOWER_RE")),
      upper: String(webRegex("PASSWORD_UPPER_RE")),
      digit: String(webRegex("PASSWORD_DIGIT_RE")),
      special: String(webRegex("PASSWORD_SPECIAL_RE")),
    }).toEqual({
      lower: String(PASSWORD_LOWERCASE_RE),
      upper: String(PASSWORD_UPPERCASE_RE),
      digit: String(PASSWORD_DIGIT_RE),
      special: String(PASSWORD_SPECIAL_RE),
    });
  });

  it.each(CASES)("web kuralları da aynı kararı verir: %s → %s", (pw, expected) => {
    const min = Number(webConst("PASSWORD_MIN_LENGTH"));
    const maxBytes = Number(webConst("PASSWORD_MAX_BYTES"));
    // Web `new TextEncoder().encode(p).length` ölçer; Buffer aynı sayıyı verir.
    const ok =
      pw.length >= min &&
      new TextEncoder().encode(pw).length <= maxBytes &&
      Buffer.byteLength(pw, "utf8") <= maxBytes &&
      webRegex("PASSWORD_LOWER_RE").test(pw) &&
      webRegex("PASSWORD_UPPER_RE").test(pw) &&
      webRegex("PASSWORD_DIGIT_RE").test(pw) &&
      webRegex("PASSWORD_SPECIAL_RE").test(pw);
    expect(ok).toBe(expected);
  });

  /** Kaynak katalog (dist değil): metin değişikliği paket derlenmeden de görülür. */
  function catalog(locale: string, namespace: "api" | "web"): Record<string, unknown> {
    const file = path.resolve(__dirname, `../../../../packages/i18n/src/messages/${locale}/${namespace}.json`);
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  }
  function at(tree: Record<string, unknown>, dotted: string): unknown {
    return dotted.split(".").reduce<unknown>(
      (node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
      tree,
    );
  }

  it.each(["tr", "en", "ru"])("üst sınır iletisi formda ve sunucuda AYNI tek metin (%s)", (locale) => {
    const api = at(catalog(locale, "api"), "dto.companySignup.parolaEnFazla72Karakter");
    const web = at(catalog(locale, "web"), "auth.password.max");
    expect(typeof api).toBe("string");
    expect({ locale, web }).toEqual({ locale, web: api });
    // Sayıyı ve ASCII dışı harfin iki sayıldığını söyler: 40 Kiril harfli
    // şifrenin neden "çok uzun" olduğu iletiden anlaşılır.
    expect(api).toContain("72");
    expect(api).toMatch(/\b2\b/);
    expect(api).toMatch(/\b4\b/);
    expect((api as string).length).toBeGreaterThan(60);
  });

  it("şifre iletilerinin TEK seti var: eski DTO'ya özel anahtarlar katalogda yok", () => {
    // Dört yol `api.dto.companySignup.parola*` metinlerini kullanır; değiştirme,
    // sıfırlama ve davet DTO'larının kendi kopyaları kullanılmadığı için silindi.
    const REMOVED = [
      "dto.account.enAzBirBuyukHarfAZ",
      "dto.account.enAzBirKucukHarfAz",
      "dto.account.enAzBirRakam",
      "dto.confirmPasswordReset.parolaEnAzBirKucukHarfIcermeli",
      "dto.confirmPasswordReset.parolaEnAzBirBuyukHarfIcermeli",
      "dto.confirmPasswordReset.parolaEnAzBirRakamIcermeli",
      "dto.companyUser.parolaEnAz10KarakterOlmali",
      "dto.companyUser.parolaEnFazla72Karakter",
      "dto.companyUser.parolaEnAzBirKucukHarfIcermeli",
      "dto.companyUser.parolaEnAzBirBuyukHarfIcermeli",
      "dto.companyUser.parolaEnAzBirRakamIcermeli",
      "dto.companyUser.parolaEnAzBirOzelKarakterIcermeli",
    ];
    for (const locale of ["tr", "en", "ru"]) {
      const tree = catalog(locale, "api");
      expect({ locale, present: REMOVED.filter((key) => at(tree, key) !== undefined) }).toEqual({
        locale,
        present: [],
      });
      // Kalan tek set eksiksiz.
      for (const key of [
        "parolaEnAz10KarakterOlmali",
        "parolaEnFazla72Karakter",
        "parolaEnAzBirKucukHarfIcermeli",
        "parolaEnAzBirBuyukHarfIcermeli",
        "parolaEnAzBirRakamIcermeli",
        "parolaEnAzBirOzelKarakterIcermeli",
      ]) {
        expect(typeof at(tree, `dto.companySignup.${key}`)).toBe("string");
      }
    }
    // Politika dosyası yalnız o seti okur.
    const policy = fs.readFileSync(path.resolve(__dirname, "../../src/common/auth/password-policy.ts"), "utf8");
    const used = [...policy.matchAll(/tApi\("api\.dto\.([A-Za-z]+)\.[A-Za-z0-9]+"\)/g)].map((m) => m[1]);
    expect(used.length).toBe(6);
    expect(new Set(used)).toEqual(new Set(["companySignup"]));
  });

  it("web kaynağında ASCII'ye bağlı eski şifre düzenli ifadesi kalmadı", () => {
    // Yorumlar eski kuralı anlatabilir; yalnız kod satırları taranır.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("[^a-zA-Z0-9]");
    expect(code).not.toMatch(/\/\[a-z\]\//);
    expect(code).not.toMatch(/\/\[A-Z\]\//);
  });
});
