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
  checkProdCookieConfig,
  assertProdConfigSanity,
} from "../../src/common/config/prod-config-sanity";

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
