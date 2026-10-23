// @vitest-environment jsdom
/**
 * E-POSTAYLA DAVET EDİLENLER — talep sayfasının sahip görünümündeki kalıcı
 * bölüm (canlı doğrulama 2026-10-09, D3 / AI-UI-1).
 *
 * D3: elle pencereden gönderilen e-posta daveti kapanınca hiçbir yerde
 * görünmüyordu. AI-UI-1: otomatik turun e-posta davetlileri yalnız durum
 * bandındaydı, "Gizle" denince kayboluyordu. Bölüm talebin TÜM e-posta
 * davetlerini durumlarıyla listeler; etiketler durum bandıyla tek kaynaktan.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { createTranslator } from "use-intl/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn() } }));

import { ListingEmailInvites } from "../listing-email-invites";
import type { ListingEmailInvite } from "@/hooks/use-listing-email-invites";

const invite = (id: string, extra: Partial<ListingEmailInvite> = {}): ListingEmailInvite => ({
  id,
  email: `${id}@firma.com`,
  name: null,
  country: null,
  locale: "tr",
  source: "AI_FORM",
  invite: "INVITED",
  reason: null,
  sendAfter: null,
  sentAt: null,
  createdAt: "2026-10-09T08:00:00.000Z",
  ...extra,
});

const ITEMS = [
  // Elle pencereden davet (D3): ad keşif adaylarından biliniyor, e-posta gitti.
  invite("sales", { email: "sales@tubacex.com", name: "Tubacex SA", country: "ES", source: "AI_FORM", invite: "INVITED", sentAt: "2026-10-09T08:05:00.000Z" }),
  // Otomatik turun sıraya aldığı davet (AI-UI-1): planlanan gönderim anı.
  invite("q1", { name: "Schrauben GmbH", country: "DE", source: "AI_AUTO", invite: "QUEUED", sendAfter: "2026-10-12T06:00:00.000Z" }),
  // Adı bilinmeyen (elle yazılmış) adres + düşmüş davet nedeni.
  invite("x", { email: "satinalma@uzun-alan-adli-tedarikci-firma.com.tr", source: "MANUAL", invite: "NOT_SENT", reason: "FREQUENCY" }),
  // Kutu kapatılınca iptal edilen otomatik davet.
  invite("c", { name: "Viti Srl", country: "IT", source: "AI_AUTO", invite: "NOT_SENT", reason: "CANCELLED" }),
];

function setup(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { ...view, qc, rerenderUi: (next: React.ReactElement) => view.rerender(<QueryClientProvider client={qc}>{next}</QueryClientProvider>) };
}

const row = (text: string) => screen.getByText(text).closest("li")!;

beforeEach(() => {
  h.get.mockReset();
});

describe("ListingEmailInvites — E-postayla davet edilenler", () => {
  it("talebin e-posta davetlerini sayısıyla listeler: ad + adres (ad yoksa yalnız adres), ülke, nasıl davet edildi, durum + neden, sıradaysa planlanan gönderim", async () => {
    h.get.mockResolvedValue({ data: { items: ITEMS } });
    setup(<ListingEmailInvites listingId="l1" />);

    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (4)" })).toBeInTheDocument();
    // Sözleşme: uç + sorgu parametresi; hata bölümün kendi satırında (toast yok).
    expect(h.get).toHaveBeenCalledWith("/company/connections/external-tender-invites", {
      params: { listingId: "l1" },
      skipErrorToast: true,
    });

    // Elle davet: ad biliniyor → ad + altında davetin gittiği adres (R7), ülke bayrak + ad.
    const manual = row("Tubacex SA");
    expect(within(manual).getByText("sales@tubacex.com")).toBeInTheDocument();
    expect(within(manual).getByText("İspanya")).toBeInTheDocument();
    expect(within(manual).getByText("Elle davet")).toBeInTheDocument();
    expect(within(manual).getByText("Davet edildi")).toBeInTheDocument();

    // Otomatik tur: sırada + planlanan gönderim (İstanbul duvar saati).
    const queued = row("Schrauben GmbH");
    expect(within(queued).getByText("Almanya")).toBeInTheDocument();
    expect(within(queued).getByText("AI daveti")).toBeInTheDocument();
    expect(within(queued).getByText("Davet sırada")).toBeInTheDocument();
    expect(within(queued).getByText("Planlanan gönderim: 12 Eki 2026 09:00")).toBeInTheDocument();

    // Adı bilinmeyen adres: adresin kendisi; gönderilmedi + NEDEN (durum bandıyla aynı metin).
    const unnamed = row("satinalma@uzun-alan-adli-tedarikci-firma.com.tr");
    expect(within(unnamed).getByText("Elle davet")).toBeInTheDocument();
    expect(within(unnamed).getByText("Gönderilmedi")).toBeInTheDocument();
    expect(within(unnamed).getByText("Adres bu hafta başka bir davet aldı; talep kapanmadan sıra gelmedi")).toBeInTheDocument();

    expect(within(row("Viti Srl")).getByText("Davet iptal edildi")).toBeInTheDocument();
    // Yalnız sıradaki satır gönderim anı taşır.
    expect(screen.getAllByText(/Planlanan gönderim/)).toHaveLength(1);
    // Sunucu sırası (en yeni önce) korunur.
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent)).toEqual([
      "Tubacex SA",
      "Schrauben GmbH",
      "satinalma@uzun-alan-adli-tedarikci-firma.com.tr",
      "Viti Srl",
    ]);
  });

  it("R7: aynı firmanın iki posta kutusu ayırt edilir — her satır adın altında davetin gittiği ADRESİ yazar; adı olmayan satırda adres bir kez", async () => {
    h.get.mockResolvedValue({
      data: {
        items: [
          invite("uk", { email: "uk@raccortubi.com", name: "Raccortubi S.p.A.", country: "IT" }),
          invite("export", { email: "export@raccortubi.com", name: "Raccortubi S.p.A.", country: "IT", invite: "QUEUED" }),
          // Ad yok → yalnız adres (ikinci satır yok).
          invite("x", { email: "satinalma@adsiz.com", name: "  " }),
          // Ad yerine adres kaydedilmişse adres iki kez yazılmaz.
          invite("y", { email: "info@ayni.com", name: "Info@Ayni.com" }),
        ],
      },
    });
    setup(<ListingEmailInvites listingId="l1" />);
    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (4)" })).toBeInTheDocument();

    // İki satır aynı adı taşır; hangisinin hangi adrese gittiği okunur.
    expect(screen.getAllByText("Raccortubi S.p.A.")).toHaveLength(2);
    const uk = row("uk@raccortubi.com");
    const exp = row("export@raccortubi.com");
    expect(uk).not.toBe(exp);
    expect(within(uk).getByText("Raccortubi S.p.A.")).toBeInTheDocument();
    expect(within(uk).getByText("Davet edildi")).toBeInTheDocument();
    expect(within(exp).getByText("Davet sırada")).toBeInTheDocument();
    // Ad birinci satırda (vurgulu), adres hemen altında, ikisi aynı sütunda.
    const name = within(uk).getByText("Raccortubi S.p.A.");
    const address = within(uk).getByText("uk@raccortubi.com");
    expect(name.nextElementSibling).toBe(address);
    expect(name.className).toContain("font-medium");
    // Adres tek sözcüktür: dar ekranda satırı genişletmez, kırpılmaz.
    expect(address.className).toContain("[overflow-wrap:anywhere]");
    expect(address.className).not.toMatch(/\b(truncate|whitespace-nowrap)\b/);

    expect(screen.getAllByText("satinalma@adsiz.com")).toHaveLength(1);
    expect(screen.getAllByText(/info@ayni\.com/i)).toHaveLength(1);
  });

  it("hiç e-posta daveti yoksa bölüm çizilmez", async () => {
    h.get.mockResolvedValue({ data: { items: [] } });
    const { container } = setup(<ListingEmailInvites listingId="l1" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it("yüklenirken 'yok' gibi görünmez: başlık + yükleniyor satırı", async () => {
    let resolve!: (v: unknown) => void;
    h.get.mockReturnValue(new Promise((r) => (resolve = r)));
    setup(<ListingEmailInvites listingId="l1" />);
    expect(screen.getByRole("heading", { name: "E-postayla davet edilenler" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Davet e-postaları yükleniyor…");
    resolve({ data: { items: [ITEMS[0]] } });
    expect(await screen.findByText("Tubacex SA")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("okuma hatası 'davet yok' gibi görünmez: hata satırı + Tekrar dene yeniden okur", async () => {
    h.get.mockRejectedValueOnce(new Error("net"));
    setup(<ListingEmailInvites listingId="l1" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("E-postayla davet edilenler yüklenemedi.");
    h.get.mockResolvedValue({ data: { items: [ITEMS[0]] } });
    fireEvent.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Tubacex SA")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("izin yoksa (enabled=false) istek atılmaz, bölüm çizilmez", () => {
    const { container } = setup(<ListingEmailInvites listingId="l1" enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("D3: elle davet penceresi kapanınca liste yeniden okunur — az önce davet edilen adres görünür", async () => {
    h.get.mockResolvedValue({ data: { items: [] } });
    const view = setup(<ListingEmailInvites listingId="l1" inviteWindowOpen={false} />);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());

    // Pencere açılır (okuma yok), içinde davet gönderilir, kapanır.
    view.rerenderUi(<ListingEmailInvites listingId="l1" inviteWindowOpen />);
    expect(h.get).toHaveBeenCalledTimes(1);
    h.get.mockResolvedValue({ data: { items: [ITEMS[0]] } });
    view.rerenderUi(<ListingEmailInvites listingId="l1" inviteWindowOpen={false} />);

    expect(await screen.findByRole("heading", { name: "E-postayla davet edilenler (1)" })).toBeInTheDocument();
    expect(screen.getByText("Tubacex SA")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("tanınmayan kaynak / durum / neden ham kod basmaz", async () => {
    h.get.mockResolvedValue({
      data: {
        items: [
          invite("n", { name: "Yeni AŞ", source: "YENI_KAYNAK" as never, invite: "YENI_DURUM" as never, reason: "YENI_NEDEN" }),
        ],
      },
    });
    const { container } = setup(<ListingEmailInvites listingId="l1" />);
    const li = (await screen.findByText("Yeni AŞ")).closest("li")!;
    expect(within(li).getByText("Gönderilmedi")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/YENI_/);
    expect(within(li).queryByText("Elle davet")).not.toBeInTheDocument();
    expect(within(li).queryByText("AI daveti")).not.toBeInTheDocument();
  });

  it("390 px: satır sarar, uzun adres satırı genişletmez (kırpma / tek satır zorlaması yok)", async () => {
    h.get.mockResolvedValue({ data: { items: ITEMS } });
    setup(<ListingEmailInvites listingId="l1" />);
    const li = (await screen.findByText("satinalma@uzun-alan-adli-tedarikci-firma.com.tr")).closest("li")!;
    expect(li.className).toMatch(/\bflex-wrap\b/);
    const name = within(li).getByText("satinalma@uzun-alan-adli-tedarikci-firma.com.tr");
    expect(name.className).toContain("[overflow-wrap:anywhere]");
    expect(name.className).not.toMatch(/\b(truncate|whitespace-nowrap)\b/);
    expect(name.parentElement!.className).toMatch(/\bmin-w-0\b/);
    // Durum bloğu satırdan taşmaz; neden metni sarar.
    const status = within(li).getByText("Gönderilmedi").parentElement!;
    expect(status.className).toMatch(/\bmax-w-full\b/);
    expect(li.querySelector(".whitespace-nowrap")).toBeNull();
  });

  // N6: sayfanın en altında son satırın rozeti AI Asistan düğmesinin altında
  // kalıyordu (1440 px). R6-04: ilk düzeltme yalnız SON satırın rozetini içeri
  // çekiyordu (`pr-16 sm:pr-14`) — örtüşme olmayan telefonda da o rozet öteki
  // satırların sütunundan 64 px solda duruyordu.
  it("N6 / R6-04: hiçbir satırın durum rozeti içeri çekilmez (rozet sütunu her genişlikte hizalı); pay bölümün geniş ekrandaki alt boşluğudur", async () => {
    const outcomeOf = (text: string) => {
      const li = screen.getByText(text).closest("li")!;
      // Durum bloğu = rozet + neden / planlanan gönderim (`InviteOutcome` kökü).
      return li.lastElementChild as HTMLElement;
    };
    const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    const padsRight = (c: string) => /^(?:[a-z0-9]+:)*(?:pr|pe|px|p)-/.test(c);
    const NAMES = ["Tubacex SA", "Schrauben GmbH", "satinalma@uzun-alan-adli-tedarikci-firma.com.tr", "Viti Srl"];

    h.get.mockResolvedValue({ data: { items: ITEMS } });
    const view = setup(<ListingEmailInvites listingId="l1" className="mt-2" />);
    await screen.findByText("Tubacex SA");
    expect(within(outcomeOf("Viti Srl")).getByText("Davet iptal edildi")).toBeInTheDocument();
    for (const name of NAMES) {
      const own = classes(outcomeOf(name));
      // Sona yaslı, sağ pay yok — son satır dahil.
      expect(own, name).toContain("ml-auto");
      expect(own.filter(padsRight), name).toEqual([]);
      // Satırın kendisi de her satırda aynı kenar payını taşır.
      expect(classes(outcomeOf(name).closest("li")!), name).toEqual(classes(outcomeOf(NAMES[0]!).closest("li")!));
    }

    // Pay: bölüm (sayfanın son öğesi) YALNIZ geniş ekranda alt boşluk ekler;
    // telefonda / tablette kabuğun kendi boşluğu yeter, bölüm bir şey eklemez.
    const section = screen.getByRole("region", { name: "E-postayla davet edilenler (4)" });
    const bottom = classes(section).filter((c) => /(?:^|:)(?:pb|py|p)-/.test(c));
    expect(bottom).toEqual(["lg:pb-16"]);
    // Çağıranın sınıfı yerinde.
    expect(classes(section)).toContain("mt-2");
    view.unmount();

    // Tek satırlık liste: o satır sondur — yine içeri çekilmez.
    h.get.mockResolvedValue({ data: { items: [ITEMS[0]] } });
    setup(<ListingEmailInvites listingId="l1" />);
    await screen.findByText("Tubacex SA");
    expect(classes(outcomeOf("Tubacex SA")).filter(padsRight)).toEqual([]);
  });

  // Payın dayandığı ölçüler başka dosyalarda: biri değişirse pay yeniden hesaplanmalı.
  it("N6 geometrisi (kaynaktan): geniş ekranda kabuğun alt boşluğu + bölümün payı düğmenin tepesini aşar; dar ekranda kabuğun boşluğu tek başına yeter", () => {
    const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf-8");
    const px = (token: string | undefined) => Number(token) * 4;
    const shell = /id="icerik"\s+className="([^"]+)"/.exec(read("components/company-shell/shell.tsx"))?.[1].split(/\s+/) ?? [];
    const launcher = read("components/company-shell/assistant/assistant-launcher.tsx");
    const section = read("components/tenders/listing-email-invites.tsx");

    // Kabuk: taban `pb-24`; 1024 px'ten itibaren `lg:py-8` onu ezer.
    const shellBase = px(shell.find((c) => /^pb-\d+$/.test(c))?.slice(3));
    const shellWide = px(shell.find((c) => /^lg:p[by]-\d+$/.test(c))?.replace(/^lg:p[by]-/, ""));
    expect(shellBase).toBe(96);
    expect(shellWide).toBe(32);
    // Düğmenin (tam boy) tepesi: `bottom-8` + `h-14`; üzerine gelince 2 px kalkar.
    const full = /"bottom-(\d+) right-\d+ h-(\d+) w-\d+"/.exec(launcher);
    const fabTop = px(full?.[1]) + px(full?.[2]) + 2;
    expect(fabTop).toBe(90);
    const added = px(/PAGE_END_CLEARANCE_CLASS = "lg:pb-(\d+)"/.exec(section)?.[1]);
    expect(shellWide + added).toBeGreaterThanOrEqual(fabTop);
    expect(shellBase).toBeGreaterThanOrEqual(fabTop);
  });
});

describe("E-postayla davet edilenler — metinler üç dilde", () => {
  const tFor = (locale: "tr" | "en" | "ru", namespace: string) =>
    createTranslator({
      locale,
      messages: messagesFor(locale, WEB_NAMESPACES),
      namespace: namespace as never,
      onError: (e) => {
        throw e;
      },
    }) as unknown as (key: string, values?: Record<string, string | number>) => string;

  it.each(["tr", "en", "ru"] as const)("%s: bölümün bütün anahtarları dolu ve biçimlenir", (locale) => {
    const t = tFor(locale, "web.panel.requests.emailInvites");
    for (const key of ["heading", "lead", "sourceManual", "sourceAi", "loading", "error"]) expect(t(key).trim()).not.toBe("");
    expect(t("headingCount", { n: 23 })).toBe(`${t("heading")} (23)`);
    // Planlanan gönderim satırı durum sözlüğünde (bantla ortak).
    expect(tFor(locale, "web.panel.requests.aiSuppliers")("sendAfter", { date: "X" })).toMatch(/: X$/);
  });

  it("başlık ve kaynak etiketleri", () => {
    expect(tFor("tr", "web.panel.requests.emailInvites")("headingCount", { n: 2 })).toBe("E-postayla davet edilenler (2)");
    expect(tFor("en", "web.panel.requests.emailInvites")("headingCount", { n: 2 })).toBe("Invited by email (2)");
    expect(tFor("ru", "web.panel.requests.emailInvites")("headingCount", { n: 2 })).toBe("Приглашены по электронной почте (2)");
    expect(["tr", "en", "ru"].map((l) => tFor(l as "tr", "web.panel.requests.emailInvites")("sourceManual"))).toEqual([
      "Elle davet",
      "Invited by you",
      "Приглашено Вами",
    ]);
    expect(["tr", "en", "ru"].map((l) => tFor(l as "tr", "web.panel.requests.emailInvites")("sourceAi"))).toEqual([
      "AI daveti",
      "Invited by AI",
      "Приглашено ИИ",
    ]);
  });
});
