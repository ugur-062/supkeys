import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthCookieInterceptor } from "../../src/common/auth/auth-cookie.interceptor";

/**
 * "OTURUMU AÇIK BIRAK" — SÖZLEŞME.
 *
 * BUG (2026-09-14, kullanıcı bildirdi): işaret konuluyor, ÇEREZ 30 gün
 * yazılıyor ama içindeki JETON `JWT_EXPIRES_IN` varsayılanıyla 1 SAAT
 * yaşıyordu. Canlıda ölçüldü: 720 kat fark. Kullanıcı ertesi gün döndüğünde
 * çerez duruyor, içi geçersiz → girişe atılıyor. Belirti tam da buydu:
 * "işaretlediğim halde her seferinde yeniden giriyorum".
 *
 * Kayan oturum bunu GİZLİYORDU: aktif kullanıcının jetonu tazeleniyor,
 * dolayısıyla hata yalnız uygulamayı kapatıp dönen kişide görünüyordu.
 *
 * Bu testler ömrü SAYI olarak değil İLİŞKİ olarak tutar: kalıcı oturumun
 * jetonu, kalıcı olmayandan belirgin şekilde uzun olmalı. Süre
 * (`JWT_PERSISTENT_EXPIRES_IN`) değişse de sözleşme ayakta kalır.
 */
describe("Kalıcı oturum jeton ömrü", () => {
  const jwt = new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } });
  const config = new ConfigService({ JWT_PERSISTENT_EXPIRES_IN: "7d" });
  const interceptor = new AuthCookieInterceptor(config, jwt);

  /** `withPersistentClaim` private — sözleşme davranışı üzerinden sınanır. */
  const imzala = (persistent: boolean): { iat: number; exp: number; persistent?: boolean } => {
    const taban = jwt.sign({ sub: "u1", type: "company" });
    const yeni = (
      interceptor as unknown as {
        withPersistentClaim(t: string, p: boolean): string | null;
      }
    ).withPersistentClaim(taban, persistent);
    if (!yeni) throw new Error("imzalanamadı");
    return jwt.verify(yeni);
  };

  it("kalıcı oturumun jetonu belirgin şekilde UZUN yaşar", () => {
    const kalici = imzala(true);
    const gecici = imzala(false);
    const kaliciSaat = (kalici.exp - kalici.iat) / 3600;
    const geciciSaat = (gecici.exp - gecici.iat) / 3600;

    /* kalıcı olmayan oturum varsayılan ömürde kalır */ expect(geciciSaat).toBeCloseTo(1, 1);
    // İLİŞKİ sınanır, sabit sayı değil: süre ayarı değişse de kural ayakta.
    /* kalıcı oturum geçiciden uzun olmalı */ expect(kaliciSaat).toBeGreaterThan(geciciSaat * 12);
  });

  it("persistent claim jetona YAZILIR — kayan oturum onu okuyup ömrü korur", () => {
    expect(imzala(true).persistent).toBe(true);
    expect(imzala(false).persistent).toBe(false);
  });

  it("ayar verilmezse güvenli bir varsayılana düşer (çerezle EŞİTLENMEZ)", () => {
    const varsayilansiz = new AuthCookieInterceptor(new ConfigService({}), jwt);
    const t = (
      varsayilansiz as unknown as {
        withPersistentClaim(t: string, p: boolean): string | null;
      }
    ).withPersistentClaim(jwt.sign({ sub: "u1", type: "company" }), true);
    const { iat, exp } = jwt.verify<{ iat: number; exp: number }>(t!);
    const gun = (exp - iat) / 86_400;
    /* varsayılan 7 gün */ expect(gun).toBeCloseTo(7, 1);
    // Çerez 30 gün yaşıyor; jetonu ona EŞİTLEMEK çalınan çerezin penceresini
    // 30 güne çıkarırdı — bilinçli olarak daha kısa tutuluyor.
    /* çerez ömrüne (30 gün) eşitlenmemeli */ expect(gun).toBeLessThan(30);
  });
});
