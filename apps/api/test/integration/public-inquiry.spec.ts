/**
 * MİSAFİR BİLGİ TALEBİ — sitedeki TEK anonim yazma ucu.
 *
 * Bu spec'in kilitlediği ana iddia: **doğrulanmadan satıcıya hiçbir şey
 * gitmez.** Spam savunması hız limitlerine değil buna dayanıyor; limitler
 * yalnız kuyruk şişmesini engelliyor.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PublicInquiryService } from "../../src/modules/public-inquiry/public-inquiry.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { REDACTED_CONTEXT_TYPES } from "../../src/modules/email/email.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

/** Gönderilen e-postaları yakalayan sahte servis. */
function makeEmail() {
  const sent: { to: string; type: string; body: string }[] = [];
  return {
    sent,
    send: jest.fn(async (input: Record<string, unknown>) => {
      const to = (input.to as { email: string }).email;
      const ctx = input.context as { type: string } | undefined;
      sent.push({
        to,
        type: ctx?.type ?? "",
        body: JSON.stringify(input.templateData),
      });
      return { emailLogId: "x", sent: true };
    }),
  };
}

let seq = 0;
async function seedProduct() {
  seq += 1;
  const { company, user } = await makeCompanyWithUser(prisma);
  const c = await prisma.company.update({
    where: { id: company.id },
    data: { slug: `firma-${seq}`, publicEnabled: true, name: `Satıcı ${seq}` },
  });
  const p = await prisma.companyItem.create({
    data: {
      companyId: company.id,
      createdById: user.id,
      name: "Dağıtım panosu",
      unit: "adet",
      slug: `pano-${seq}`,
      isPublic: true,
      publishedAt: new Date(),
      description: "x".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
    },
  });
  return { company: c, product: p, sellerEmail: user.email };
}

const VALID = {
  name: "Ahmet Yılmaz",
  email: "ziyaretci@example.com",
  companyName: "Örnek Sanayi",
  message: "Bu ürün hakkında fiyat ve teslim süresi bilgisi rica ederim.",
};

describe("misafir talebi — DOĞRULANMADAN SATICIYA GİTMEZ", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("oluşturma yalnız ZİYARETÇİYE doğrulama e-postası gönderir", async () => {
    const email = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );
    const { company, product, sellerEmail } = await seedProduct();

    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });

    // TEK e-posta ve o da ziyaretçiye — satıcı hiçbir şey almadı.
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe(VALID.email);
    expect(email.sent[0].type).toBe("public_inquiry_verify");
    expect(email.sent.some((e) => e.to === sellerEmail)).toBe(false);

    // Kayıt var ama DOĞRULANMAMIŞ.
    const row = await prisma.publicInquiry.findFirst();
    expect(row?.verifiedAt).toBeNull();
  });

  it("doğrulama SATICIYA iletir ve idempotenttir", async () => {
    const email = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );
    const { company, product, sellerEmail } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });

    // Jeton e-postadaki bağlantıdan okunur (hash'lenmiş saklanıyor).
    const token = /t=([a-f0-9]{64})/.exec(email.sent[0].body)?.[1] as string;
    expect(token).toBeTruthy();

    const r1 = await svc.verify(token);
    expect(r1.ok).toBe(true);
    expect(r1.email).toBe(VALID.email);

    await new Promise((r) => setTimeout(r, 30)); // fire-and-forget bildirim
    expect(email.sent.some((e) => e.to === sellerEmail)).toBe(true);

    // İkinci tıklama hata vermez (kullanıcı e-postayı iki kez açabilir).
    const r2 = await svc.verify(token);
    expect(r2.ok).toBe(true);
  });

  it("geçersiz jeton 404, süresi dolmuş jeton 400", async () => {
    const email = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );
    await expect(svc.verify("yok")).rejects.toBeInstanceOf(NotFoundException);

    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    const token = /t=([a-f0-9]{64})/.exec(email.sent[0].body)?.[1] as string;
    await prisma.publicInquiry.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(svc.verify(token)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("misafir talebi — bot ve limit savunması", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  const svcWith = (email: ReturnType<typeof makeEmail>) =>
    new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );

  it("bot tuzağı dolu → SESSİZCE başarı, kayıt YOK", async () => {
    // Hata döndürmek bota hangi kontrolün yakaladığını öğretirdi.
    const email = makeEmail();
    const { company, product } = await seedProduct();
    const r = await svcWith(email).create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
      honeypot: "http://spam.example",
    });
    expect(r.ok).toBe(true);
    expect(await prisma.publicInquiry.count()).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("2 saniyeden hızlı gönderim → sessizce yutulur", async () => {
    const email = makeEmail();
    const { company, product } = await seedProduct();
    await svcWith(email).create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
      elapsedMs: 400,
    });
    expect(await prisma.publicInquiry.count()).toBe(0);
  });

  it("aynı e-postadan günlük tavan aşılınca 400", async () => {
    const email = makeEmail();
    const { company, product } = await seedProduct();
    const send = () =>
      svcWith(email).create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      });
    await send();
    await send();
    await send();
    await expect(send()).rejects.toBeInstanceOf(BadRequestException);
  });

  it("aynı IP'den saatlik tavan aşılınca 400", async () => {
    const email = makeEmail();
    const { company, product } = await seedProduct();
    for (let i = 0; i < 5; i += 1) {
      await svcWith(email).create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
        email: `z${i}@example.com`,
        ip: "1.2.3.4",
      });
    }
    await expect(
      svcWith(email).create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
        email: "z9@example.com",
        ip: "1.2.3.4",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("misafir talebi — e-posta gönderilemezse ÖLÜ SATIR BIRAKMA", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("gönderim hatasında satır SİLİNİR ve 503 döner", async () => {
    // Kalsaydı asla doğrulanamayacak bir satır kullanıcının günlük kotasını
    // yerdi (3/gün → üç geçici hata kullanıcıyı bir gün kilitlerdi).
    const email = {
      send: jest.fn(async () => {
        throw new Error("resend down");
      }),
    };
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );
    const { company, product } = await seedProduct();
    await expect(
      svc.create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await prisma.publicInquiry.count()).toBe(0);
  });

  it("adres suppression listesindeyse DÜRÜST hata + satır silinir", async () => {
    // Sessizce "gitti" demek kullanıcıyı sebebini göremeden bekletirdi.
    const email = { send: jest.fn(async () => ({ emailLogId: "x", sent: false })) };
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      email as never,
    );
    const { company, product } = await seedProduct();
    await expect(
      svc.create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.publicInquiry.count()).toBe(0);
  });
});

describe("misafir talebi — hedef kapısı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  const svc = () =>
    new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      makeEmail() as never,
    );

  it("yayımlanmamış ürüne talep gönderilemez", async () => {
    const { company, product } = await seedProduct();
    await prisma.companyItem.update({
      where: { id: product.id },
      data: { isPublic: false },
    });
    await expect(
      svc().create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("vitrini kapalı firmanın ürününe talep gönderilemez", async () => {
    const { company, product } = await seedProduct();
    await prisma.company.update({
      where: { id: company.id },
      data: { publicEnabled: false },
    });
    await expect(
      svc().create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("olmayan ürün/firma 404", async () => {
    await expect(
      svc().create({ companySlug: "yok", productSlug: "yok", ...VALID }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("misafir talebi — jeton SIRRI", () => {
  it("doğrulama jetonu EmailLog payload'ında maskelenir", () => {
    // `?t=<token>` tek kullanımlıktır: okuyan, başkasının talebini onaylayıp
    // satıcıya ilettirebilir — spam kapısını DIŞARIDAN açar. Payload düz
    // saklanırsa `tokenHash` ile hash'lemenin amacı boşa çıkar.
    expect(REDACTED_CONTEXT_TYPES.has("public_inquiry_verify")).toBe(true);
  });

  it("satıcı bildirimi maskelenmez (sır taşımıyor)", () => {
    expect(REDACTED_CONTEXT_TYPES.has("public_inquiry_received")).toBe(false);
  });
});

describe("satıcı tarafı — okuma, yanıtlama, hesaba bağlama", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  /** Doğrulanmış bir talep kurar (satıcının görebileceği hâl). */
  async function verifiedInquiry(email = VALID.email) {
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
      email,
    });
    const token = /t=([a-f0-9]{64})/.exec(mail.sent[0].body)?.[1] as string;
    await svc.verify(token);
    return { svc, mail, company, product };
  }

  it("YALNIZ doğrulanmış talepler listelenir", async () => {
    const { svc, company, product } = await verifiedInquiry();
    // İkinci talep doğrulanmadan bırakılır.
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
      email: "ikinci@example.com",
    });
    const list = await svc.listForCompany(company.id);
    expect(list.total).toBe(1);
    expect(list.items[0].name).toBe(VALID.name);
  });

  it("ziyaretçinin E-POSTASI ve TELEFONU satıcıya DÖNMEZ", async () => {
    // Dönseydi satıcı doğrudan yazıp platformu atlar, ilişkiyi göremezdik.
    const { svc, company } = await verifiedInquiry();
    const list = await svc.listForCompany(company.id);
    const json = JSON.stringify(list);
    expect(json).not.toContain(VALID.email);
    expect(json).not.toContain("phone");
  });

  it("başka firmanın talebi görünmez", async () => {
    const { svc } = await verifiedInquiry();
    const other = await makeCompanyWithUser(prisma);
    expect((await svc.listForCompany(other.company.id)).total).toBe(0);
  });

  it("yanıt kaydedilir ve bildirim İÇERİK TAŞIMAZ", async () => {
    const { svc, mail, company } = await verifiedInquiry();
    const list = await svc.listForCompany(company.id);
    const before = mail.sent.length;

    const secret = "Birim fiyat 41.000 TL, teslim 3 hafta.";
    const r = await svc.reply(company.id, "user-1", list.items[0].id, secret);
    expect(r.body).toBe(secret);
    await new Promise((x) => setTimeout(x, 40));

    const notice = mail.sent.slice(before).find((e) => e.to === VALID.email);
    expect(notice).toBeTruthy();
    // KRİTİK: yanıtın metni bildirime GİRMEZ — girseydi kayıt için sebep
    // kalmaz, platform ücretsiz e-posta rölesine dönerdi.
    expect(notice?.body).not.toContain(secret);
    expect(notice?.body).not.toContain("41.000");
    expect(notice?.type).toBe("public_inquiry_reply");

    // Yanıt listede görünür.
    const after = await svc.listForCompany(company.id);
    expect(after.items[0].replies).toHaveLength(1);
  });

  it("başka firmanın talebine yanıt verilemez", async () => {
    const { svc, company } = await verifiedInquiry();
    const list = await svc.listForCompany(company.id);
    const other = await makeCompanyWithUser(prisma);
    await expect(
      svc.reply(other.company.id, "u", list.items[0].id, "sızma denemesi"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("doğrulanmamış talebe yanıt verilemez", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    const row = await prisma.publicInquiry.findFirstOrThrow();
    await expect(
      svc.reply(company.id, "u", row.id, "yanıt"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("KAYITLI alıcı talebi — doğrulama adımı YOK", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  function svcWith() {
    const mail = makeEmail();
    return {
      mail,
      svc: new PublicInquiryService(
        prisma as unknown as PrismaBypassService,
        mail as never,
      ),
    };
  }

  async function buyer() {
    const b = await makeCompanyWithUser(prisma);
    return b;
  }

  it("talep ANINDA satıcıya iletilir ve alıcının 'gönderdiklerim'inde görünür", async () => {
    // Misafir yolunda iletim jetona bağlı; burada kimlik zaten kanıtlı
    // (hesap açarken e-posta doğrulandı), o yüzden ikinci bir kapı olmaz.
    const { svc, mail } = svcWith();
    const { company, product } = await seedProduct();
    const b = await buyer();

    await svc.createAsCompany({
      companyId: b.company.id,
      email: b.user.email,
      fullName: "Ayşe Demir",
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      message: "Bu ürün için fiyat ve teslim süresi bilgisi rica ederim.",
      quantity: "500 adet",
    });

    // Satıcı GÖRÜR (doğrulama beklemeden).
    const received = await svc.listForCompany(company.id);
    expect(received.total).toBe(1);
    expect(received.items[0].name).toBe("Ayşe Demir");
    expect(received.items[0].companyName).toBe(b.company.name);
    expect(received.items[0].hasAccount).toBe(true);

    // Alıcı da GÖRÜR — satır claimedCompanyId ile DOĞDU, kayıt sonrası
    // tembel bağlamayı beklemedi.
    const sent = await svc.listClaimed(b.company.id, b.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].quantity).toBe("500 adet");

    // Ziyaretçiye "önce doğrula" e-postası GİTMEZ; yalnız satıcı bildirimi.
    expect(mail.sent.some((m) => m.type === "public_inquiry_verify")).toBe(false);
    expect(mail.sent.some((m) => m.type === "public_inquiry_received")).toBe(true);
  });

  it("kendi ürününe talep gönderilemez", async () => {
    const { svc } = svcWith();
    const { company, product } = await seedProduct();
    await expect(
      svc.createAsCompany({
        companyId: company.id,
        email: "x@example.com",
        fullName: "Kendi Kullanıcı",
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        message: "Kendi ürünüme soru soruyorum, olmamalı.",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("aynı ürüne 24 saatte ikinci talep engellenir", async () => {
    // Yanıt gecikince kullanıcı tekrar gönderir; satıcının kutusunda aynı
    // sorunun kopyası birikmesin.
    const { svc } = svcWith();
    const { company, product } = await seedProduct();
    const b = await buyer();
    const payload = {
      companyId: b.company.id,
      email: b.user.email,
      fullName: "Ayşe Demir",
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      message: "Fiyat ve teslim süresi bilgisi rica ederim.",
    };
    await svc.createAsCompany(payload);
    await expect(svc.createAsCompany(payload)).rejects.toThrow(
      /zaten bir talep/i,
    );
  });

  it("misafir günlük tavanı (3/e-posta) kayıtlı alıcıya UYGULANMAZ", async () => {
    // Gerçek bir satın almacı gün içinde üçten fazla tedarikçiye soru sorar;
    // dördüncüde kilitlenmek ürünü kullanılmaz yapardı.
    const { svc } = svcWith();
    const b = await buyer();
    for (let i = 0; i < 4; i++) {
      const { company, product } = await seedProduct();
      await svc.createAsCompany({
        companyId: b.company.id,
        email: b.user.email,
        fullName: "Ayşe Demir",
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        message: `Dördüncüsü de geçmeli — talep ${i}.`,
      });
    }
    const sent = await svc.listClaimed(b.company.id, b.user.email);
    expect(sent).toHaveLength(4);
  });

  it("KAYITLI alıcıya gelen yanıt bildirimi 'hesap aç' DEMEZ", async () => {
    // Yanıt bildirimi misafir için yazılmıştı ("ücretsiz hesabınızı
    // oluşturun" + kayıt ekranına CTA). Hesabı OLAN alıcıya aynı metni
    // göndermek onu kayıt ekranına atar ve yanıtın hangi sayfada beklediğini
    // hiç söylemez.
    const { svc, mail } = svcWith();
    const { company, product } = await seedProduct();
    const seller = await prisma.companyUser.findFirst({
      where: { companyId: company.id },
      select: { id: true },
    });
    const b = await buyer();

    const inq = await svc.createAsCompany({
      companyId: b.company.id,
      email: b.user.email,
      fullName: "Ayşe Demir",
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      message: "Fiyat ve teslim süresi bilgisi rica ederim.",
    });

    mail.sent.length = 0;
    await svc.reply(company.id, seller!.id, inq.id, "Stokta var, fiyat ektedir.");
    await new Promise((r) => setTimeout(r, 50)); // bildirim fire-and-forget

    const note = mail.sent.find((m) => m.type === "public_inquiry_reply");
    expect(note?.to).toBe(b.user.email.toLowerCase());
    expect(note!.body).not.toMatch(/hesabınızı oluştur|company\/kayit/i);
    expect(note!.body).toContain("/company/satinalma/bilgi-taleplerim");
    // İçerik İKİ dalda da taşınmaz — yazışma platformda kalsın.
    expect(note!.body).not.toContain("Stokta var");
  });

  it("MİSAFİR alıcıya gelen yanıt bildirimi hâlâ kayda çağırır", async () => {
    // Karşı dal: hesabı olmayan ziyaretçi için yanıtı okumanın tek yolu kayıt.
    const { svc, mail } = svcWith();
    const { company, product } = await seedProduct();
    const seller = await prisma.companyUser.findFirst({
      where: { companyId: company.id },
      select: { id: true },
    });
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    const token = /t=([a-f0-9]{64})/.exec(mail.sent[0].body)?.[1] as string;
    await svc.verify(token);
    const row = await prisma.publicInquiry.findFirstOrThrow();

    mail.sent.length = 0;
    await svc.reply(company.id, seller!.id, row.id, "Stokta var.");
    await new Promise((r) => setTimeout(r, 50));

    const note = mail.sent.find((m) => m.type === "public_inquiry_reply");
    expect(note!.body).toContain("/company/kayit");
  });

  it("yayımda olmayan ürüne talep gönderilemez (misafirle AYNI kapı)", async () => {
    const { svc } = svcWith();
    const { company, product } = await seedProduct();
    await prisma.companyItem.update({
      where: { id: product.id },
      data: { isPublic: false },
    });
    const b = await buyer();
    await expect(
      svc.createAsCompany({
        companyId: b.company.id,
        email: b.user.email,
        fullName: "Ayşe Demir",
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        message: "Vitrinden çekilmiş ürüne soru sorulamamalı.",
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("hesaba bağlama — TEMBEL ve idempotent", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("aynı e-postayla kaydolan kullanıcı talebini ve yanıtı görür", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    const token = /t=([a-f0-9]{64})/.exec(mail.sent[0].body)?.[1] as string;
    await svc.verify(token);
    const list = await svc.listForCompany(company.id);
    await svc.reply(company.id, "u", list.items[0].id, "Fiyat teklifimiz ektedir.");

    // Ziyaretçi şimdi kaydoluyor.
    const visitor = await makeCompanyWithUser(prisma);
    const sent = await svc.listClaimed(visitor.company.id, VALID.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].seller.name).toBe(company.name);
    expect(sent[0].replies[0].body).toBe("Fiyat teklifimiz ektedir.");
  });

  it("ikinci çağrı aynı sonucu verir (idempotent)", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    await svc.verify(/t=([a-f0-9]{64})/.exec(mail.sent[0].body)?.[1] as string);
    const visitor = await makeCompanyWithUser(prisma);
    expect(await svc.listClaimed(visitor.company.id, VALID.email)).toHaveLength(1);
    expect(await svc.listClaimed(visitor.company.id, VALID.email)).toHaveLength(1);
  });

  it("BAŞKA e-postayla kaydolan kullanıcı talebi göremez", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    await svc.verify(/t=([a-f0-9]{64})/.exec(mail.sent[0].body)?.[1] as string);
    const other = await makeCompanyWithUser(prisma);
    expect(await svc.listClaimed(other.company.id, "baska@example.com")).toEqual([]);
  });

  it("DOĞRULANMAMIŞ talep hesaba bağlanmaz", async () => {
    // Satıcıya hiç iletilmedi; hesaba bağlanacak bir şey de yok.
    const mail = makeEmail();
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      mail as never,
    );
    const { company, product } = await seedProduct();
    await svc.create({
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      ...VALID,
    });
    const visitor = await makeCompanyWithUser(prisma);
    expect(await svc.listClaimed(visitor.company.id, VALID.email)).toEqual([]);
  });
});
