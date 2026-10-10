/**
 * AI DAVETİYLE GELEN TEDARİKÇİ = DAVETLİ TEDARİKÇİ (sahip kuralı 2026-10-10) — sözleşme.
 *
 * Sahip (aynen): "AI ile geldiğinde davet mantığı gibi olacak davet edilen
 * şirketin bağlantısı olacak eğer ücretsizse sadece o bağlantı kurduğu şirketin
 * isteklerine teklif verebilecek kural korunacak yani doğrulanmadığı durum için
 * söylüyorum"
 * Okunuşu: AI davetiyle gelen firma davet eden alıcının bağlantısı olur;
 * doğrulanmamışken ("ücretsiz") yalnız bağlantı kurduğu alıcının taleplerine —
 * ve her davetli gibi, davet edildiği talebin kendisine — teklif verir.
 *
 * "AI ile gelmek": AI'ın bulduğu adrese giden talep davetinin bağlantısıyla
 * kayıt olmak. Talep daveti `external_listing_invites` satırıdır (kaynak
 * `AI_AUTO` = yayın sonrası turun davet ettiği, `AI_FORM` = alıcının pencereden
 * seçtiği aday); bağlantının jetonu o satırın `company_referral_invites`
 * satırındadır (davet eden × adres).
 *
 *  (1) Davetin jetonuyla kayıt: yeni firma davet eden alıcının ACTIVE
 *      bağlantısı ve o talebin davetlisi olur.
 *  (2) Firma DOĞRULANMAMIŞKEN (UNVERIFIED · PENDING · REJECTED) davet edildiği
 *      talebe ve bağlantılı alıcının diğer taleplerine (herkese açık,
 *      bağlantılara açık) teklif verir; bağlantısı olmayan alıcının herkese açık
 *      talebine veremez (403, doğrulama istenir); bağlantılı alıcının davet
 *      edilmediği özel talebine veremez (404: o talep ona görünmez).
 *  (3) Aynı adresi ikinci bir alıcı da davet ettiyse: adres KANITLANINCA
 *      (e-posta doğrulaması) onun talep daveti de bağlanır, ama bağlantı yalnız
 *      PENDING istektir → ikinci alıcının diğer talepleri doğrulanmamış firmaya
 *      kapalı kalır.
 *  (4) Bağlantı kullanılmadan (jetonsuz) kayıt + davet edilen adresin
 *      doğrulanması: talep daveti bağlanır, bağlantı PENDING.
 *  (5) Doğrulanmış firma bunların hiçbiriyle kısıtlanmaz (ücretsiz dönem
 *      anahtarı açıkken doğrulama tek başına tam yetki verir — `effective-tier.ts`).
 *
 * ÜCRETSİZ DÖNEM (`FREE_PERIOD.VERIFIED_HAS_FULL_ACCESS`): firmalar bugünkü
 * hâlleriyle kurulur — tedarikçi gerçek kayıtla (saklı kademesi ücretsiz,
 * doğrulanmamış), alıcılar saklı kademesi ücretsiz + DOĞRULANMIŞ (`makeBuyer`).
 * Alıcının talep yayınlaması da, kurduğu bağlantının teklif kapısında sayılması
 * da (`isConnectionValid`) yalnız doğrulamadan gelir. Anahtar kapatılırsa (5)
 * ile birlikte alıcının yetkisine dayanan testler de — (2) ve satırları gerçek
 * yazıcıya yazdıran (1) — kırmızıya döner: kural o gün yeniden kararlaştırılır.
 *
 * Kuralın kopyası YOK, gerçek servisler koşar:
 *  - bağlama: `CompanyAuthService.signup` (jeton) ve `verifyEmail` (kanıtlanan adres);
 *  - teklif kapısı: `CompanyListingsService.placeBid`;
 *  - kimlik: `verifyEmail`in verdiği oturum + gerçek `CompanyJwtStrategy` (her
 *    istekte olduğu gibi efektif kademe ve doğrulama durumu veritabanından).
 * Sahte olanlar yalnız yan servisler: kimlik sağlayıcı (Supabase), e-posta
 * göndericisi, yapılandırma, oturum iptali sorgusu, kayıt ve bağlantı
 * servislerinin denetim kaydı / bildirimi ve teklif rig'inin (`make-service`)
 * engel listesi / onay / kur servisleri.
 *
 * Davet satırları `CompanyConnectionsService.inviteExternalForListing`in AI
 * kaynağıyla yazdığı biçimdedir (QUEUED; dağıtıcı gönderince SENT + `sentAt`).
 * Bir test satırları o metodun KENDİSİNE yazdırır: fikstür biçimi yazıcıdan
 * ayrışırsa orada görünür.
 */
import { ForbiddenException, HttpException } from "@nestjs/common";
import {
  CompanyJwtStrategy,
  type AuthenticatedCompanyUser,
  type CompanyJwtPayload,
} from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { extractCode, makeAuthService } from "./make-auth-service";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

const DAY = 24 * 3_600_000;
/** AI'ın bulduğu, davetlerin gittiği adres. */
const EMAIL = "satis@yenitedarik.com";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// ── Alıcılar, talepler, AI davet satırları ──────────────────────────────────

type Buyer = Awaited<ReturnType<typeof makeCompanyWithUser>>;
type OpenRequest = { id: string; title: string; itemId: string };

/**
 * Alıcı = ÜCRETSİZ DÖNEMİN alıcısı: saklı kademesi ücretsiz (kayıt STANDART
 * yazar, paket satışı kapalı), yetkisi yalnız firma doğrulamasından. Talebi
 * yayınlayabilmesi ve kurduğu bağlantının teklif kapısında sayılması
 * (`isConnectionValid`) buna bağlıdır. Fabrikanın varsayılanı (saklı GOLD) bu
 * zinciri atlar: alıcının doğrulaması düşse de bağlantı geçerli kalırdı.
 */
const makeBuyer = (label: string): Promise<Buyer> =>
  makeCompanyWithUser(prisma, { name: `Alıcı ${label}`, tier: "STANDART" });

/** Yayındaki talep + tek kalemi. Başlık benzersizdir: beklentiler başlıkla okunur. */
async function openRequest(
  buyer: Buyer,
  title: string,
  visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE",
  aiDiscovery = false,
): Promise<OpenRequest> {
  const listing = await makeListing(prisma, {
    companyId: buyer.company.id,
    createdById: buyer.user.id,
    title,
    status: "OPEN",
    visibility,
    aiDiscovery,
    publishedAt: new Date(),
    closesAt: new Date(Date.now() + 7 * DAY),
  });
  const item = await makeItem(prisma, listing.id);
  return { id: listing.id, title, itemId: item.id };
}

/**
 * Bir adrese gelmiş AI talep davetleri: kaynak × kuyruk durumu.
 *
 * `AI_AUTO` satırının talebi herkese açık + otomatik arama kutusu AÇIK olmalı:
 * özel talepteki ya da kutusu kapalı talepteki gönderilmemiş otomatik davet
 * geçersizdir ve hiç bağlanmaz (`AUTO_INVITE_OFF_WHERE`; sözleşmesi
 * `referral-signup.spec` "AI-1" + "A-1"). `AI_FORM` alıcının kendi seçimidir:
 * kutusu kapalı talepte de, özel talepte de bağlanır.
 */
const AI_INVITES = {
  "AI_AUTO, e-postası gitmiş": { source: "AI_AUTO", state: "SENT", visibility: "PUBLIC", aiDiscovery: true },
  "AI_AUTO, kuyrukta": { source: "AI_AUTO", state: "QUEUED", visibility: "PUBLIC", aiDiscovery: true },
  "AI_FORM, e-postası gitmiş, kutu kapalı": { source: "AI_FORM", state: "SENT", visibility: "PUBLIC", aiDiscovery: false },
  "AI_FORM, kuyrukta, özel talep, kutu kapalı": { source: "AI_FORM", state: "QUEUED", visibility: "PRIVATE", aiDiscovery: false },
} as const;
type AiInviteName = keyof typeof AI_INVITES;
const AI_INVITE_NAMES = Object.keys(AI_INVITES) as AiInviteName[];

/**
 * `email` adresini AI davetleriyle taleplerine çağırmış alıcı: bağlantı jetonu
 * (`token`) + dört talep daveti + adresin DAVET EDİLMEDİĞİ üç talep.
 * Alıcı doğrulanmış firmadır (talep yayınlayabilen tek firma; kurduğu bağlantı
 * da o sürece geçerlidir — `makeBuyer`).
 */
async function buyerInviting(label: string, email: string, token: string) {
  const buyer = await makeBuyer(label);
  const invited = {} as Record<AiInviteName, OpenRequest>;
  for (const name of AI_INVITE_NAMES) {
    const row = AI_INVITES[name];
    invited[name] = await openRequest(buyer, `${label} · davetli · ${name}`, row.visibility, row.aiDiscovery);
  }
  // Bağlantı jetonu davet eden × adres satırındadır; talep bağlamı ilk talepte yazılır.
  const referral = await prisma.companyReferralInvite.create({
    data: {
      inviterCompanyId: buyer.company.id,
      email,
      invitedById: buyer.user.id,
      listingId: invited[AI_INVITE_NAMES[0]].id,
      locale: "tr",
      token,
    },
  });
  for (const name of AI_INVITE_NAMES) {
    const row = AI_INVITES[name];
    const sent = row.state === "SENT";
    await prisma.externalListingInvite.create({
      data: {
        listingId: invited[name].id,
        inviterCompanyId: buyer.company.id,
        referralInviteId: referral.id,
        email,
        locale: "tr",
        source: row.source,
        state: row.state,
        // Kuyruktaki satır alıcının mesai saatini bekler; giden satır dün gitti.
        sendAfter: new Date(Date.now() + (sent ? -DAY : DAY)),
        sentAt: sent ? new Date(Date.now() - DAY) : null,
      },
    });
  }
  const other = {
    public: await openRequest(buyer, `${label} · davetsiz · herkese açık`, "PUBLIC"),
    connections: await openRequest(buyer, `${label} · davetsiz · bağlantılara açık`, "CONNECTIONS"),
    private: await openRequest(buyer, `${label} · davetsiz · özel`, "PRIVATE"),
  };
  return { ...buyer, invited, other };
}

/** Adresi hiç davet etmemiş, firmanın bağlantısı olmayan alıcı + herkese açık talebi. */
async function buyerNotInviting(label: string) {
  const buyer = await makeBuyer(label);
  return { ...buyer, public: await openRequest(buyer, `${label} · herkese açık`, "PUBLIC") };
}

// ── Geliş: gerçek kayıt + gerçek e-posta doğrulaması + gerçek kimlik ────────

/** Kimlik elle kurulmaz: gerçek JWT stratejisi, istekte olduğu gibi veritabanından üretir. */
const strategy = new CompanyJwtStrategy(
  { getOrThrow: () => "test-secret" } as never,
  prisma as never,
  { isRevoked: async () => false } as never,
);

/** Kayıt formunun gönderdiği gövde; `referralToken` davet bağlantısındaki `ref`. */
const signupDto = (email: string, referralToken?: string) =>
  ({
    firstName: "Ada",
    lastName: "Yılmaz",
    email,
    password: "Guclu!Parola9",
    termsAccepted: true,
    mediationAccepted: true,
    kvkkAccepted: true,
    ...(referralToken ? { referralToken } : {}),
  }) as never;

/** Adres kayıt olur: davet bağlantısıyla (`referralToken`) ya da bağlantısız. */
async function arrive(email: string, referralToken?: string) {
  const auth = makeAuthService();
  await auth.service.signup(signupDto(email, referralToken));
  const account = await prisma.companyUser.findUniqueOrThrow({ where: { email }, select: { companyId: true } });
  return {
    companyId: account.companyId,
    /**
     * Postayla gelen kodu girer: adres kanıtlanır, oturum açılır. Dönen işlev o
     * oturumla atılan bir isteğin kimliğidir — her çağrıda veritabanından taze.
     */
    async verifyEmail(): Promise<() => Promise<AuthenticatedCompanyUser>> {
      const session = (await auth.service.verifyEmail(email, extractCode(auth.email))) as { token: string };
      const payload = auth.jwt.verify<CompanyJwtPayload>(session.token);
      return () => strategy.validate(payload);
    },
  };
}

// ── Çağıranın gördüğü: bağlantı satırları, talep davetleri, teklifin sonucu ──

const ACTIVE = { status: "ACTIVE", origin: "INVITE" } as const;
const PENDING = { status: "PENDING", origin: "INVITE" } as const;

/** Firmanın davet EDİLEN taraf olduğu bağlantılar (alıcı → durum) + davetlisi olduğu talepler. */
async function boundTo(companyId: string) {
  const [connections, invitations] = await Promise.all([
    prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId },
      select: { inviterCompanyId: true, status: true, origin: true },
    }),
    prisma.listingInvitation.findMany({
      where: { invitedCompanyId: companyId },
      select: { listing: { select: { title: true } } },
    }),
  ]);
  return {
    connections: Object.fromEntries(
      connections.map((c) => [c.inviterCompanyId, { status: c.status, origin: c.origin }]),
    ),
    invitedTo: invitations.map((i) => i.listing.title).sort(),
  };
}

const titles = (...groups: OpenRequest[][]) => groups.flat().map((r) => r.title).sort();
const all = (invited: Record<AiInviteName, OpenRequest>) => Object.values(invited);

type Listings = ReturnType<typeof makeService>["service"];

const placeBid = (listings: Listings, me: AuthenticatedCompanyUser, request: OpenRequest) =>
  listings.placeBid(me, request.id, {
    amount: 100,
    currency: "TRY",
    deliveryTime: "W1_2",
    validityDays: 30,
    items: [{ itemId: request.itemId, unitPrice: 100 }],
  } as never);

const SUBMITTED = "SUBMITTED";
/** Görünmeyen talep: varlığı da söylenmez. */
const NOT_VISIBLE = "404 api.companyListings.ilanBulunamadi";
/** Doğrulama çağrısının mesaj anahtarı, firmanın doğrulama durumuna göre. */
const VERIFICATION_ASKED = {
  UNVERIFIED: "api.companyListings.teklifIcinDogrulamaGerekir",
  PENDING: "api.entitlement.verificationPending",
  REJECTED: "api.entitlement.verificationRejected",
} as const;
type NotVerified = keyof typeof VERIFICATION_ASKED;
const asksVerification = (status: NotVerified) => `403 ${VERIFICATION_ASKED[status]}`;
const submitted = (...groups: OpenRequest[][]) =>
  Object.fromEntries(groups.flat().map((r) => [r.title, SUBMITTED]));

/**
 * Her talebe bir teklif gönderir; talep başlığı → çağıranın gördüğü sonuç:
 * kabul edilen teklifin durumu ya da reddin "HTTP durumu + mesaj anahtarı".
 */
async function bidOnEach(listings: Listings, me: AuthenticatedCompanyUser, requests: OpenRequest[]) {
  const seen: Record<string, string> = {};
  for (const request of requests) {
    seen[request.title] = await placeBid(listings, me, request).then(
      (bid) => bid.status,
      (error: unknown) => {
        if (!(error instanceof HttpException)) throw error;
        return `${error.getStatus()} ${(error.getResponse() as { i18nKey?: string }).i18nKey}`;
      },
    );
  }
  return seen;
}

/** Firmanın yazılmış teklifleri: talep başlığı → durum (reddedilen teklif satır bırakmaz). */
async function bidsOf(companyId: string) {
  const rows = await prisma.listingBid.findMany({
    where: { bidderCompanyId: companyId },
    select: { status: true, listing: { select: { title: true } } },
  });
  return Object.fromEntries(rows.map((b) => [b.listing.title, b.status]));
}

describe("AI davetiyle gelen tedarikçi davetli tedarikçi gibi davranır (sahip kuralı 2026-10-10)", () => {
  it.each([
    ["davetin gittiği adresle", EMAIL],
    // AI çoğu kez genel kutuyu (satis@, info@) bulur; bağlantıyı açan kişi kendi adresiyle kaydolur.
    ["aynı bağlantıyla, başka bir adresle", "ada.yilmaz@yenitedarik.com"],
  ])(
    "(1) AI davetinin bağlantısıyla (jeton) kayıt, %s: davet eden alıcıyla bağlantı ACTIVE, jetonun taşıdığı talep davetlerinin hepsi bağlanır — AI_AUTO ve AI_FORM, kuyrukta ya da gitmiş; AI_FORM kutusu kapalı talepte de",
    async (_how, signupEmail) => {
      const a = await buyerInviting("A", EMAIL, "tok-ai-a");

      const supplier = await arrive(signupEmail, "tok-ai-a");

      // Karşılaştırma boş kümeyle yapılmıyor: kaynak × durum, dört davet satırı.
      expect(titles(all(a.invited))).toHaveLength(4);
      // Tam küme: adresin davet edilmediği taleplere davetli yazılmaz (onları açan bağlantıdır, (2)).
      expect(await boundTo(supplier.companyId)).toEqual({
        connections: { [a.company.id]: ACTIVE },
        invitedTo: titles(all(a.invited)),
      });
    },
  );

  it("(1) satırları gerçek yazıcı yazdığında da aynı (inviteExternalForListing: AI_AUTO turu + AI_FORM penceresi): jetonla kayıt → ACTIVE bağlantı + iki talebin davetlisi", async () => {
    const buyer = await makeBuyer("A");
    const byRound = await openRequest(buyer, "A · turun davet ettiği", "PUBLIC", true);
    const byWindow = await openRequest(buyer, "A · pencereden seçilen, özel talep, kutu kapalı", "PRIVATE");
    const connections = new CompanyConnectionsService(
      prisma as never,
      prisma as never,
      { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1), pushToUser: jest.fn().mockResolvedValue(1) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const buyerIdentity = await strategy.validate({
      sub: buyer.user.id,
      email: buyer.user.email,
      type: "company",
      userId: buyer.user.id,
      companyId: buyer.company.id,
      tv: 0,
    });
    await connections.inviteExternalForListing(buyerIdentity, byRound.id, [EMAIL], "AI_AUTO");
    await connections.inviteExternalForListing(buyerIdentity, byWindow.id, [EMAIL], "AI_FORM");

    // Yazıcının bıraktığı: kaynağıyla kuyrukta iki satır, ikisi de AYNI bağlantı jetonunda.
    const written = await prisma.externalListingInvite.findMany({
      where: { email: EMAIL },
      select: {
        source: true,
        state: true,
        listing: { select: { title: true } },
        referralInvite: { select: { token: true, status: true, inviterCompanyId: true } },
      },
    });
    expect(Object.fromEntries(written.map((w) => [w.listing.title, `${w.source} ${w.state}`]))).toEqual({
      [byRound.title]: "AI_AUTO QUEUED",
      [byWindow.title]: "AI_FORM QUEUED",
    });
    const links = [...new Set(written.map((w) => w.referralInvite.token))];
    expect(links).toHaveLength(1);
    expect(written[0].referralInvite).toMatchObject({ status: "PENDING", inviterCompanyId: buyer.company.id });

    const supplier = await arrive(EMAIL, links[0]);

    expect(await boundTo(supplier.companyId)).toEqual({
      connections: { [buyer.company.id]: ACTIVE },
      invitedTo: titles([byRound, byWindow]),
    });
  });

  it.each(["UNVERIFIED", "PENDING", "REJECTED"] as const)(
    "(2) firma doğrulanmamışken (%s): davet edildiği taleplere ve bağlantılı alıcının herkese açık / bağlantılara açık taleplerine teklif verir; bağlantısız alıcının herkese açık talebinde 403 + doğrulama istenir; bağlantılı alıcının davet edilmediği özel talebi kapalıdır",
    async (status) => {
      const a = await buyerInviting("A", EMAIL, "tok-ai-a");
      // Bağlantıyı teklif kapısında geçerli kılan alıcının DOĞRULAMASIDIR; saklı kademesi ücretsiz (`makeBuyer`).
      expect(a.company).toMatchObject({ tier: "STANDART", companyVerificationStatus: "VERIFIED" });
      const stranger = await buyerNotInviting("C");
      const supplier = await arrive(EMAIL, "tok-ai-a");
      const identity = await supplier.verifyEmail();
      // Kayıt UNVERIFIED doğar; PENDING = belgeler incelemede, REJECTED = başvuru reddedildi.
      await prisma.company.update({
        where: { id: supplier.companyId },
        data: { companyVerificationStatus: status },
      });
      const me = await identity();
      // Kısıtlı firma = doğrulanmamış firma (saklı kademesi ücretsiz).
      expect(me).toMatchObject({ companyId: supplier.companyId, companyVerificationStatus: status, tier: "STANDART" });
      const { service: listings } = makeService();

      const open = [...all(a.invited), a.other.public, a.other.connections];
      expect(await bidOnEach(listings, me, [...open, a.other.private, stranger.public])).toEqual({
        // Davet edildiği talepler (özel olanı yalnız davet açar) + bağlantının açtıkları.
        ...submitted(open),
        // Bağlantı özel talebi açmaz: davet gerekir.
        [a.other.private.title]: NOT_VISIBLE,
        // Bağlantısı olmayan alıcı: platform tanıştırıyor → doğrulama istenir.
        [stranger.public.title]: asksVerification(status),
      });

      // Reddin gövdesi doğrulamaya çağırır (durum + doğrulama sayfası).
      const refusal = await placeBid(listings, me, stranger.public).catch((e: unknown) => e);
      expect(refusal).toBeInstanceOf(ForbiddenException);
      expect((refusal as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        i18nKey: VERIFICATION_ASKED[status],
        verificationStatus: status,
        verifyPath: "/company/ayarlar/dogrulama",
      });
      // Reddedilen teklif yazılmadı; alıcının göreceği teklifler yalnız açık taleplerde.
      expect(await bidsOf(supplier.companyId)).toEqual(submitted(open));
      // E-posta doğrulaması kullanılan bağlantının ACTIVE bağlantısını düşürmedi.
      expect((await boundTo(supplier.companyId)).connections).toEqual({ [a.company.id]: ACTIVE });
    },
  );

  it("(3) aynı adresi ikinci bir alıcı da davet etti: adres kanıtlanınca (e-posta doğrulaması) onun talep davetleri de bağlanır ama bağlantı PENDING istektir — doğrulanmamış firma ikinci alıcıda yalnız davet edildiği taleplere teklif verir, diğer talepleri kapalı kalır", async () => {
    const a = await buyerInviting("A", EMAIL, "tok-ai-a");
    const b = await buyerInviting("B", EMAIL, "tok-ai-b");
    const supplier = await arrive(EMAIL, "tok-ai-a");

    // Adres henüz kanıtlanmadı: yalnız KULLANILAN bağlantının (A) daveti bağlı.
    expect(await boundTo(supplier.companyId)).toEqual({
      connections: { [a.company.id]: ACTIVE },
      invitedTo: titles(all(a.invited)),
    });

    const identity = await supplier.verifyEmail();

    expect(await boundTo(supplier.companyId)).toEqual({
      // Rıza yalnız tıklanan bağlantı için verildi: B kabul edilecek bir istek.
      connections: { [a.company.id]: ACTIVE, [b.company.id]: PENDING },
      invitedTo: titles(all(a.invited), all(b.invited)),
    });

    const me = await identity();
    const { service: listings } = makeService();
    expect(
      await bidOnEach(listings, me, [...all(b.invited), b.other.public, b.other.connections, b.other.private]),
    ).toEqual({
      // Talep daveti o talebi açar — bağlantı beklerken de.
      ...submitted(all(b.invited)),
      // PENDING istek bağlantı değildir: B'nin diğer talepleri kapalı.
      [b.other.public.title]: asksVerification("UNVERIFIED"),
      [b.other.connections.title]: NOT_VISIBLE,
      [b.other.private.title]: NOT_VISIBLE,
    });
    expect(await bidsOf(supplier.companyId)).toEqual(submitted(all(b.invited)));
  });

  it("(4) bağlantı kullanılmadan (jetonsuz) kayıt: kayıtta hiçbir şey bağlanmaz; davet edilen adres doğrulanınca talep davetleri bağlanır, bağlantı PENDING kalır — yalnız davet edildiği taleplere teklif verir", async () => {
    const a = await buyerInviting("A", EMAIL, "tok-ai-a");

    const supplier = await arrive(EMAIL);

    expect(await boundTo(supplier.companyId)).toEqual({ connections: {}, invitedTo: [] });

    const identity = await supplier.verifyEmail();

    expect(await boundTo(supplier.companyId)).toEqual({
      connections: { [a.company.id]: PENDING },
      invitedTo: titles(all(a.invited)),
    });

    const me = await identity();
    const { service: listings } = makeService();
    expect(await bidOnEach(listings, me, [...all(a.invited), a.other.public, a.other.connections])).toEqual({
      ...submitted(all(a.invited)),
      [a.other.public.title]: asksVerification("UNVERIFIED"),
      [a.other.connections.title]: NOT_VISIBLE,
    });
  });

  it("(5) doğrulanmış firma bunlarla kısıtlanmaz: bağlantısı olmayan alıcının ve bağlantısı PENDING alıcının herkese açık taleplerine teklif verir", async () => {
    await buyerInviting("A", EMAIL, "tok-ai-a");
    const b = await buyerInviting("B", EMAIL, "tok-ai-b");
    const stranger = await buyerNotInviting("C");
    const supplier = await arrive(EMAIL, "tok-ai-a");
    const identity = await supplier.verifyEmail();
    const { service: listings } = makeService();
    const elsewhere = [stranger.public, b.other.public];

    // Doğrulanmadan önce ikisi de kapalı (aynı firma, aynı talepler).
    expect(await bidOnEach(listings, await identity(), elsewhere)).toEqual({
      [stranger.public.title]: asksVerification("UNVERIFIED"),
      [b.other.public.title]: asksVerification("UNVERIFIED"),
    });

    // Tek değişen: firma doğrulandı (admin onayı).
    await prisma.company.update({
      where: { id: supplier.companyId },
      data: { companyVerificationStatus: "VERIFIED" },
    });
    const me = await identity();
    expect(me.companyVerificationStatus).toBe("VERIFIED");

    expect(await bidOnEach(listings, me, elsewhere)).toEqual(submitted(elsewhere));
    expect(await bidsOf(supplier.companyId)).toEqual(submitted(elsewhere));
  });
});
