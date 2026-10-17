import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { OPERATOR } from "@/lib/company-info";

/**
 * GİZLİLİK VE KVKK — UYGULAMA İÇİ HESAP SİLME (2026-10-16, kullanıcı kararı).
 *
 * İki mağaza da gizlilik metnine bakar: Apple 5.1.1(i) silmenin nasıl
 * istendiğini ve neyin saklandığını, Google Play hesap silme yolunun metinde
 * çapayla bulunabilmesini ister. Kilitlenen: Gizlilik m.6 "Hesabınızı Silme"
 * `#madde-6` çapasıyla çizilir, uygulama içi yolu (Ayarlar › Hesap Bilgileri ›
 * Hesabı sil) ve girişsiz yolu (KVKK e-postası) anar, `/hesap-silme`
 * sayfasına bağlanır; KVKK m.9 aynı yolu ve rıza geri almayı anar.
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

/** Sayfa `<LegalDoc …/>` döner; async sunucu bileşenini burada çözüp HTML'e çeviririz. */
async function renderLegal(load: () => Promise<{ default: (p: { params: Promise<{ locale: string }> }) => Promise<ReactElement> }>) {
  const { default: Page } = await load();
  const el = await Page({ params: Promise.resolve({ locale: "tr" }) });
  expect(isValidElement(el)).toBe(true);
  const doc = await (el.type as (props: unknown) => Promise<ReactElement>)(el.props);
  return renderToStaticMarkup(doc);
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe("Gizlilik Politikası — hesap silme maddesi", () => {
  it("m.6 'Hesabınızı Silme' #madde-6 çapasıyla; uygulama içi yol, girişsiz e-posta yolu, /hesap-silme bağlantısı", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const section = html.slice(html.indexOf('id="madde-6"'), html.indexOf('id="madde-7"'));
    expect(section).toContain("6. Hesabınızı Silme");
    const body = text(section);
    expect(body).toContain("Ayarlar › Hesap Bilgileri › Hesabı sil");
    expect(body).toContain("e-posta göndermeniz ya da destekle görüşmeniz gerekmez");
    expect(body).toContain("Silinmiş Kullanıcı");
    expect(section).toContain(`href="mailto:${OPERATOR.kvkkEmail}"`);
    expect(section).toContain('href="/hesap-silme"');
    // Haklar maddesi 7'ye kaydı; rıza geri alma yolu söylenir.
    expect(text(html.slice(html.indexOf('id="madde-7"')))).toContain("açık rızanızı geri alma");
  });

  it("mobil uygulamalar kapsamda; yapay zekâ ve anlık bildirim sağlayıcıları adıyla, eşdeğer koruma beyanı", async () => {
    const body = text(await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page")));
    expect(body).toContain("Rothern iOS ve Android mobil uygulamaları");
    expect(body).toContain("yapay zekâ özellikleri için Google");
    expect(body).toContain("Firebase Cloud Messaging");
    expect(body).toContain("aynı ya da ona eşdeğer düzeyde korumakla yükümlüdür");
  });
});

/* İnceleme turu 2026-10-16: metin koddan fazlasını vaat etmez. Silinen kayıt
   takma adlıdır (kimliği firma kayıtlarına bağlı) — "anonim" denmez; silme
   herkes için "dilediği zaman" değildir (Kurucu devri, son kullanıcı); ödeme
   alınmaz, ödeme sağlayıcısı listede yok; kurulum / onay ekranındaki düğme ve
   kuralı yerine getiremeyen için destek yolu anılır; saklanan kayıtların
   kapsayıcı maddesi ve yedekler yazılıdır. */
describe("Gizlilik Politikası — koda sadık metin", () => {
  it("m.6: 'anonim' ve 'dilediğiniz zaman' yok; kurulum ekranı düğmesi, pasif üye, son yönetici, yedek, destek yolu var", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const m6 = text(html.slice(html.indexOf('id="madde-6"'), html.indexOf('id="madde-7"')));
    expect(m6).not.toMatch(/anonim/);
    expect(m6).not.toContain("dilediğiniz zaman");
    expect(m6).toContain('"Hesabımı sil"');
    expect(m6).toContain("pasif olanlar dahil");
    expect(m6).toContain("kullanıcıları yönetebilecek en az bir aktif kişi");
    expect(m6).toContain("Sistem yedeklerindeki kopyalar");
    expect(m6).toContain("Aktivite Logu");
    expect(m6).toContain("koşulları yerine getiremiyorsanız");
    expect(m6).toContain("en geç 30 gün içinde silinir");
  });

  /* İnceleme 2026-10-16: kuruculuğu devredip hesabını silen kişinin yetkili
     kimlik no'su ve kimlik belgesi firma kaydında kalır (KVKK m.7 ile aynı);
     girişsiz talep kayıtlı adrese yazılarak doğrulanır (admin silmesi gelen
     e-postanın gönderen adresine dayanmaz); Aktivite Logu'ndaki kısa kod. */
  it("m.6: firma kaydında kalan yetkili kimlik bilgisi, girişsiz talebin doğrulanması, Aktivite Logu kodu", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const m6 = text(html.slice(html.indexOf('id="madde-6"'), html.indexOf('id="madde-7"')));
    expect(m6).toContain("firma yetkilisinin kimlik numarası ve kimlik belgesi görüntüleri");
    expect(m6).toContain("firma faaliyetini sürdürdükçe firmada kalır");
    expect(m6).toContain("onayınızı oradan isteriz");
    expect(m6).toContain("kısa bir kod");
  });

  it("m.1 ödeme alınmadığını söyler; m.4 sağlayıcı kategorilerinde ödeme yok; m.7 bildirim kapatma yolları", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const m1 = text(html.slice(html.indexOf('id="madde-1"'), html.indexOf('id="madde-2"')));
    expect(m1).toContain("şu anda ödeme alınmaz");
    expect(m1).toContain("tek yönlü bir özet");
    const m4 = text(html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"')));
    expect(m4).not.toMatch(/ödeme/);
    expect(text(html.slice(html.indexOf('id="madde-7"')))).toContain("Ayarlar › Bildirim Tercihleri");
  });
});

describe("KVKK Aydınlatma Metni — koda sadık metin", () => {
  it("m.1 yetkili kimlik no + belge; m.4 bildirim içeriği türü ve bağlantısıyla; m.7 alan adlarıyla, firma kaydı bilgisi firmayla kalır", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const body = text(html);
    expect(body).toContain("firma yetkilisinin T.C. kimlik numarası");
    expect(body).toContain("bildirim başlığı, metni, türü ve bağlantısı");
    const m7 = text(html.slice(html.indexOf('id="madde-7"'), html.indexOf('id="madde-8"')));
    expect(m7).toContain("adınız, soyadınız, telefon numaranız ve e-posta adresiniz hesap kaydından hemen kaldırılır");
    expect(m7).not.toContain("kimlik ve iletişim bilgileriniz hesap kaydından");
    expect(m7).toContain("Firma kaydındaki bilgiler");
    expect(m7).toContain("firma yetkilisinin kimlik numarası ve kimlik belgesi görüntüleri");
    expect(m7).toContain("firma kaydıyla birlikte kendiliğinden silinir");
  });

  it("m.9: uygulama içi silme yazılı başvuru gerektirmez (başvuru 'değil' demez); rıza geri almanın sonucu yazılı", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const m9 = text(html.slice(html.indexOf('id="madde-9"')));
    expect(m9).toContain("yazılı başvuru yapmanıza gerek kalmadan");
    expect(m9).not.toContain("hesabınıza bağlı kişisel verilerinizin silinmesini");
    expect(m9).toContain("işleme faaliyetine");
    // 2026-10-16: yurt dışı aktarım açık rızaya dayanmaz → geri alınacak aktarım rızası yok.
    expect(m9).not.toMatch(/aktarıma ilişkin rıza/);
    expect(m9).toContain("Platform'u kullanmanızı engellemez");
  });
});

/* YURT DIŞINA AKTARIM (2026-10-16, kullanıcı kararı): dayanak KVKK m.9/4-c
   standart sözleşme; açık rıza yalnız arızi aktarım (m.9/6-a), hizmet ona
   bağlanmaz. Sağlayıcılar unvan ve ülkeleriyle sayılır (KVKK m.10). */
describe("KVKK Aydınlatma Metni — yurt dışına aktarım", () => {
  it("aktarım açık rızaya dayandırılmaz; m.9/4-c standart sözleşme, Kuruma bildirim, arızi açık rıza m.9/6-a", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const body = text(html);
    expect(body).not.toContain("açık rızanıza dayanılarak");
    expect(body).not.toMatch(/yurt dışına aktarım,? yalnızca açık rızanıza dayanır/i);
    const m4 = text(html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"')));
    expect(m4).toContain("KVKK m. 9/4-c");
    expect(m4).toContain("standart sözleşme");
    // Mekanizma şimdiki zamanla: imza ve bildirim canlı kapısındaki operatör adımı
    // (docs/kvkk-uyum.md); metin "imzalanmış / bildirilmiştir" diye olmuş bitmiş yazmaz.
    expect(m4).toContain("beş iş günü içinde Kişisel Verileri Koruma Kurumu'na bildirilir");
    expect(m4).not.toMatch(/imzalanmış|bildirilmiştir/);
    expect(m4).toContain("KVKK m. 5/2-c");
    expect(m4).toContain("m. 5/2-f");
    expect(m4).toContain("Platform'dan yararlanmanız yurt dışına aktarıma rıza vermenize bağlı değildir");
    expect(m4).toContain("KVKK m. 9/6-a");
    expect(m4).toContain("etkili kanun yollarına başvurabilmenizi");
    // Yurt içi alıcılar da sayılır.
    expect(m4).toContain("işlem yaptığınız diğer firmalara");
    // m.8 yalnız yurt içi aktarımın dayanağıdır; yurt dışındaki karşı taraf için
    // m.9 dayanağı avukat yanıtıyla yazılır (kvkk-uyum §10 soru 5).
    expect(m4).toContain("Yurt içindeki karşı taraflara ve kurumlara aktarım KVKK m. 8/2-a");
    expect(m4).not.toMatch(/Bu aktarımlar KVKK m\. 8\/2-a/);
  });

  /* İnceleme 2026-10-16: Apple standart sözleşme imzalamıyor (kvkk-uyum
     sağlayıcı tablosu). Veri işleyen listesinde ve SS-2 cümlesinde yer almaz;
     kendi paragrafı yalnız olguyu yazar. */
  it("Apple (APNs) veri işleyen listesinde değil; kendi paragrafında olgu ve kapatma yolu", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const m4html = html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"'));
    const list = text(m4html.slice(m4html.indexOf("<ul"), m4html.indexOf("</ul>")));
    expect(list).not.toContain("Apple");
    const m4 = text(m4html);
    expect(m4).toContain("Apple Inc.'in (ABD) Apple Push Notification service (APNs)");
    expect(m4).toContain("standart sözleşme imzalamadığı için yukarıdaki sağlayıcılar arasında sayılmaz");
    expect(m4).toContain("cihazınızın ayarlarından kapattığınızda Apple'a bildirim içeriği gönderilmez");
  });

  it("kurumsal e-posta (Google Workspace) sağlayıcılar arasında; Sentry ayıklama sözü mutlak değil", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const m4 = text(html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"')));
    expect(m4).toContain("Google Workspace — kurumsal e-posta");
    expect(m4).toContain(OPERATOR.kvkkEmail);
    expect(m4).not.toContain("kişisel veri içermeyecek şekilde maskeleme");
    expect(m4).toContain("IP adresi ve bağlantılardaki jetonlar gönderilmeden ayıklanır");
  });

  it("her sağlayıcı unvanı ve ülkesiyle; verinin tutulduğu yer AB ise yazılır", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const m4 = text(html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"')));
    for (const recipient of [
      "Supabase Pte. Ltd. (Singapur; veriler Almanya'da",
      "Vercel Inc. (ABD",
      "Render Services, Inc. (ABD",
      "Cloudflare, Inc. (ABD",
      "Plus Five Five, Inc. (Resend; ABD)",
      "Google LLC ve bağlı şirketleri (ABD",
      "Apple Inc.'in (ABD)",
      "Functional Software, Inc. (Sentry; ABD",
    ]) {
      expect(m4, recipient).toContain(recipient);
    }
  });

  it("m.3: açık rıza yalnız isteğe bağlı ticari ileti için; bilgilendirme e-postaları m.5/2-f; aktarım rızaya dayanmaz", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const m3 = text(html.slice(html.indexOf('id="madde-3"'), html.indexOf('id="madde-4"')));
    for (const basis of ["m. 5/2-c", "m. 5/2-ç", "m. 5/2-e", "m. 5/2-f"]) expect(m3).toContain(basis);
    expect(m3).toContain("açık rızanıza (KVKK m. 5/1)");
    expect(m3).toContain("bu aktarım açık rızanıza dayanmaz");
    // Kullanılmayan, belirsiz rızalar yok; İYS'siz ticari ileti gitmez.
    expect(m3).not.toMatch(/profil ve hizmet iyileştirme|analitik/i);
    expect(m3).toContain("İleti Yönetim Sistemi'ne (İYS) kaydedildikten sonra gönderilir");
    expect(m3).toContain("rızaya değil m. 5/2-f'ye dayanır");
    // m.5/2-ç Rothern'in KENDİ yükümlülüğüdür; firmaların kayıtlarına erişim m.5/2-c.
    expect(m3).toContain("Rothern'in kendi ticari defter, belge ve yazışmalarının");
    expect(m3).toContain("saklamakla yükümlü oldukları işlem kayıtlarına erişimin sürdürülmesi");
  });

  it("kapsam ziyaretçileri sayar; yayımlama amacı, kimlik belgesi karartma, video sağlayıcıları, başvuru kanalları ve Kurul şikâyeti yazılı", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const body = text(html);
    expect(body).toContain("Metin; Platform'u ziyaret eden kişileri");
    expect(text(html.slice(html.indexOf('id="madde-1"'), html.indexOf('id="madde-2"')))).toContain("karartın");
    expect(text(html.slice(html.indexOf('id="madde-2"'), html.indexOf('id="madde-3"')))).toContain(
      "herkese açık olarak yayımlanması seçilen satın alma taleplerinin",
    );
    const m6 = text(html.slice(html.indexOf('id="madde-6"'), html.indexOf('id="madde-7"')));
    expect(m6).toContain("YouTube veya Vimeo");
    expect(m6).toContain("IP adresiniz ile tarayıcı bilgileriniz onlara iletilir");
    const m9 = text(html.slice(html.indexOf('id="madde-9"')));
    expect(m9).toContain(OPERATOR.address);
    expect(m9).toContain("güvenli elektronik imza ya da mobil imzayla");
    expect(m9).toContain("KVKK m. 14 uyarınca Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz");
  });

  it("m.7 saklama özeti politikayla aynı süreler; Saklama ve İmha Politikası'na bağlanır", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const section = html.slice(html.indexOf('id="madde-7"'), html.indexOf('id="madde-8"'));
    const m7 = text(section);
    expect(m7).toContain("kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl");
    expect(m7).toContain("2 yıl dolmadan silinir");
    expect(m7).toContain("en az 1 yıl, en fazla 2 yıl");
    expect(m7).toContain("en geç 30 gün içinde");
    expect(m7).toContain("süresiz");
    expect(section).toContain('href="/sozlesmeler/saklama-imha"');
    // Politika satırlarıyla aynı: ticari OLMAYAN e-posta kayıtları, ekipten çıkarma,
    // açık talebin davetleri, firma kaydı "anonim" değil.
    expect(m7).toContain("ticari işlemlere ilişkin e-posta gönderim kayıtları");
    expect(m7).toContain("Ekipten çıkarılan kullanıcının");
    expect(m7).toContain("teklif toplamayı sürdürdükçe silinmez");
    // Firma kaydı ticari kayıtlara bağlı kalır: "silinir veya anonim hâle getirilir" denmez.
    expect(m7).not.toMatch(/silinir veya anonim/i);
    expect(m7).toContain("yalnız \"Silinmiş Firma\" adıyla kalır");
  });
});

describe("Gizlilik Politikası — aktarım ve saklama KVKK metni ve politikayla hizalı", () => {
  it("m.4 aktarım dayanağı standart sözleşme, rızaya bağlı değil; m.6 süreler politikadan ve politikaya bağlantı", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const m4 = text(html.slice(html.indexOf('id="madde-4"'), html.indexOf('id="madde-5"')));
    expect(m4).toContain("KVKK m. 9/4-c");
    expect(m4).toContain("açık rızanıza bağlı değildir");
    // Karşı taraf firmalar da alıcıdır; sağlayıcıların TAMAMI yurt dışında.
    expect(m4).toContain("işlem yaptığınız firmalarla");
    expect(m4).toContain("Sağlayıcıların tamamı yurt dışında");
    const section = html.slice(html.indexOf('id="madde-6"'), html.indexOf('id="madde-7"'));
    const m6 = text(section);
    expect(m6).not.toContain("7. maddesindeki süreler");
    expect(m6).toContain("Kişisel Veri Saklama ve İmha Politikası");
    expect(m6).toContain("kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl");
    expect(m6).toContain("en fazla 2 yıl");
    // İptal edilen oturum kaydı 10 yıl değil (politika satır 9): "giriş ve işlem kayıtları".
    expect(m6).not.toContain("oturum ve işlem kayıtları");
    expect(m6).toContain("giriş ve işlem kayıtları");
    expect(section).toContain('href="/sozlesmeler/saklama-imha"');
  });

  it("m.3 alıcının şehrini saymaz (2026-10-04'ten beri basılmıyor); m.5 gömülü videoları anar", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/gizlilik/page"));
    const m3 = text(html.slice(html.indexOf('id="madde-3"'), html.indexOf('id="madde-4"')));
    expect(m3).not.toContain("şehri");
    const m5 = text(html.slice(html.indexOf('id="madde-5"'), html.indexOf('id="madde-6"')));
    expect(m5).toContain("YouTube veya Vimeo");
  });
});

describe("KVKK Aydınlatma Metni — başvuru maddesi", () => {
  it("m.9 uygulama içi silmeyi ve rıza geri almayı anar, hesap silme sayfasına ve Gizlilik m.6'ya bağlanır", async () => {
    const html = await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page"));
    const section = html.slice(html.indexOf('id="madde-9"'));
    const body = text(section);
    expect(body).toContain("Ayarlar › Hesap Bilgileri › Hesabı sil");
    expect(body).toContain("rızanızı dilediğiniz zaman");
    expect(section).toContain('href="/hesap-silme"');
    expect(section).toContain('href="/sozlesmeler/gizlilik#madde-6"');
  });

  it("aktarım listesinde anlık bildirim sağlayıcıları (Firebase Cloud Messaging, Apple) yer alır", async () => {
    const body = text(await renderLegal(() => import("@/app/[locale]/sozlesmeler/kvkk/page")));
    expect(body).toContain("Firebase Cloud Messaging");
    expect(body).toContain("Apple Push Notification service");
    expect(body).toContain("cihaz bildirim belirteci");
  });
});
