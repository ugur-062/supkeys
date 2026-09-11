import { expect, test } from "@playwright/test";
import { QA, apiGet, apiPost, apiSession } from "./staging-helpers";
import { companyEndpoints, tierOk } from "./role-endpoints";

/**
 * YAZMA YETKİSİ MATRİSİ — okuma kapısı doğru olup yazma kapısı açık kalabilir;
 * asıl risk yazmada. Her rol, parametresiz POST uçlarına BOŞ GÖVDE gönderir:
 *   · yetkisi yoksa → 403 (guard doğrulamadan ÖNCE çalışır, gövde önemsiz)
 *   · yetkisi varsa → 403 DIŞINDA bir şey (çoğunlukla 400 doğrulama hatası)
 * Böylece hiçbir kayıt oluşmadan kapı sınanır.
 *
 * DIŞARIDA BIRAKILANLAR (boş gövdeyle GERÇEKTEN iş yapabilir):
 *   docs/submit (KYC başvurusu), items/product (boş taslak ürün),
 *   users/seat-selection (koltuk düşürme), rapor indirme uçları (dosya üretimi),
 *   company/views (kapısız beacon), AI uçları (ücretli çağrı), company-auth altı.
 */
const SKIP = new Set([
  "company/docs/submit",
  "company/items/product",
  "company/users/seat-selection",
  "company/views",
]);

const ENDPOINTS = companyEndpoints().filter(
  (e) =>
    e.method === "POST" &&
    e.path.startsWith("company/") &&
    !e.path.startsWith("company/ai") &&
    !e.path.endsWith("/download") &&
    !SKIP.has(e.path) &&
    e.permissions.length > 0,
);

const USERS = [
  { slug: "alıcı · kurucu", email: QA.aliciKurucu },
  { slug: "alıcı · yönetici", email: QA.aliciYonetici },
  { slug: "alıcı · satın almacı", email: QA.aliciSatinalmaci },
  { slug: "alıcı · satışçı", email: QA.aliciSatisci },
  { slug: "alıcı · onaylayıcı", email: QA.aliciOnaylayici },
  { slug: "alıcı · görüntüleyici", email: QA.aliciGoruntuleyici },
  { slug: "tedarikçi · satışçı", email: QA.tedarikciSatisci },
  { slug: "tedarikçi · görüntüleyici", email: QA.tedarikciGoruntuleyici },
  { slug: "ücretsiz · kurucu", email: QA.ucretsizKurucu },
];

for (const u of USERS) {
  test(`yazma matrisi — ${u.slug}`, async () => {
    test.setTimeout(180_000);
    const s = await apiSession(u.email);
    const me = await apiGet(s, "/company-auth/me");
    const perms: string[] = me.body.user.permissions ?? [];
    const isOwner: boolean = !!me.body.user.isOwner;
    const tier: string = me.body.company.tier;
    const has = (k: string) =>
      perms.includes(k) || (isOwner && ["billing:manage", "company:delete", "ownership:transfer"].includes(k));

    const problems: string[] = [];
    const skipped: string[] = [];
    for (let i = 0; i < ENDPOINTS.length; i += 5) {
      await Promise.all(
        ENDPOINTS.slice(i, i + 5).map(async (ep) => {
          let res = await apiPost(s, "/" + ep.path, {});
          // Hız sınırı GLOBAL guard (ClientIpThrottlerGuard) — izin kapısından
          // ÖNCE çalışır, yani sonda kotayı tüketince 403 yerine 429 görürüz.
          // Bu bir yetki açığı değil; bir kez bekleyip yeniden dene, yine 429
          // ise o ucu bu tur için atla.
          if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 20_000));
            res = await apiPost(s, "/" + ep.path, {});
            if (res.status === 429) {
              skipped.push(ep.path);
              return;
            }
          }
          const allowed = ep.permissions.some(has) && tierOk(tier, ep.tier);
          const forbidden = res.status === 403;
          if (allowed && forbidden)
            problems.push(`YANLIŞ KİLİT POST ${ep.path} → 403 (izin: ${ep.permissions.join("|")}, paket: ${ep.tier ?? "-"})`);
          if (!allowed && !forbidden)
            problems.push(`AÇIK KAPI POST ${ep.path} → ${res.status} (gereken: ${ep.permissions.join("|")}, paket: ${ep.tier ?? "-"})`);
        }),
      );
    }
    if (skipped.length > 0) console.log(`   ⓘ ${u.slug}: hız sınırı nedeniyle atlanan uç → ${skipped.join(", ")}`);
    expect.soft(problems, `${u.slug}\n${problems.join("\n")}`).toEqual([]);
  });
}
