import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { OPERATOR } from "@/lib/company-info";

/**
 * KİŞİSEL VERİ SAKLAMA VE İMHA POLİTİKASI (2026-10-16, kullanıcı kararı) ve
 * Kullanıcı Sözleşmesi m.8 (hesabın kapatılması).
 *
 * Kilitlenen: politika Silme Yönetmeliği m.6/1 (a)-(h) içeriğini taşır
 * (amaç, kayıt ortamları, tanımlar, sebepler, iki tedbir maddesi, görev
 * dağılımı, süreler tablosu, periyodik imha, değişiklik geçmişi); tablo
 * satırları API saklama işlerinin süreleriyle AYNI (`apps/api` saklama
 * modülünün sabitleri okunur); Kullanıcı Sözleşmesi m.8 kapatma hakkını
 * gerçek ön koşullarıyla yazar (TBK m.20-25: fiilî kısıt sözleşmede açık).
 */
vi.mock("@/components/marketplace/public-layout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

async function renderLegal(load: () => Promise<{ default: (p: { params: Promise<{ locale: string }> }) => Promise<ReactElement> }>) {
  const { default: Page } = await load();
  const el = await Page({ params: Promise.resolve({ locale: "tr" }) });
  expect(isValidElement(el)).toBe(true);
  const doc = await (el.type as (props: unknown) => Promise<ReactElement>)(el.props);
  return renderToStaticMarkup(doc);
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const between = (html: string, from: string, to?: string) =>
  html.slice(html.indexOf(`id="${from}"`), to ? html.indexOf(`id="${to}"`) : undefined);

const loadPolicy = () => renderLegal(() => import("@/app/[locale]/sozlesmeler/saklama-imha/page"));

/** Tablonun satırları: `<tr>` başına hücre metinleri (başlık satırı hariç). */
function tableRows(html: string): string[][] {
  const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  return tbody
    .split("</tr>")
    .filter((tr) => tr.includes("<td"))
    .map((tr) => tr.split("</td>").filter((td) => td.includes("<td")).map((td) => text(td).trim()));
}

describe("Kişisel Veri Saklama ve İmha Politikası — Silme Yönetmeliği m.6 içeriği", () => {
  it("(a)-(h) bölümleri sırayla numaralı başlıklarla", async () => {
    const html = await loadPolicy();
    const headings = [
      "1. Amaç",
      "2. Kapsam ve Kayıt Ortamları",
      "3. Tanımlar",
      "4. Saklamayı ve İmhayı Gerektiren Sebepler",
      "5. Güvenli Saklama İçin Teknik ve İdari Tedbirler",
      "6. Hukuka Uygun İmha İçin Teknik ve İdari Tedbirler",
      "7. Görev Dağılımı",
      "8. Saklama ve İmha Süreleri",
      "9. Periyodik İmha Süresi",
      "10. İmha Kayıtları",
      "11. İlgili Kişinin Silme Talebi",
      "12. Yürürlük, Yayım ve Güncelleme",
    ];
    let last = -1;
    headings.forEach((h, i) => {
      const at = html.indexOf(`id="madde-${i + 1}"`);
      expect(at, h).toBeGreaterThan(last);
      expect(text(between(html, `madde-${i + 1}`))).toContain(h);
      last = at;
    });
    expect(text(html)).toContain(OPERATOR.legalName);
  });

  it("görev dağılımı: şirket müdürü sorumlu, teknik ekip uygular, KVKK irtibat adresi", async () => {
    const html = await loadPolicy();
    const m7 = text(between(html, "madde-7", "madde-8"));
    expect(m7).toContain("Şirket müdürü");
    expect(m7).toContain("Teknik ekip");
    expect(m7).toContain(OPERATOR.kvkkEmail);
    expect(m7).toContain(`Veri sorumlusu ${OPERATOR.legalName}`);
  });

  it("süreler tablosu: 25 satır × 4 sütun, satırlar 1'den 25'e numaralı", async () => {
    const rows = tableRows(between(await loadPolicy(), "madde-8", "madde-9"));
    expect(rows).toHaveLength(25);
    rows.forEach((cells, i) => {
      expect(cells, `satır ${i + 1}`).toHaveLength(4);
      expect(cells[0]!.startsWith(`${i + 1}. `), cells[0]).toBe(true);
    });
  });

  it("tablo kullanıcının saklama kararını taşır (16 Ekim 2026)", async () => {
    const rows = tableRows(between(await loadPolicy(), "madde-8", "madde-9"));
    const row = (n: number) => rows[n - 1]!.join(" | ");
    expect(row(1)).toContain("hesap silindiğinde hemen");
    // Ekipten çıkarılan kullanıcının hesap verisi de çıkarıldığı anda gider; adı firmada kalır.
    expect(row(1)).toContain("kullanıcı ekipten çıkarıldığında hemen");
    // Yayın günü doğru (2026-10-22): kod çıkarma, silme ve firma anonimleştirmesinde
    // izin / rol alanlarını temizlemiyor → "izinler" silinen veriler arasında
    // sayılmaz; yetki bilgisi hesap kaydında kalır (gerekçe cümlesi yalnız ada).
    expect(row(1)).toContain("adı, firmanın kayıtlarında işlemi yapanın görünmesi için firma kaydıyla birlikte kalır (2. satır)");
    expect(row(1)).toContain("kullanıcının firmadaki yetki bilgisi de hesap kaydında kalır");
    expect(row(1)).not.toContain("adı ve kullanıcı yetkileri");
    expect(rows[0]![0]).not.toContain("izinler");
    expect(rows[0]![3]).not.toContain("izinler");
    // Hesap ve firma kaydı ticari kayıtlara bağlı kalır, takma adlıdır: "anonim" yazılmaz.
    expect(row(1)).not.toMatch(/anonim/i);
    expect(row(1)).toContain("Silinmiş Kullanıcı");
    expect(row(2)).toContain("en geç 30 gün");
    expect(row(2)).not.toMatch(/anonim/i);
    expect(row(2)).toContain("Silinmiş Firma");
    // Firma imhasında yalnız kodun sildiği dosyalar sayılır (ürün görselleri değil).
    expect(row(2)).toContain("Firma doğrulama belgeleri, kimlik belgesi görüntüleri, logo ve kapak görselleri dosya depolama alanından silinir");
    expect(row(2)).not.toContain("Belge ve görseller dosya depolama alanından silinir");
    expect(row(3)).toContain("Kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl");
    // 10 yıl yalnız TİCARİ işlemlere ilişkin e-posta kayıtlarına; geri kalanı 21. satır.
    expect(row(3)).toContain("ticari işlemlere ilişkin e-postaların");
    expect(row(3)).toContain("21. satıra tabidir");
    // Saklama sebebi: Rothern'in kendi yükümlülüğü ile firmaların kayıtlarına erişim ayrı yazılır.
    for (const law of ["Türk Borçlar Kanunu m. 146", "Türk Ticaret Kanunu m. 82", "Vergi Usul Kanunu m. 253", "m. 5/2-e", "m. 5/2-c", "m. 5/2-ç"]) {
      expect(row(3), law).toContain(law);
    }
    expect(row(3)).toContain("Platform'u kullanan firmaların");
    expect(row(3)).toContain("Rothern'in taraf olduğu ticari yazışmalar");
    expect(row(4)).toContain("10 yıl");
    expect(row(4)).toContain("en fazla 2 yıl");
    expect(row(4)).toContain("5651 sayılı Kanun m. 5/3");
    // Trafik kayıtları: yayın günü doğru olan üst sınır ve sağlayıcı sisteminde
    // silme; kapalı kova + 400 gün kurulunca rakam ve kapalı alan yazılır
    // (docs/kvkk-uyum.md "Yayın sonrası açık adımlar").
    expect(row(5)).toContain("En fazla 2 yıl (5651 sayılı Kanun m. 5/3)");
    expect(row(5)).not.toMatch(/En az 1 yıl/);
    expect(row(5)).not.toContain("kapalı saklama alanında");
    expect(row(5)).toContain("hizmet sağlayıcı sisteminde, hesap ayarlarıyla belirlenen süre sonunda otomatik silme");
    expect(row(6)).toContain("5 yıl");
    expect(row(6)).toContain("1 yıl");
    // İç maliyet kaydı VUK defteri değildir: sebep meşru menfaat.
    expect(row(6)).not.toContain("VUK");
    expect(row(6)).toContain("m. 5/2-f");
    expect(row(7)).toContain("90 gün");
    expect(row(8)).toContain("180 gün");
    expect(row(10)).toContain("7 gün");
    expect(row(11)).toContain("30 gün");
    expect(row(12)).toContain("30 gün");
    expect(row(12)).toContain("3. satırdaki süre");
    expect(row(12)).toContain("IP adresi her talepte oluşturulmasından itibaren 30 gün");
    expect(row(13)).toContain("1 yıl");
    expect(row(13)).toContain("ret kaydı 14. satıra göre saklanır");
    // Açık talebin davetleri silinmez; bağlantı daveti kaydı da satırda.
    expect(row(13)).toContain("teklif toplamayı sürdürdükçe silinmez");
    expect(row(13)).toContain("bağlantı daveti kaydı");
    expect(row(14)).toContain("Süresiz");
    expect(row(14)).toContain("yöneticinin kaldırdığı teslim engelinin kaydı");
    expect(row(15)).toContain("1 yıl");
    expect(row(16)).toContain("90 gün");
    expect(row(17)).toContain("1 yıl");
    expect(row(18)).toContain("Yok etme");
    expect(row(19)).toContain("Yönetmelik m. 7/3");
    expect(row(20)).toContain("24 saat");
    expect(row(21)).toMatch(/\(a\) ve \(b\) gönderimden itibaren 1 yıl; \(c\) gönderimden itibaren 2 yıl/);
    expect(row(21)).toContain("hesap güvenliği ve doğrulama e-postaları");
    expect(row(22)).toContain("1 yıl");
    expect(row(22)).toContain("Otomatik silme");
    // Otomatik işi olmayan satırlar: elle, en geç 6 ayda bir.
    for (const n of [23, 24, 25]) expect(row(n), `satır ${n}`).toContain("En geç 6 ayda bir");
    expect(row(25)).toContain("Kurumsal e-posta kutularındaki yazışmalar");
  });

  it("kayıt ortamları kurumsal e-posta kutularını sayar; tedbirler geçmiş zamanla değil, mekanizmayla yazılır", async () => {
    const html = await loadPolicy();
    expect(text(between(html, "madde-2", "madde-3"))).toContain("Kurumsal e-posta kutuları");
    const m5 = text(between(html, "madde-5", "madde-6"));
    // "Her veri işleyenle ... sözleşme bulunur" yazılmaz; DPA'lar sağlayıcıların
    // veri işleme ekleridir. Yayın günü doğru (2026-10-22): aktarımda standart
    // sözleşme KULLANILIR, aktarımın imzalı sözleşmelerle "yapıldığı" yazılmaz.
    expect(m5).not.toContain("sözleşmesi bulunur");
    expect(m5).toContain("veri işleme sözleşmeleri (sağlayıcıların veri işleme ekleri) yapılır");
    expect(m5).toContain("standart sözleşme kullanılır");
    expect(m5).not.toContain("standart sözleşmelerle yapılır");
    // Erişim günlükleri IP taşıyabilir; "kişisel veriler maskelenir" mutlak sözü yok.
    expect(m5).not.toContain("kişisel veriler maskelenir");
    expect(m5).toContain("Erişim (trafik) günlükleri IP adresi içerebilir ve 8. maddedeki tablonun 5. satırına göre saklanır");
    expect(m5).not.toContain("5651 sayılı Kanun gereği IP adresi içerir");
    const m6 = text(between(html, "madde-6", "madde-7"));
    expect(m6).toContain("anonim sayılmaz");
  });

  it("periyodik imha: otomatik işler günlük/haftalık, elle kalemler en geç 6 ayda bir; imha kaydı en az 3 yıl", async () => {
    const html = await loadPolicy();
    const m9 = text(between(html, "madde-9", "madde-10"));
    expect(m9).toContain("her gün ya da her hafta");
    expect(m9).toContain("en geç 6 ayda bir");
    expect(m9).toContain("en geç 30 gün");
    // Koşu başına üst sınır: kalan kayıtlar izleyen gecelerde.
    expect(m9).toContain("izleyen gecelerde");
    expect(m9).toContain("moderasyon kayıtları");
    const m10 = text(between(html, "madde-10", "madde-11"));
    expect(m10).toContain("en az 3 yıllık");
    expect(m10).toContain("imha edilen kişisel verinin kendisi yazılmaz");
    // Boş koşu günde bir kaydedilir (`RetentionRecordService`).
    expect(m10).toContain("günde bir kez kaydedilir");
  });

  it("ilgili kişi talebi 30 gün; hesap silme ve KVKK metnine bağlanır; değişiklik geçmişi gerçek yayım tarihi 22.10.2026", async () => {
    const html = await loadPolicy();
    const m11 = between(html, "madde-11", "madde-12");
    expect(text(m11)).toContain("en geç 30 gün içinde");
    expect(m11).toContain('href="/hesap-silme"');
    expect(m11).toContain('href="/sozlesmeler/kvkk"');
    const m12 = text(between(html, "madde-12"));
    expect(m12).toContain("22.10.2026 — İlk yayım");
    expect(m12).not.toContain("16.10.2026");
  });
});

/* Tablo ile API'deki saklama işi aynı sayıyı kullanmalı (kullanıcı kararı:
   "metin ve işler birebir"). API modülünün sabitleri kaynak dosyadan okunur;
   bir süre değişirse iki yer AYNI değişiklikte güncellenir. */
describe("Saklama tablosu ⇔ API saklama işi", () => {
  const SOURCE = path.resolve(__dirname, "../../../../../api/src/modules/data-retention/retention-policy.ts");

  it("API sabitleri tablodaki sürelerle aynı", async () => {
    expect(existsSync(SOURCE), SOURCE).toBe(true);
    const src = readFileSync(SOURCE, "utf8");
    const value = (name: string) => {
      const m = src.match(new RegExp(`export const ${name} = (\\d+);`));
      expect(m, name).not.toBeNull();
      return Number(m![1]);
    };
    const rows = tableRows(between(await loadPolicy(), "madde-8", "madde-9"));
    const period = (n: number) => rows[n - 1]![1]!;
    const cases: [string, number, string][] = [
      ["EMAIL_LOG_RETENTION_YEARS", 3, "yıl"],
      ["INQUIRY_IP_RETENTION_DAYS", 12, "gün"],
      ["AI_TEMP_UPLOAD_RETENTION_HOURS", 20, "saat"],
      ["SECURITY_EMAIL_LOG_RETENTION_YEARS", 21, "yıl"],
      ["INVITE_EMAIL_LOG_RETENTION_YEARS", 21, "yıl"],
      ["DISCOVERY_EMAIL_LOG_RETENTION_YEARS", 21, "yıl"],
      ["TEAM_INVITATION_RETENTION_YEARS", 22, "yıl"],
      ["AUDIT_RECORD_RETENTION_YEARS", 4, "yıl"],
      ["AUDIT_NETWORK_DATA_RETENTION_YEARS", 4, "yıl"],
      ["AI_USAGE_RETENTION_YEARS", 6, "yıl"],
      ["AI_USAGE_EMAIL_RETENTION_YEARS", 6, "yıl"],
      ["AI_CHAT_RETENTION_DAYS", 7, "gün"],
      ["UNUSED_LINK_RETENTION_DAYS", 11, "gün"],
      ["UNVERIFIED_INQUIRY_RETENTION_DAYS", 12, "gün"],
      ["THIRD_PARTY_CONTACT_RETENTION_YEARS", 13, "yıl"],
      ["NOTIFICATION_RETENTION_YEARS", 15, "yıl"],
      ["SENT_DIGEST_ITEM_RETENTION_DAYS", 16, "gün"],
      ["SEARCH_MISS_RETENTION_YEARS", 17, "yıl"],
    ];
    for (const [name, row, unit] of cases) {
      expect(period(row), `${name} → satır ${row}`).toContain(`${value(name)} ${unit}`);
    }
  });
});

describe("Kullanıcı Sözleşmesi m.8 — hesabın kapatılması gerçek koşullarıyla", () => {
  it("kapatma yolu, Kurucu devri, son yönetici, tek kullanıcıda süren iş; 'dilediği zaman' yok", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kullanici/page"));
    const section = between(html, "madde-8", "madde-9");
    const m8 = text(section);
    expect(m8).toContain("8. Askıya Alma, Hesabın Kapatılması ve Fesih");
    expect(m8).not.toContain("dilediği zaman");
    // Kullanıcı firmanın tamamı değildir: sözleşme kendisi bakımından sona erer.
    expect(m8).toContain("kendisi bakımından sona erdirebilir");
    expect(m8).toContain("firma ve diğer kullanıcılar bakımından devam eder");
    expect(m8).not.toMatch(/anonim/i);
    expect(m8).toContain("Ayarlar › Hesap Bilgileri › Hesabı sil");
    expect(m8).toContain('"Hesabımı sil"');
    expect(m8).toContain("pasif olanlar dâhil");
    expect(m8).toContain("Kurucu rolünü başka bir kullanıcıya devretmesi");
    expect(m8).toContain("en az bir aktif kullanıcı");
    expect(m8).toContain("süren bir siparişi");
    expect(m8).toContain("açık bir satın alma talebi");
    expect(m8).toContain("Silinmiş Kullanıcı");
    expect(m8).toContain("en geç 30 gün");
    expect(m8).toContain(OPERATOR.kvkkEmail);
    for (const href of ["/hesap-silme", "/sozlesmeler/gizlilik#madde-6", "/sozlesmeler/saklama-imha"]) {
      expect(section).toContain(`href="${href}"`);
    }
  });
});

/* Yayın günü doğru (2026-10-22): yapay zekâ tedarikçi araması, kutu açık
   bırakılırsa bulduğu firmaları talebi yayımlayan adına KENDİSİ davet eder →
   "nihai karar Kullanıcı'ya aittir" yazılmaz; otomatik davet ve kapatma yolu
   açıkça söylenir. */
describe("Kullanıcı Sözleşmesi m.7 — yapay zekâ özellikleri koddaki davranışla", () => {
  it("otomatik davet yazılı, 'nihai karar' sözü yok", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kullanici/page"));
    const m7 = text(between(html, "madde-7", "madde-8"));
    expect(m7).not.toContain("nihai karar");
    expect(m7).toContain("yardımcı niteliktedir");
    expect(m7).toContain("tedarikçi araması");
    expect(m7).toContain("talebi yayımlayan Kullanıcı adına");
    // Tur yalnız davete uygun firmayı davet eder (zayıf eşleşme, çıkış, önceden onay
    // ülkesi, günlük tavan…); kullanıcı görmediği çeviriden sorumlu tutulmaz.
    expect(m7).toContain("bulunan ve davete uygun firmalar");
    expect(m7).not.toContain("üretilen çıktıların doğruluğunun kontrolü");
    expect(m7).toContain("kullandığı ya da kabul ettiği öneri, taslak ve sonuçların doğruluğunun kontrolü");
    expect(m7).toContain("otomatik çevirisinde esas olan, Kullanıcı'nın girdiği özgün metindir");
    expect(m7).toContain("otomatik olarak davet edilir");
    expect(m7).toContain("talep bazında kapatılabilir");
    expect(m7).not.toMatch(/ihale/i);
  });
});
