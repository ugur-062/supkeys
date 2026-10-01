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
import { makeCompanyWithUser, makeUser } from "./factories";
import { CompanyRole } from "@rothern/db";
import { runWithLocale } from "../../src/common/i18n/locale-context";

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

  it("eşzamanlı iki doğrulama satıcıya TEK bildirim gönderir (LU-18)", async () => {
    const email = makeEmail();
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, email as never);
    const { company, product, sellerEmail } = await seedProduct();
    await svc.create({ companySlug: company.slug as string, productSlug: product.slug as string, ...VALID });
    const token = /t=([a-f0-9]{64})/.exec(email.sent[0].body)?.[1] as string;
    const [a, b] = await Promise.all([svc.verify(token), svc.verify(token)]);
    expect(a.ok && b.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(email.sent.filter((e) => e.to === sellerEmail)).toHaveLength(1);
  });

  it("satıcı bildirimi DB hatasında sessizce kaybolmaz ama doğrulamayı da düşürmez (LU-18)", async () => {
    const email = makeEmail();
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, email as never);
    const { company, product } = await seedProduct();
    await svc.create({ companySlug: company.slug as string, productSlug: product.slug as string, ...VALID });
    const token = /t=([a-f0-9]{64})/.exec(email.sent[0].body)?.[1] as string;
    const warn = jest.spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => undefined);
    const spy = jest.spyOn(prisma.companyUser, "findMany").mockRejectedValueOnce(new Error("pool timeout"));
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    try {
      await expect(svc.verify(token)).resolves.toHaveProperty("ok", true);
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("pool timeout"));
    } finally {
      process.off("unhandledRejection", unhandled);
      spy.mockRestore();
      warn.mockRestore();
    }
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
    // Ürün kimliği döner: panel bağlantısı ürünün kendisini açar (arayüz testi D-131).
    expect(list.items[0].product.id).toBe(product.id);
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

  it("sayfalı liste: 20'den sonrası ?page=2 ile gelir; openCount sayfadan bağımsız toplam", async () => {
    const { svc, company, product } = await verifiedInquiry();
    // 24 doğrulanmış talep daha (toplam 25), en eskisi yanıtlı.
    const base = Date.now() - 60 * 60_000;
    for (let i = 0; i < 24; i += 1) {
      await prisma.publicInquiry.create({
        data: {
          companyId: company.id,
          productId: product.id,
          name: `Ziyaretci ${i}`,
          email: `z${i}@example.com`,
          message: "Fiyat bilgisi rica ederim.",
          tokenHash: `page-test-${company.id}-${i}`,
          expiresAt: new Date(base + 86_400_000),
          verifiedAt: new Date(base + i * 1000),
        },
      });
    }
    const oldest = await prisma.publicInquiry.findFirstOrThrow({
      where: { companyId: company.id },
      orderBy: { verifiedAt: "asc" },
    });
    await prisma.publicInquiryReply.create({
      data: { inquiryId: oldest.id, authorId: "u", body: "Yanit" },
    });
    const p1 = await svc.listForCompany(company.id, 1);
    const p2 = await svc.listForCompany(company.id, 2);
    expect(p1.total).toBe(25);
    expect(p1.items).toHaveLength(20);
    expect(p2.items).toHaveLength(5);
    expect(p2.items.map((x) => x.id)).toContain(oldest.id);
    expect(new Set([...p1.items, ...p2.items].map((x) => x.id)).size).toBe(25);
    // Yanıt bekleyen TOPLAM 24 — yanıtlı kayıt 2. sayfada olsa da.
    expect(p1.openCount).toBe(24);
    expect(p2.openCount).toBe(24);
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
    const { items: sent } = await svc.listClaimed(b.company.id, b.user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].quantity).toBe("500 adet");

    // Ziyaretçiye "önce doğrula" e-postası GİTMEZ; yalnız satıcı bildirimi.
    expect(mail.sent.some((m) => m.type === "public_inquiry_verify")).toBe(false);
    expect(mail.sent.some((m) => m.type === "public_inquiry_received")).toBe(true);
  });

  it("engel iki yönlü: engellenen/engelleyen firma bilgi talebi açamaz (404), satıcıya e-posta gitmez (MU-10)", async () => {
    const { svc, mail } = svcWith();
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
    await prisma.companyBlock.create({ data: { blockerCompanyId: company.id, blockedCompanyId: b.company.id } });
    await expect(svc.createAsCompany(payload)).rejects.toThrow(NotFoundException);
    await prisma.companyBlock.deleteMany({});
    await prisma.companyBlock.create({ data: { blockerCompanyId: b.company.id, blockedCompanyId: company.id } });
    await expect(svc.createAsCompany(payload)).rejects.toThrow(NotFoundException);
    expect(await prisma.publicInquiry.count()).toBe(0);
    expect(mail.sent).toHaveLength(0);
    // Engel kalkınca talep geçer.
    await prisma.companyBlock.deleteMany({});
    await expect(svc.createAsCompany(payload)).resolves.toHaveProperty("id");
  });

  it("satıcı e-postası yalnız sell:view taşıyan üyelere, en eski önce, en fazla 5 (MU-10)", async () => {
    const { svc, mail } = svcWith();
    const { company, product, sellerEmail } = await seedProduct();
    const at = (m: number) => ({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, m)) });
    // Kurucu en eski; ardından 5 satın almacı/onaylayıcı (izinsiz), sonra 6 satışçı.
    await prisma.companyUser.updateMany({ where: { email: sellerEmail }, data: at(0) });
    const buyersOnly = [];
    for (let i = 1; i <= 5; i++) buyersOnly.push(await makeUser(prisma, company.id, [CompanyRole.SATIN_ALMACI], at(i)));
    const approver = await makeUser(prisma, company.id, [], { ...at(6), permissions: ["approval:act"] });
    const sellers = [];
    for (let i = 10; i < 16; i++) sellers.push(await makeUser(prisma, company.id, [CompanyRole.SATISCI], at(i)));
    const gone = await makeUser(prisma, company.id, [CompanyRole.SATISCI], { ...at(7), isActive: false });
    const b = await buyer();
    await svc.createAsCompany({
      companyId: b.company.id,
      email: b.user.email,
      fullName: "Ayşe Demir",
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      message: "Fiyat ve teslim süresi bilgisi rica ederim.",
    });
    await new Promise((r) => setTimeout(r, 50));
    const to = mail.sent.filter((m) => m.type === "public_inquiry_received").map((m) => m.to);
    expect(to).toEqual([sellerEmail, ...sellers.slice(0, 4).map((u) => u.email)]);
    for (const u of [...buyersOnly, approver, gone]) expect(to).not.toContain(u.email);
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
    const { items: sent } = await svc.listClaimed(b.company.id, b.user.email);
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

  it("engel sonradan kurulursa: yanıt 404 ve e-posta yok; iki tarafın listesinde de gizli, misafir talebi kalır (LU-18)", async () => {
    const { svc, mail } = svcWith();
    const { company, product } = await seedProduct();
    const seller = await prisma.companyUser.findFirst({ where: { companyId: company.id }, select: { id: true } });
    const b = await buyer();
    const inq = await svc.createAsCompany({
      companyId: b.company.id,
      email: b.user.email,
      fullName: "Ayşe Demir",
      companySlug: company.slug as string,
      productSlug: product.slug as string,
      message: "Fiyat ve teslim süresi bilgisi rica ederim.",
    });
    // Misafir talebi de olsun — engel onu etkilememeli.
    await svc.create({ companySlug: company.slug as string, productSlug: product.slug as string, ...VALID });
    const token = /t=([a-f0-9]{64})/.exec(mail.sent.find((m) => m.type === "public_inquiry_verify")!.body)?.[1] as string;
    await svc.verify(token);
    await new Promise((r) => setTimeout(r, 30));

    await prisma.companyBlock.create({ data: { blockerCompanyId: b.company.id, blockedCompanyId: company.id } });
    mail.sent.length = 0;
    await expect(svc.reply(company.id, seller!.id, inq.id, "Stokta var.")).rejects.toThrow(NotFoundException);
    await new Promise((r) => setTimeout(r, 30));
    expect(mail.sent).toHaveLength(0);
    expect(await prisma.publicInquiryReply.count()).toBe(0);

    const received = await svc.listForCompany(company.id);
    expect(received.items.map((i) => i.id)).not.toContain(inq.id);
    expect(received.total).toBe(1);
    const sent = await svc.listClaimed(b.company.id, b.user.email);
    expect(sent.total).toBe(0);

    // Engel kalkınca her şey geri gelir.
    await prisma.companyBlock.deleteMany({});
    expect((await svc.listForCompany(company.id)).total).toBe(2);
    await expect(svc.reply(company.id, seller!.id, inq.id, "Stokta var.")).resolves.toHaveProperty("id");
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
    const { items: sent } = await svc.listClaimed(visitor.company.id, VALID.email);
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
    expect((await svc.listClaimed(visitor.company.id, VALID.email)).items).toHaveLength(1);
    expect((await svc.listClaimed(visitor.company.id, VALID.email)).items).toHaveLength(1);
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
    expect((await svc.listClaimed(other.company.id, "baska@example.com")).items).toEqual([]);
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
    expect((await svc.listClaimed(visitor.company.id, VALID.email)).items).toEqual([]);
  });

  it("gonderilenler SAYFALI: 50'den fazlasi kirpilmaz, en eski talep ve yaniti ?page ile gelir; openCount toplam", async () => {
    // Eskiden `take: 50` sessizce kirpiyordu: 51. (en eski) talep ve ona
    // gelen yanit alicinin panelinde hic gorunmuyordu.
    const svc = new PublicInquiryService(
      prisma as unknown as PrismaBypassService,
      makeEmail() as never,
    );
    const { company, product } = await seedProduct();
    const b = await makeCompanyWithUser(prisma);
    const base = Date.now() - 2 * 60 * 60_000;
    for (let i = 0; i < 55; i += 1) {
      await prisma.publicInquiry.create({
        data: {
          companyId: company.id,
          productId: product.id,
          name: "Ayse Demir",
          email: b.user.email,
          message: `Soru ${i}`,
          tokenHash: `sent-page-${b.company.id}-${i}`,
          expiresAt: new Date(base + 86_400_000),
          verifiedAt: new Date(base + i * 1000),
          claimedCompanyId: b.company.id,
          claimedAt: new Date(),
        },
      });
    }
    const oldest = await prisma.publicInquiry.findFirstOrThrow({
      where: { claimedCompanyId: b.company.id },
      orderBy: { verifiedAt: "asc" },
    });
    await prisma.publicInquiryReply.create({
      data: { inquiryId: oldest.id, authorId: "u", body: "Eski yanit" },
    });

    const pages = [];
    for (let p = 1; p <= 3; p += 1) pages.push(await svc.listClaimed(b.company.id, b.user.email, p));
    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 15]);
    expect(pages[0].total).toBe(55);
    const all = pages.flatMap((p) => p.items);
    expect(new Set(all.map((x) => x.id)).size).toBe(55);
    const last = all.find((x) => x.id === oldest.id);
    expect(last?.replies[0]?.body).toBe("Eski yanit");
    // Yanit bekleyen TOPLAM 54 — yanitli kayit son sayfada olsa da.
    expect(pages[0].openCount).toBe(54);
    expect(pages[2].openCount).toBe(54);

    // Uc: sayfasiz cagri (dagitim sonrasi acik kalan eski web sekmesi) eski
    // bicimi alir — duz dizi, en yeni 50; `?page=` sayfali nesneyi.
    const { CompanyInquiryController } = await import("../../src/modules/public-inquiry/company-inquiry.controller");
    const ctrl = new CompanyInquiryController(svc);
    const user = { companyId: b.company.id, email: b.user.email } as never;
    const legacy = await ctrl.sent(user);
    expect(Array.isArray(legacy)).toBe(true);
    expect(legacy).toHaveLength(50);
    const paged = (await ctrl.sent(user, "3")) as { items: unknown[]; total: number };
    expect(paged.items).toHaveLength(15);
    expect(paged.total).toBe(55);
  });
});

/**
 * ÜCRETSİZ SATICI — anonim gelen talep (2026-09-06, "premium çekmek için"):
 * soruyu görür (mesaj, adet, alıcının şehri/faaliyeti), kimliği görmez (ad ve
 * firma adı sunucuda düşer), yanıt ucu paket kapılı; e-posta adı yazmaz.
 */
describe("ücretsiz satıcı — anonim gelen talep", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function freeSellerWithProduct() {
    const { company, user } = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    seq += 1;
    await prisma.company.update({
      where: { id: company.id },
      data: { slug: `ucretsiz-${seq}`, publicEnabled: true, name: `Ücretsiz Satıcı ${seq}` },
    });
    const product = await prisma.companyItem.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        name: "Kompanzasyon panosu",
        unit: "adet",
        slug: `komp-${seq}`,
        isPublic: true,
        publishedAt: new Date(),
        description: "x".repeat(120),
        images: ["a.webp"],
        keywords: ["pano"],
      },
    });
    return { sellerId: company.id, companySlug: `ucretsiz-${seq}`, productSlug: `komp-${seq}` };
  }

  it("liste: kimlik düşer, soru/adet/alıcı şehri kalır, locked:true; paketli görünüm kimliği verir", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, mail as never);
    const seller = await freeSellerWithProduct();
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({ where: { id: buyer.company.id }, data: { city: "İzmir", activities: ["MANUFACTURER"] } });
    await svc.createAsCompany({
      companyId: buyer.company.id,
      email: buyer.user.email,
      fullName: "Ayşe Demir",
      companySlug: seller.companySlug,
      productSlug: seller.productSlug,
      message: "500 adet için fiyat ve teslim süresi rica ederim.",
      quantity: "500 adet",
    });

    const free = await svc.listForCompany(seller.sellerId, 1, { viewerPaid: false });
    expect(free.locked).toBe(true);
    expect(free.items).toHaveLength(1);
    const row = free.items[0]!;
    expect(row.anonymous).toBe(true);
    expect(row.name).toBeNull();
    expect(row.companyName).toBeNull();
    expect(row.message).toContain("500 adet");
    expect(row.quantity).toBe("500 adet");
    expect(row.buyerCity).toBe("İzmir");
    expect(row.buyerActivities).toEqual(["MANUFACTURER"]);
    const dump = JSON.stringify(free);
    expect(dump).not.toContain("Ayşe Demir");
    expect(dump).not.toContain(buyer.company.name);
    expect(dump).not.toContain(buyer.user.email);

    const paid = await svc.listForCompany(seller.sellerId, 1, { viewerPaid: true });
    expect(paid.locked).toBe(false);
    expect(paid.items[0]!.anonymous).toBe(false);
    expect(paid.items[0]!.name).toBe("Ayşe Demir");
    expect(paid.items[0]!.companyName).toBe(buyer.company.name);
  });

  it("satıcı e-postası: ücretsiz satıcıya ziyaretçi ADI yazılmaz, 'Silver' der; paketliye ad yazılır", async () => {
    const mail = makeEmail();
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, mail as never);
    const seller = await freeSellerWithProduct();
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await svc.createAsCompany({
      companyId: buyer.company.id,
      email: buyer.user.email,
      fullName: "Ayşe Demir",
      companySlug: seller.companySlug,
      productSlug: seller.productSlug,
      message: "Fiyat bilgisi rica ederim, teşekkürler.",
    });
    await new Promise((r) => setTimeout(r, 50));
    const toSeller = mail.sent.filter((m) => m.type === "public_inquiry_received");
    expect(toSeller.length).toBeGreaterThan(0);
    for (const m of toSeller) {
      expect(m.body).toMatch(/Silver/);
      expect(m.body).not.toContain("Ayşe Demir");
    }
    mail.sent.length = 0;

    const { company: paidSeller, product } = await seedProduct();
    await svc.createAsCompany({
      companyId: buyer.company.id,
      email: buyer.user.email,
      fullName: "Ayşe Demir",
      companySlug: paidSeller.slug as string,
      productSlug: product.slug as string,
      message: "Fiyat bilgisi rica ederim, teşekkürler.",
    });
    await new Promise((r) => setTimeout(r, 50));
    const toPaid = mail.sent.filter((m) => m.type === "public_inquiry_received");
    expect(toPaid.length).toBeGreaterThan(0);
    expect(toPaid[0]!.body).toContain("Ayşe Demir");
    expect(toPaid[0]!.body).not.toMatch(/Silver/);
  });

  it("yanıt ucu paket kapılı (CompanyPaidTierGuard metadata'sı); okuma ucu değil", async () => {
    const { CompanyInquiryController } = await import("../../src/modules/public-inquiry/company-inquiry.controller");
    const { CompanyPaidTierGuard } = await import("../../src/modules/company-auth/guards/company-paid-tier.guard");
    const replyGuards = (Reflect.getMetadata("__guards__", CompanyInquiryController.prototype.reply) ?? []) as unknown[];
    expect(replyGuards).toContain(CompanyPaidTierGuard);
    const readGuards = (Reflect.getMetadata("__guards__", CompanyInquiryController.prototype.received) ?? []) as unknown[];
    expect(readGuards).not.toContain(CompanyPaidTierGuard);
  });

  it("kayıtlı alıcının talep ucu GOLD kapılı — izin paketin İÇİNDE (T-02, arayüz testi Y-03)", async () => {
    const { CompanyInquiryController } = await import("../../src/modules/public-inquiry/company-inquiry.controller");
    const { CompanyPaidTierGuard } = await import("../../src/modules/company-auth/guards/company-paid-tier.guard");
    const { COMPANY_TIER_KEY } = await import("../../src/modules/company-auth/decorators/require-tier.decorator");
    const createGuards = (Reflect.getMetadata("__guards__", CompanyInquiryController.prototype.create) ?? []) as unknown[];
    expect(createGuards).toContain(CompanyPaidTierGuard);
    expect(Reflect.getMetadata(COMPANY_TIER_KEY, CompanyInquiryController.prototype.create)).toBe("GOLD");
  });

  it("misafir talep ucu BİLİNÇLİ AÇIK: pazar yeri anahtarı + sıkı hız sınırı (O-059, karar T-02)", async () => {
    const { PublicInquiryController } = await import("../../src/modules/public-inquiry/public-inquiry.controller");
    const { MarketplaceLiveGuard } = await import("../../src/common/http/marketplace-live.guard");
    const classGuards = (Reflect.getMetadata("__guards__", PublicInquiryController) ?? []) as unknown[];
    expect(classGuards).toContain(MarketplaceLiveGuard);
    const keys = Reflect.getMetadataKeys(PublicInquiryController.prototype.create) as string[];
    const limitKey = keys.find((k) => String(k).includes("LIMIT"));
    expect(limitKey && Reflect.getMetadata(limitKey, PublicInquiryController.prototype.create)).toBe(5);
  });
});

// DİL (2026-09-27): misafirin dili satıra yazılır. Eskiden doğrulama bağlantısı
// dilsizdi ve satıcının yanıt bildirimi (satıcının isteğinde doğar) misafire
// HEP Türkçe gidiyordu; kayıt çağrısı da Türkçe adrese açılıyordu.
describe("misafir talebi — DİL talebin açıldığı dilde kalır", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("İngilizce form: doğrulama bağlantısı /en, satır dili en; Türkçe satıcının yanıtı misafire İngilizce", async () => {
    const calls: { type: string; locale: string; body: string }[] = [];
    const mail = {
      send: jest.fn(async (input: Record<string, unknown>) => {
        calls.push({
          type: (input.context as { type: string }).type,
          locale: input.locale as string,
          body: JSON.stringify(input.templateData),
        });
        return { emailLogId: "x", sent: true };
      }),
    };
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, mail as never);
    const { company, product } = await seedProduct();
    const seller = await prisma.companyUser.findFirstOrThrow({
      where: { companyId: company.id },
      select: { id: true },
    });

    await runWithLocale("en", () =>
      svc.create({
        companySlug: company.slug as string,
        productSlug: product.slug as string,
        ...VALID,
      }),
    );
    const verifyMail = calls.find((c) => c.type === "public_inquiry_verify")!;
    expect(verifyMail.locale).toBe("en");
    expect(verifyMail.body).toContain("/en/confirm-inquiry?t=");
    const row = await prisma.publicInquiry.findFirstOrThrow();
    expect(row.locale).toBe("en");

    const token = /t=([a-f0-9]{64})/.exec(verifyMail.body)?.[1] as string;
    await svc.verify(token);
    // Satıcı Türkçe arayüzden yanıtlar (istek dili tr) — bildirim yine İngilizce.
    await runWithLocale("tr", () => svc.reply(company.id, seller.id, row.id, "Stokta var."));
    await new Promise((r) => setTimeout(r, 50)); // bildirim fire-and-forget

    const note = calls.find((c) => c.type === "public_inquiry_reply")!;
    expect(note.locale).toBe("en");
    expect(note.body).toContain("/en/company/signup?email=");
    expect(note.body).not.toContain("/company/kayit");
  });

  it("dili olmayan eski satır: yanıt bildirimi varsayılan dilde (Türkçe) kalır", async () => {
    const calls: { type: string; locale: string }[] = [];
    const mail = {
      send: jest.fn(async (input: Record<string, unknown>) => {
        calls.push({ type: (input.context as { type: string }).type, locale: input.locale as string });
        return { emailLogId: "x", sent: true };
      }),
    };
    const svc = new PublicInquiryService(prisma as unknown as PrismaBypassService, mail as never);
    const { company, product } = await seedProduct();
    const seller = await prisma.companyUser.findFirstOrThrow({
      where: { companyId: company.id },
      select: { id: true },
    });
    const row = await prisma.publicInquiry.create({
      data: {
        companyId: company.id,
        productId: product.id,
        name: "Eski Misafir",
        email: "eski@example.com",
        message: "Eski kayıt — dil sütunu yokken açıldı.",
        tokenHash: "eski-hash",
        expiresAt: new Date(),
        verifiedAt: new Date(),
      },
    });
    await svc.reply(company.id, seller.id, row.id, "Yanıt.");
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.find((c) => c.type === "public_inquiry_reply")?.locale).toBe("tr");
  });
});
