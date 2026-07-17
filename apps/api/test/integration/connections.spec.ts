/**
 * Bağlantı sistemi — davet/kabul/ret/geri-çek yaşam döngüsü, IDOR, blok
 * etkileri (istek + mesajlaşma + keşif), yarış durumları (atomik accept/reject,
 * çapraz PENDING temizliği), e-posta daveti (kayıtlı/kayıtsız/pasif firma),
 * referral iptali ve keşfet skorlaması.
 */
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyMessagesService } from "../../src/modules/company-messages/company-messages.service";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

let codeSeq = 100;
async function giveRothernId(companyId: string): Promise<string> {
  const code = `TEST-${String(codeSeq++).padStart(4, "0")}`;
  await prisma.company.update({
    where: { id: companyId },
    data: { rothernId: code },
  });
  return code;
}

function rig() {
  const blocks = new CompanyBlocksService(prisma as never);
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = {
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  };
  const service = new CompanyConnectionsService(
    prisma as never,
    blocks,
    email as never,
    config as never,
    notifications as never,
  );
  const messages = new CompanyMessagesService(prisma as never, blocks);
  return { service, blocks, messages, email, notifications };
}

/** İki PAKET firma + rothernId'ler. */
async function twoCompanies() {
  const a = await makeCompanyWithUser(prisma, { tier: "PAKET" });
  const b = await makeCompanyWithUser(prisma, { tier: "PAKET" });
  const aCode = await giveRothernId(a.company.id);
  const bCode = await giveRothernId(b.company.id);
  return { a, b, aCode, bCode };
}

describe("bağlantı yaşam döngüsü", () => {
  it("davet → gelen/giden listeler → kabul → aktif; davet edene bildirim gider", async () => {
    const { service, notifications } = rig();
    const { a, b, bCode } = await twoCompanies();

    const res = await service.invite(a.auth, bCode);
    expect(res.status).toBe("PENDING");
    // Hedefe istek bildirimi.
    expect(notifications.pushToCompany).toHaveBeenCalledWith(
      b.company.id,
      expect.objectContaining({ type: "connection_request" }),
    );

    // Giden (a) / gelen (b) listeleri.
    const outgoing = await service.listOutgoing(a.company.id);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]!.company.id).toBe(b.company.id);
    const incoming = await service.listIncoming(b.company.id);
    expect(incoming).toHaveLength(1);

    await service.accept(b.auth, res.id);
    expect(notifications.pushToCompany).toHaveBeenCalledWith(
      a.company.id,
      expect.objectContaining({ type: "connection_accepted" }),
    );

    const aList = await service.list(a.company.id);
    const bList = await service.list(b.company.id);
    expect(aList.map((c) => c.company.id)).toEqual([b.company.id]);
    expect(bList.map((c) => c.company.id)).toEqual([a.company.id]);
    expect(await service.listOutgoing(a.company.id)).toHaveLength(0);
  });

  it("T2 (INV-TIER-1): inviter üyeliği dolunca bağlantı listede PASİF (CL:connectedCompanyIds birebir)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const res = await service.invite(a.auth, bCode);
    await service.accept(b.auth, res.id);
    expect(await service.list(a.company.id)).toHaveLength(1);
    expect(await service.list(b.company.id)).toHaveLength(1);
    // Daveti KURAN taraf (inviter = a) üyeliği doldu → efektif STANDARD.
    await prisma.company.update({
      where: { id: a.company.id },
      data: { tier: "PAKET", membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    // Ham tier hâlâ PAKET; eskiden bağlantı aktif görünüyordu (CL ile ıraksama).
    // Artık efektif STANDARD → iki listede de pasif.
    expect(await service.list(a.company.id)).toHaveLength(0);
    expect(await service.list(b.company.id)).toHaveLength(0);
  });

  it("reddet kaydı siler; tekrar davet edilebilir", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const res = await service.invite(a.auth, bCode);
    await service.reject(b.auth, res.id);
    expect(await service.listIncoming(b.company.id)).toHaveLength(0);
    // Tekrar davet OK.
    await expect(service.invite(a.auth, bCode)).resolves.toMatchObject({
      status: "PENDING",
    });
  });

  it("gönderen bekleyen isteğini geri çekebilir (disconnect)", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const res = await service.invite(a.auth, bCode);
    await service.disconnect(a.auth, res.id);
    expect(await service.listIncoming(b.company.id)).toHaveLength(0);
  });

  it("mükerrer davet + kendine davet + ters yön çakışması reddedilir", async () => {
    const { service } = rig();
    const { a, b, aCode, bCode } = await twoCompanies();
    await service.invite(a.auth, bCode);

    await expect(service.invite(a.auth, bCode)).rejects.toThrow(
      /zaten istek gönderdiniz/i,
    );
    await expect(service.invite(a.auth, aCode)).rejects.toThrow(
      /kendinize/i,
    );
    // b, a'ya istek atmaya kalkarsa: "zaten size istek göndermiş".
    await expect(service.invite(b.auth, aCode)).rejects.toThrow(
      /size zaten istek göndermiş/i,
    );
  });

  it("IDOR: üçüncü firma başkasının davetini kabul/ret/geri-çek edemez", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const evil = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const res = await service.invite(a.auth, bCode);

    await expect(service.accept(evil.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );
    await expect(service.reject(evil.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );
    await expect(service.disconnect(evil.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );
    // GÖNDEREN de "gelen" uçlarını kullanamaz (yalnız hedef kabul eder).
    await expect(service.accept(a.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );
  });

  it("STANDARD firma Rothern ID ile davet gönderemez (premium kapısı)", async () => {
    const { service } = rig();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    const { bCode } = await twoCompanies();
    await expect(service.invite(std.auth, bCode)).rejects.toThrow(
      /premium/i,
    );
  });
});

describe("yarış durumları", () => {
  it("accept ile reject yarışı: karar atomik — kabul sonrası reject 'zaten yanıtlanmış'", async () => {
    const { service } = rig();
    const { a, b, bCode } = await twoCompanies();
    const res = await service.invite(a.auth, bCode);

    await service.accept(b.auth, res.id);
    await expect(service.reject(b.auth, res.id)).rejects.toThrow(
      /zaten yanıtlanmış/i,
    );
    // Bağlantı ACTIVE olarak duruyor (silinmedi).
    const conn = await prisma.companyConnection.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(conn.status).toBe("ACTIVE");
  });

  it("çapraz PENDING (A→B ve B→A) — kabul anında ters istek temizlenir", async () => {
    const { service } = rig();
    const { a, b, bCode, aCode } = await twoCompanies();
    const r1 = await service.invite(a.auth, bCode);
    // Yarışı simüle et: ters yönlü ikinci PENDING'i doğrudan yaz
    // (createRequest normalde engeller; eşzamanlı istekte oluşabilir).
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: b.company.id,
        inviteeCompanyId: a.company.id,
        invitedById: b.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });

    await service.accept(b.auth, r1.id);

    const remaining = await prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: a.company.id, inviteeCompanyId: b.company.id },
          { inviterCompanyId: b.company.id, inviteeCompanyId: a.company.id },
        ],
      },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.status).toBe("ACTIVE");
    // Listelerde mükerrer yok.
    expect(await service.list(a.company.id)).toHaveLength(1);
    expect(await service.listIncoming(a.company.id)).toHaveLength(0);
    void aCode;
  });
});

describe("engelleme etkileri", () => {
  it("engel: bağlantı silinir, istek atılamaz, keşif/aramada görünmez", async () => {
    const { service, blocks } = rig();
    const { a, b, bCode } = await twoCompanies();
    const res = await service.invite(a.auth, bCode);
    await service.accept(b.auth, res.id);

    await blocks.block(a.auth, bCode, "Sahte teklifler");
    // Bağlantı silindi + gerekçe kayda geçti.
    expect(await service.list(a.company.id)).toHaveLength(0);
    const blk = await prisma.companyBlock.findFirstOrThrow({
      where: { blockerCompanyId: a.company.id, blockedCompanyId: b.company.id },
    });
    expect(blk.reason).toBe("Sahte teklifler");

    // İstek iki yönde de atılamaz (karşılıklı görünmezlik).
    await expect(service.invite(a.auth, bCode)).rejects.toThrow(/bulunamadı/i);
    const aCode2 = (await prisma.company.findUniqueOrThrow({
      where: { id: a.company.id },
      select: { rothernId: true },
    })).rothernId!;
    await expect(service.invite(b.auth, aCode2)).rejects.toThrow(
      /bulunamadı/i,
    );
  });

  it("engellenen firma mesaj GÖNDEREMEZ (iki yön)", async () => {
    const { blocks, messages } = rig();
    const { a, b, bCode } = await twoCompanies();
    await blocks.block(a.auth, bCode);

    // Engellenen (b) → engelleyene mesaj atamaz.
    await expect(
      messages.send(b.auth, "satis", a.company.id, "merhaba"),
    ).rejects.toThrow(/bulunamadı/i);
    // Engelleyen (a) da karşıya mesaj atamaz (ilişki tamamen kapalı).
    await expect(
      messages.send(a.auth, "satinalma", b.company.id, "merhaba"),
    ).rejects.toThrow(/bulunamadı/i);
    // İlişkisiz üçüncü firmayla mesajlaşma çalışmaya devam eder.
    const c = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await expect(
      messages.send(a.auth, "satinalma", c.company.id, "merhaba"),
    ).resolves.toMatchObject({ mine: true });
  });
});

describe("e-posta daveti + referral", () => {
  it("kayıtlı firmaya e-posta → doğrudan bağlantı isteği", async () => {
    const { service } = rig();
    const { a, b } = await twoCompanies();
    const res = await service.inviteByEmail(a.auth, b.user.email);
    expect(res.kind).toBe("request");
    expect(await service.listIncoming(b.company.id)).toHaveLength(1);
  });

  it("kayıtsız e-posta → referral daveti + kayıt linkli e-posta; iptal edilebilir", async () => {
    const { service, email } = rig();
    const { a } = await twoCompanies();
    const res = await service.inviteByEmail(a.auth, "yeni@firma.com");
    expect(res.kind).toBe("invited");

    const call = email.send.mock.calls.at(-1)?.[0] as {
      templateData: { data: { registerUrl: string } };
    };
    expect(call.templateData.data.registerUrl).toContain("/company/kayit?ref=");

    const list = await service.listReferralInvites(a.company.id);
    expect(list).toHaveLength(1);

    // IDOR: başka firma iptal edemez.
    const other = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await expect(
      service.cancelReferralInvite(other.auth, list[0]!.id),
    ).rejects.toThrow(/bulunamadı/i);

    await service.cancelReferralInvite(a.auth, list[0]!.id);
    expect(await service.listReferralInvites(a.company.id)).toHaveLength(0);
  });

  it("pasif firmanın kullanıcı e-postası → anlamlı hata (boşa referral maili gitmez)", async () => {
    const { service, email } = rig();
    const { a, b } = await twoCompanies();
    await prisma.company.update({
      where: { id: b.company.id },
      data: { isActive: false },
    });
    await expect(
      service.inviteByEmail(a.auth, b.user.email),
    ).rejects.toThrow(/aktif değil/i);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("toplu e-posta daveti", () => {
  it("karışık liste: kayıtlı→istek, kayıtsız→davet, mükerrer/kendi/bağlı→atlanır", async () => {
    const { service, email } = rig();
    const { a, b, bCode } = await twoCompanies();
    // a ile c zaten bağlı olsun.
    const c = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await giveRothernId(c.company.id);
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.company.id,
        inviteeCompanyId: c.company.id,
        invitedById: a.user.id,
        status: "ACTIVE",
        origin: "INVITE",
        decidedAt: new Date(),
      },
    });

    const res = await service.inviteByEmailBatch(a.auth, [
      b.user.email, // kayıtlı → istek
      "YENI@firma.com", // kayıtsız → davet (normalize edilir)
      "yeni@firma.com", // mükerrer → tek işlenir
      a.user.email, // kendi firması → atlanır
      c.user.email, // zaten bağlı → atlanır
    ]);

    expect(res.summary).toEqual({ request: 1, invited: 1, skipped: 2 });
    const byEmail = new Map(res.results.map((r) => [r.email, r]));
    expect(byEmail.get(b.user.email)?.status).toBe("request");
    expect(byEmail.get("yeni@firma.com")?.status).toBe("invited");
    expect(byEmail.get(a.user.email)?.status).toBe("skipped");
    expect(byEmail.get(c.user.email)?.status).toBe("skipped");
    expect(byEmail.get(c.user.email)?.reason).toMatch(/zaten bağlısınız/i);
    // Mükerrer tek satır — toplam 4 sonuç.
    expect(res.results).toHaveLength(4);
    // Kayıtsız adrese referral e-postası gitti (kayıtlıya ayrıca bağlantı-isteği
    // e-postası düşer — sayı yerine referral çağrısının varlığını doğrula).
    expect(
      email.send.mock.calls.some(
        (c) =>
          (c[0] as { templateData?: { template?: string } })?.templateData
            ?.template === "referral_invite",
      ),
    ).toBe(true);
    // Kayıtlıya istek düştü.
    expect(await service.listIncoming(b.company.id)).toHaveLength(1);
    void bCode;
  });
});

describe("keşfet + profil", () => {
  it("discover: kategori kesişimine göre skorlar; bağlı/engelli/kendisi hariç", async () => {
    const { service, blocks } = rig();
    const me = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await giveRothernId(me.company.id);
    await prisma.company.update({
      where: { id: me.company.id },
      data: { buyerCategoryIds: ["10000000", "20000000"], sellerCategoryIds: [] },
    });

    // Eşleşen satıcı (2 kategori) — PAKET.
    const match = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await prisma.company.update({
      where: { id: match.company.id },
      data: { sellerCategoryIds: ["10000000", "20000000"] },
    });
    // Eşleşmeyen PAKET.
    const noMatch = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    // STANDARD — keşifte görünmez.
    await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    // Engellenen PAKET.
    const blocked = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const blockedCode = await giveRothernId(blocked.company.id);
    await blocks.block(me.auth, blockedCode);

    const res = await service.discover(me.auth);
    expect(res.locked).toBe(false);
    const ids = res.companies.map((c) => c.id);
    expect(ids).toContain(match.company.id);
    expect(ids).toContain(noMatch.company.id);
    expect(ids).not.toContain(blocked.company.id);
    expect(ids).not.toContain(me.company.id);
    expect(res.companies[0]!.id).toBe(match.company.id);
    expect(res.companies[0]!.matchScore).toBe(2);

    // STANDARD firma için kilitli.
    const std = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    expect((await service.discover(std.auth)).locked).toBe(true);
  });

  it("profil: bağlı değilken yalnız PUBLIC ihaleler; engellenene profil kapalı", async () => {
    const { service, blocks } = rig();
    const { a, b, bCode } = await twoCompanies();
    await prisma.company.update({
      where: { id: b.company.id },
      data: { publicEnabled: true },
    });
    await prisma.listing.createMany({
      data: [
        {
          companyId: b.company.id,
          createdById: b.user.id,
          type: "SATIS",
          title: "Public ilan",
          status: "OPEN",
          visibility: "PUBLIC",
        },
        {
          companyId: b.company.id,
          createdById: b.user.id,
          type: "SATIS",
          title: "Bağlantılara özel",
          status: "OPEN",
          visibility: "CONNECTIONS",
        },
      ],
    });

    const before = await service.getProfile(a.auth, bCode);
    expect(before.connectionStatus).toBe("none");
    expect(before.listings.map((l) => l.title)).toEqual(["Public ilan"]);

    // Bağlan → hepsi görünür.
    const res = await service.invite(a.auth, bCode);
    await service.accept(b.auth, res.id);
    const after = await service.getProfile(a.auth, bCode);
    expect(after.connectionStatus).toBe("active");
    expect(after.listings).toHaveLength(2);

    // Engel → profil bulunamaz.
    await blocks.block(b.auth, (await service.getSelf(a.auth)).rothernId!);
    await expect(service.getProfile(a.auth, bCode)).rejects.toThrow(
      /bulunamadı/i,
    );
  });
});

describe("STANDARD premium kapıları — davet + dizin", () => {
  it("STANDARD e-posta ile davet gönderemez (tekli + toplu)", async () => {
    const { service } = rig();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    await expect(
      service.inviteByEmail(std.auth, "biri@firma.com"),
    ).rejects.toThrow(/premium/i);
    await expect(
      service.inviteByEmailBatch(std.auth, ["biri@firma.com"]),
    ).rejects.toThrow(/premium/i);
  });

  it("STANDARD firma dizininde arama yapamaz — boş döner", async () => {
    const { service } = rig();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    // Aranabilir public bir PAKET firma olsa bile STANDARD boş alır.
    const target = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await giveRothernId(target.company.id);
    await prisma.company.update({
      where: { id: target.company.id },
      data: { publicEnabled: true },
    });
    expect(await service.searchCompanies(std.auth)).toEqual([]);
  });

  it("STANDARD yalnız ilişkili firmanın profilini görür — yabancı 404, bağlı OK", async () => {
    const { service } = rig();
    const std = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    const other = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const otherCode = await giveRothernId(other.company.id);
    await prisma.company.update({
      where: { id: other.company.id },
      data: { publicEnabled: true },
    });

    // İlişkisiz → 404 (varlığı sızdırmaz).
    await expect(service.getProfile(std.auth, otherCode)).rejects.toThrow(
      /bulunamadı/i,
    );

    // Bağlantı kurulunca görebilir (tedarikçi olarak kabul ettiği alıcı).
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: other.company.id,
        inviteeCompanyId: std.company.id,
        invitedById: other.user.id,
        status: "ACTIVE",
        origin: "INVITE",
        decidedAt: new Date(),
      },
    });
    const prof = await service.getProfile(std.auth, otherCode);
    expect(prof.connectionStatus).toBe("active");
  });

  it("STANDARD HEDEF firma yalnız bağlantılarına görünür — PAKET izleyen bağlı değilse 404", async () => {
    const { service } = rig();
    const viewer = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const target = await makeCompanyWithUser(prisma, { tier: "STANDARD" });
    const targetCode = await giveRothernId(target.company.id);
    // publicEnabled açık olsa bile STANDARD firma dizinde/dışarıda görünmez.
    await prisma.company.update({
      where: { id: target.company.id },
      data: { publicEnabled: true },
    });

    await expect(service.getProfile(viewer.auth, targetCode)).rejects.toThrow(
      /bulunamadı/i,
    );

    // Bağlanınca görebilir (STANDARD firma yalnız bağlantılarına görünür).
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: viewer.company.id,
        inviteeCompanyId: target.company.id,
        invitedById: viewer.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
        decidedAt: new Date(),
      },
    });
    const prof = await service.getProfile(viewer.auth, targetCode);
    expect(prof.connectionStatus).toBe("active");
  });
});

describe("bağlantı dayanıklılığı — kuran taraf premium kaldıkça aktif", () => {
  /** ACTIVE bağlantı kur (kuran = inviter). */
  async function connect(
    inviter: { company: { id: string }; user: { id: string } },
    invitee: { company: { id: string } },
    origin: "PREMIUM" | "INVITE",
  ) {
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: inviter.company.id,
        inviteeCompanyId: invitee.company.id,
        invitedById: inviter.user.id,
        status: "ACTIVE",
        origin,
        decidedAt: new Date(),
      },
    });
  }

  it("INVITE: KURAN taraf STANDARD'a düşünce iki tarafta da pasifleşir (bedava ağ tutulamaz)", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const b = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await connect(a, b, "INVITE"); // kuran = A

    expect(await service.list(a.company.id)).toHaveLength(1);
    expect(await service.list(b.company.id)).toHaveLength(1);

    // A (kuran) premium'u bırakır → kendi kurduğu bağlantı düşer.
    await prisma.company.update({
      where: { id: a.company.id },
      data: { tier: "STANDARD" },
    });
    expect(await service.list(a.company.id)).toHaveLength(0);
    expect(await service.list(b.company.id)).toHaveLength(0);
  });

  it("KABUL EDEN taraf STANDARD'a düşse de aktif kalır (kuran hâlâ premium)", async () => {
    const { service } = rig();
    const inviter = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    const invitee = await makeCompanyWithUser(prisma, { tier: "PAKET" });
    await connect(inviter, invitee, "PREMIUM"); // kuran = inviter

    // Kabul eden (tedarikçi) STANDARD'a düşer — kuran premium kaldıkça bağlı kalır.
    await prisma.company.update({
      where: { id: invitee.company.id },
      data: { tier: "STANDARD" },
    });
    expect(await service.list(inviter.company.id)).toHaveLength(1);
    expect(await service.list(invitee.company.id)).toHaveLength(1);
  });
});
