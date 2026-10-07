/**
 * assertProdConfigSanity / checkProdCookieConfig — prod cookie/CSRF config
 * sağlık kontrolü (saf fonksiyon + boot assert). Canlı bug: COOKIE_SAMESITE=lax
 * + custom domain'lere geçince COOKIE_DOMAIN set edilmediğinde cookie'ler
 * host-only kalıyor → www JS `rk_csrf`'i okuyamıyor → X-CSRF-Token boş →
 * CsrfGuard 403. Bu guard o kombinasyonu boot'ta fail-fast eder.
 *
 * KRİTİK (yanlış-pozitif nöbeti): MEVCUT çalışan prod kombosu (lax +
 * .rothern.com) THROW ETMEMELİ — aşağıda açık test.
 */
import {
  checkRlsBypassConfig,
  checkProdCookieConfig,
  checkStagingOnlyEnv,
  isLiveEnvironment,
  assertProdConfigSanity,
} from "../../src/common/config/prod-config-sanity";

describe("checkRlsBypassConfig — RLS açıkken bypass şart (2026-09-22)", () => {
  it("RLS açık + bypass boş → reddet", () => {
    expect(checkRlsBypassConfig({ rlsEnabled: "true", bypassUrl: undefined })).toBe("rls_without_bypass");
    expect(checkRlsBypassConfig({ rlsEnabled: "true", bypassUrl: "  " })).toBe("rls_without_bypass");
  });
  it("RLS açık + bypass dolu → geçer; RLS kapalı → her hâlde inert", () => {
    expect(checkRlsBypassConfig({ rlsEnabled: "true", bypassUrl: "postgresql://owner@h/db" })).toBeNull();
    expect(checkRlsBypassConfig({ rlsEnabled: undefined, bypassUrl: undefined })).toBeNull();
    expect(checkRlsBypassConfig({ rlsEnabled: "false", bypassUrl: "" })).toBeNull();
  });
});

describe("checkProdCookieConfig — saf matris", () => {
  const P = "production";

  it("prod + lax + COOKIE_DOMAIN YOK → reddet (canlı bug)", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "lax",
        cookieDomain: undefined,
      }),
    ).toBe("samesite_without_domain");
    // boş string de domain-yok sayılır
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "lax",
        cookieDomain: "  ",
      }),
    ).toBe("samesite_without_domain");
  });

  it("prod + lax + .rothern.com → GEÇER (mevcut çalışan prod — throw ETMEMELİ)", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "lax",
        cookieDomain: ".rothern.com",
      }),
    ).toBeNull();
  });

  it("prod + none (açık) → reddet (double-submit devre dışı)", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "none",
        cookieDomain: ".rothern.com",
      }),
    ).toBe("samesite_none");
  });

  it("prod + COOKIE_SAMESITE unset → efektif 'none' → reddet", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: undefined,
        cookieDomain: ".rothern.com",
      }),
    ).toBe("samesite_none");
  });

  it("prod + strict + domain → GEÇER (same-site okunabilir); strict + no-domain → reddet", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "strict",
        cookieDomain: ".rothern.com",
      }),
    ).toBeNull();
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "strict",
        cookieDomain: undefined,
      }),
    ).toBe("samesite_without_domain");
  });

  it("büyük/küçük harf + boşluk normalize (LAX, ' None ')", () => {
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: "LAX",
        cookieDomain: ".rothern.com",
      }),
    ).toBeNull();
    expect(
      checkProdCookieConfig({
        nodeEnv: P,
        cookieSameSite: " None ",
        cookieDomain: ".rothern.com",
      }),
    ).toBe("samesite_none");
  });

  it("prod DIŞI (test/dev/unset) → HER kombinasyon inert (null)", () => {
    for (const nodeEnv of ["test", "development", undefined]) {
      expect(
        checkProdCookieConfig({
          nodeEnv,
          cookieSameSite: "lax",
          cookieDomain: undefined, // prod'da reddedilirdi
        }),
      ).toBeNull();
      expect(
        checkProdCookieConfig({
          nodeEnv,
          cookieSameSite: undefined, // prod'da 'none' sayılıp reddedilirdi
          cookieDomain: undefined,
        }),
      ).toBeNull();
    }
  });
});

describe("assertProdConfigSanity — boot assert (ConfigService)", () => {
  const cfg = (map: Record<string, string | undefined>) =>
    ({ get: (k: string) => map[k] }) as never;

  it("mevcut prod kombosu (lax + .rothern.com) → THROW ETMEZ", () => {
    expect(() =>
      assertProdConfigSanity(
        cfg({
          NODE_ENV: "production",
          COOKIE_SAMESITE: "lax",
          COOKIE_DOMAIN: ".rothern.com",
        }),
      ),
    ).not.toThrow();
  });

  it("prod + lax + domain YOK → THROW (mesaj COOKIE_DOMAIN'e işaret eder)", () => {
    expect(() =>
      assertProdConfigSanity(
        cfg({ NODE_ENV: "production", COOKIE_SAMESITE: "lax" }),
      ),
    ).toThrow(/COOKIE_DOMAIN/);
  });

  it("prod + none → THROW", () => {
    expect(() =>
      assertProdConfigSanity(
        cfg({
          NODE_ENV: "production",
          COOKIE_SAMESITE: "none",
          COOKIE_DOMAIN: ".rothern.com",
        }),
      ),
    ).toThrow(/COOKIE_SAMESITE/);
  });

  it("test ortamı → THROW ETMEZ (full-suite güvenli)", () => {
    expect(() =>
      assertProdConfigSanity(cfg({ NODE_ENV: "test" })),
    ).not.toThrow();
  });
});

/**
 * Canlıda açık kalmış staging bayrakları (canlı öncesi sağlamlaştırma,
 * 2026-10-07). `CORS_ALLOW_VERCEL=true` her *.vercel.app kökenine çerezli erişim
 * açar; dolu `EMAIL_ALLOWLIST` listede olmayan her müşterinin e-postasını
 * sessizce keser. İkisi de yalnız kontrol listesi maddesiydi → açılış kapısı.
 *
 * KRİTİK (yanlış-pozitif nöbeti): DOĞRU canlı yapılandırma ve BİLEREK dolu
 * izin listesiyle koşan staging (NODE_ENV=production, supkeys.com) açılmalı.
 */
describe("checkStagingOnlyEnv — canlıda staging bayrağı", () => {
  const LIVE = { nodeEnv: "production", webUrl: "https://www.rothern.com" };
  const STAGING = { nodeEnv: "production", webUrl: "https://staging.supkeys.com" };
  const none = { corsAllowVercel: undefined, emailAllowlist: undefined, override: undefined };
  const ALLOWLIST = "uguray156@gmail.com,uguray156+qa-kayit-*@gmail.com";

  it("isLiveEnvironment: yalnız production + rothern.com alan adı", () => {
    expect(isLiveEnvironment(LIVE)).toBe(true);
    expect(isLiveEnvironment({ nodeEnv: "production", webUrl: "https://rothern.com/" })).toBe(true);
    expect(isLiveEnvironment(STAGING)).toBe(false);
    expect(isLiveEnvironment({ nodeEnv: "development", webUrl: "https://www.rothern.com" })).toBe(false);
    expect(isLiveEnvironment({ nodeEnv: undefined, webUrl: "https://www.rothern.com" })).toBe(false);
    // Benzer adlı yabancı alan adı canlı sayılmaz.
    expect(isLiveEnvironment({ nodeEnv: "production", webUrl: "https://rothern.com.evil.io" })).toBe(false);
  });

  it("DOĞRU canlı yapılandırma GEÇER: tanımsız / boş / false / 0", () => {
    expect(checkStagingOnlyEnv({ ...LIVE, ...none })).toEqual([]);
    for (const off of ["", "  ", "false", "FALSE", "0", "no"]) {
      expect(checkStagingOnlyEnv({ ...LIVE, ...none, corsAllowVercel: off })).toEqual([]);
    }
    for (const empty of ["", "   ", "\n"]) {
      expect(checkStagingOnlyEnv({ ...LIVE, ...none, emailAllowlist: empty })).toEqual([]);
    }
  });

  it("canlı + CORS_ALLOW_VERCEL=true → reddet (boşluk/büyük harf farkı da)", () => {
    for (const on of ["true", "TRUE", " true ", "True"]) {
      expect(checkStagingOnlyEnv({ ...LIVE, ...none, corsAllowVercel: on })).toEqual(["cors_allow_vercel"]);
    }
  });

  it("canlı + dolu EMAIL_ALLOWLIST → reddet (yalnız ayraç ',' dahil: o hâlde hiçbir e-posta gitmez)", () => {
    for (const v of [ALLOWLIST, "*@*", ",", " ; "]) {
      expect(checkStagingOnlyEnv({ ...LIVE, ...none, emailAllowlist: v })).toEqual(["email_allowlist"]);
    }
  });

  it("ikisi birden → iki sebep de döner", () => {
    expect(
      checkStagingOnlyEnv({ ...LIVE, corsAllowVercel: "true", emailAllowlist: ALLOWLIST, override: undefined }),
    ).toEqual(["cors_allow_vercel", "email_allowlist"]);
  });

  it("STAGING (production kipi, supkeys.com) dolu izin listesi + vercel jokeriyle AÇILIR", () => {
    expect(
      checkStagingOnlyEnv({ ...STAGING, corsAllowVercel: "true", emailAllowlist: ALLOWLIST, override: undefined }),
    ).toEqual([]);
  });

  it("dev/test inert", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(
        checkStagingOnlyEnv({
          nodeEnv,
          webUrl: "https://www.rothern.com",
          corsAllowVercel: "true",
          emailAllowlist: ALLOWLIST,
          override: undefined,
        }),
      ).toEqual([]);
    }
  });

  it("açık istisna ALLOW_STAGING_ONLY_ENV=true kapıyı kaldırır; başka değer kaldırmaz", () => {
    const bad = { ...LIVE, corsAllowVercel: "true", emailAllowlist: ALLOWLIST };
    expect(checkStagingOnlyEnv({ ...bad, override: "true" })).toEqual([]);
    expect(checkStagingOnlyEnv({ ...bad, override: " TRUE " })).toEqual([]);
    for (const no of ["", "false", "1", "yes"]) {
      expect(checkStagingOnlyEnv({ ...bad, override: no })).toHaveLength(2);
    }
  });
});

describe("assertProdConfigSanity — staging bayrakları", () => {
  const cfg = (map: Record<string, string | undefined>) =>
    ({ get: (k: string) => map[k] }) as never;
  const LIVE_OK = {
    NODE_ENV: "production",
    WEB_URL: "https://www.rothern.com",
    COOKIE_SAMESITE: "lax",
    COOKIE_DOMAIN: ".rothern.com",
  };

  it("DOĞRU canlı yapılandırma THROW ETMEZ (bayraklar tanımsız, boş ya da false)", () => {
    expect(() => assertProdConfigSanity(cfg(LIVE_OK))).not.toThrow();
    expect(() =>
      assertProdConfigSanity(cfg({ ...LIVE_OK, CORS_ALLOW_VERCEL: "", EMAIL_ALLOWLIST: "" })),
    ).not.toThrow();
    expect(() =>
      assertProdConfigSanity(cfg({ ...LIVE_OK, CORS_ALLOW_VERCEL: "false" })),
    ).not.toThrow();
  });

  it("canlı + CORS_ALLOW_VERCEL=true → THROW (mesaj değişkeni ve çözümü söyler)", () => {
    expect(() => assertProdConfigSanity(cfg({ ...LIVE_OK, CORS_ALLOW_VERCEL: "true" }))).toThrow(
      /CORS_ALLOW_VERCEL=true canlıda olamaz/,
    );
  });

  it("canlı + dolu EMAIL_ALLOWLIST → THROW; mesaj listenin İÇERİĞİNİ yazmaz", () => {
    let message = "";
    try {
      assertProdConfigSanity(cfg({ ...LIVE_OK, EMAIL_ALLOWLIST: "gizli-adres@ornek.com" }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/EMAIL_ALLOWLIST canlıda dolu olamaz/);
    expect(message).toContain("ALLOW_STAGING_ONLY_ENV=true");
    expect(message).not.toContain("gizli-adres");
  });

  it("ikisi birden → tek hatada iki sebep", () => {
    expect(() =>
      assertProdConfigSanity(cfg({ ...LIVE_OK, CORS_ALLOW_VERCEL: "true", EMAIL_ALLOWLIST: "*@*" })),
    ).toThrow(/CORS_ALLOW_VERCEL[\s\S]*EMAIL_ALLOWLIST/);
  });

  it("staging (production kipi, supkeys.com) dolu izin listesiyle THROW ETMEZ", () => {
    expect(() =>
      assertProdConfigSanity(
        cfg({
          NODE_ENV: "production",
          WEB_URL: "https://staging.supkeys.com",
          COOKIE_SAMESITE: "lax",
          COOKIE_DOMAIN: ".staging.supkeys.com",
          CORS_ALLOW_VERCEL: "true",
          EMAIL_ALLOWLIST: "uguray156@gmail.com",
        }),
      ),
    ).not.toThrow();
  });

  it("açık istisna ile canlı alan adında da açılır", () => {
    expect(() =>
      assertProdConfigSanity(
        cfg({ ...LIVE_OK, EMAIL_ALLOWLIST: "*@*", ALLOW_STAGING_ONLY_ENV: "true" }),
      ),
    ).not.toThrow();
  });
});
