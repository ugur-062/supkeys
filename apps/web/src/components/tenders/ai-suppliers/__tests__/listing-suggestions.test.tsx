// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { createTranslator } from "use-intl/core";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateOutcome, inviteCounts, ListingSuggestions, statusLeadKey } from "../listing-suggestions";
import { INVITE_REASON_KEYS } from "../invite-outcome";

/**
 * YAYIN SONRASI AI KEŞFİ — YALNIZ DURUM (2026-10-08, sahip: "kutu seçiliyse AI
 * arasın ve göndersin, bir daha sormasın"). Tur bulduğunu kendisi davet eder;
 * yayın paneli ve talep sayfası bandında seçilecek/onaylanacak/gönderilecek
 * hiçbir şey yok: aranıyor → kaç tedarikçi bulundu, kaçı davet edildi; açılır
 * listede ad, ülke ve sonuç (davet edildi / sırada / gönderilmedi + neden).
 *
 * Canlı doğrulama 2026-10-09: AI-UI-2 (başlık sıradaki e-postayı "davet
 * edildi" saymaz; bulundu · davet edildi · sırada · gönderilmedi, sıfır parça
 * yazılmaz, her sayı + ad tek ICU çoğul mesajında) ve AI-UI-1 (`?ai-davet=1`
 * "Gizle" ile kapatılmış bandı geri getirir).
 */
const h = vi.hoisted(() => ({
  data: undefined as unknown,
  exhausted: false,
  dismiss: vi.fn(),
}));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useListingDiscovery: () => ({ data: h.data, emptyPollExhausted: h.exhausted }),
  useDismissListingDiscovery: () => ({ mutate: h.dismiss, isPending: false }),
}));

const cand = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  email: `${id}@x.com`,
  website: null,
  city: null,
  country: "TR",
  reason: "r",
  matchedItems: [1],
  scope: "LOCAL",
  status: "INVITED",
  invite: "QUEUED",
  inviteReason: null,
  recentlyInvited: false,
  ...extra,
});

const run = (candidates: unknown[], extra: Record<string, unknown> = {}) => ({
  id: "r1",
  trigger: "PUBLISH",
  state: "DONE",
  createdAt: "",
  finishedAt: "",
  dismissedAt: null,
  candidates,
  ...extra,
});
const done = (candidates: unknown[], extra: Record<string, unknown> = {}) => ({
  aiDiscovery: true,
  listingStatus: "OPEN",
  runs: [run(candidates, extra)],
});

const MIXED = [
  cand("m1", "Bağlantı Elemanları AŞ", { email: null, memberCompanyId: "co1", invite: "INVITED", source: "PLATFORM" }),
  cand("a", "Cıvata AŞ"),
  cand("b", "Viti Srl", { country: "IT", scope: "ABROAD", invite: "INVITED" }),
  cand("c", "Schrauben GmbH", { country: "DE", status: "CONSENT_REQUIRED", invite: "NOT_SENT", inviteReason: "CONSENT_REQUIRED" }),
  cand("d", "Sınır AŞ", { status: "DAILY_LIMIT", invite: "NOT_SENT", inviteReason: "DAILY_LIMIT" }),
  cand("e", "Eski Ltd", { status: "ALREADY_INVITED", invite: "ALREADY_INVITED" }),
];

/** Bileşen tur bitince e-posta davet listesini tazeler → sorgu istemcisi ister. */
const qc = new QueryClient();
const Providers = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: Providers });

beforeEach(() => {
  h.dismiss.mockReset();
  h.exhausted = false;
});

describe("ListingSuggestions — yalnız durum", () => {
  it("bant: kaç tedarikçi bulundu, kaçı davet edildi, kaçı sırada, kaçına gönderilmedi; liste kapalı gelir", () => {
    h.data = done(MIXED);
    render(<ListingSuggestions listingId="l1" variant="band" />);
    const header = screen.getByText("6 tedarikçi bulundu");
    // Üye + e-postası giden = 2 davet edildi; sıradaki e-posta AYRI; zaten davetli hiçbirine girmez.
    expect(header).toHaveTextContent("6 tedarikçi bulundu · 2 davet edildi · 1 davet sırada · 2 gönderilmedi");
    expect(screen.queryByText("Cıvata AŞ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listeyi göster" })).toHaveAttribute("aria-expanded", "false");
  });

  it("AI-UI-2: 3 üye davetli + 20 e-posta SIRADA → başlık '23 davet edildi' DEMEZ (satırlar ve sonuç bildirimiyle aynı sayılar)", () => {
    h.data = done([
      ...Array.from({ length: 3 }, (_, i) => cand(`m${i}`, `Üye ${i}`, { email: null, memberCompanyId: `co${i}`, invite: "INVITED" })),
      ...Array.from({ length: 20 }, (_, i) => cand(`q${i}`, `Firma ${i}`, { invite: "QUEUED" })),
    ]);
    render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    const header = screen.getByText("23 tedarikçi bulundu");
    expect(header).toHaveTextContent("23 tedarikçi bulundu · 3 davet edildi · 20 davet sırada");
    expect(header).not.toHaveTextContent("23 davet edildi");
    // Sıfır olan parça yazılmaz.
    expect(header).not.toHaveTextContent(/gönderilmedi/);
    // Başlık satırlarla tutarlı: 20 satır "Davet sırada", 3 satır "Davet edildi".
    expect(screen.getAllByText("Davet sırada")).toHaveLength(20);
    expect(screen.getAllByText("Davet edildi")).toHaveLength(3);
  });

  it("AI-UI-2: sıfır parçalar yazılmaz — yalnız sırada / yalnız zaten davetli / yalnız gönderilmedi", () => {
    h.data = done([cand("a", "A"), cand("b", "B")]);
    const queued = render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText("2 tedarikçi bulundu").textContent).toBe("2 tedarikçi bulundu · 2 davet sırada");
    queued.unmount();

    h.data = done([cand("e", "Eski Ltd", { status: "ALREADY_INVITED", invite: "ALREADY_INVITED" })]);
    const already = render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText("1 tedarikçi bulundu").textContent).toBe("1 tedarikçi bulundu");
    already.unmount();

    h.data = done([cand("c", "C", { invite: "NOT_SENT", inviteReason: "PAUSED" })]);
    render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText("1 tedarikçi bulundu").textContent).toBe("1 tedarikçi bulundu · 1 gönderilmedi");
  });

  it("ONAYLANACAK BİR ŞEY YOK: seçim kutusu, 'davet gönder' düğmesi ya da 'tek tıkla davet' metni çizilmez (panel ve bant, liste açıkken de)", () => {
    h.data = done(MIXED);
    for (const variant of ["panel", "band"] as const) {
      const { unmount, container } = render(<ListingSuggestions listingId="l1" variant={variant} defaultOpen />);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /davet/i })).not.toBeInTheDocument();
      expect(container).not.toHaveTextContent(/tek tıkla|seçili geldi|istemediklerinizi/);
      expect(screen.getByText(/onaylamanız gereken bir şey yok/)).toBeInTheDocument();
      unmount();
    }
  });

  it("açılır liste: ad, ülke ve sonuç — davet edildi / davet sırada / zaten davetliydi / gönderilmedi + NEDEN", () => {
    h.data = done(MIXED);
    render(<ListingSuggestions listingId="l1" variant="band" />);
    fireEvent.click(screen.getByRole("button", { name: "Listeyi göster" }));
    const row = (name: string) => screen.getByText(name).closest("li")!;

    const member = row("Bağlantı Elemanları AŞ");
    expect(within(member).getByText("Rothern'de kayıtlı")).toBeInTheDocument();
    expect(within(member).getByText("Davet edildi")).toBeInTheDocument();
    expect(within(member).getByText("Türkiye")).toBeInTheDocument();

    expect(within(row("Cıvata AŞ")).getByText("Davet sırada")).toBeInTheDocument();
    expect(within(row("Viti Srl")).getByText("Davet edildi")).toBeInTheDocument();
    expect(within(row("Viti Srl")).getByText("İtalya")).toBeInTheDocument();
    expect(within(row("Eski Ltd")).getByText("Zaten davetliydi")).toBeInTheDocument();

    const consent = row("Schrauben GmbH");
    expect(within(consent).getByText("Gönderilmedi")).toBeInTheDocument();
    expect(within(consent).getByText("Bu ülkeye izinsiz davet gönderilmiyor")).toBeInTheDocument();
    expect(within(row("Sınır AŞ")).getByText("Günlük davet sınırınız doldu")).toBeInTheDocument();
    // Adres ekranda yazılmaz (yalnız ad + ülke + durum).
    expect(screen.queryByText("a@x.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Listeyi gizle" }));
    expect(screen.queryByText("Cıvata AŞ")).not.toBeInTheDocument();
  });

  it("gönderilmeme nedenleri okunur: staging alıcı listesi, çıkış, sıklık, hesabın davet edememesi; bilinmeyen kod yalnız 'Gönderilmedi' der", () => {
    h.data = done([
      cand("a", "A", { invite: "NOT_SENT", inviteReason: "ALLOWLIST" }),
      cand("b", "B", { invite: "NOT_SENT", inviteReason: "OPTED_OUT" }),
      cand("c", "C", { invite: "NOT_SENT", inviteReason: "FREQUENCY" }),
      cand("d", "D", { invite: "NOT_SENT", inviteReason: "NOT_ALLOWED" }),
      cand("e", "E", { invite: "NOT_SENT", inviteReason: "YENI_BIR_KOD" }),
    ]);
    render(<ListingSuggestions listingId="l1" variant="panel" defaultOpen />);
    expect(screen.getByText("Bu ortamda gönderilmedi (test alıcı listesi)")).toBeInTheDocument();
    expect(screen.getByText("Adres davet almak istemiyor")).toBeInTheDocument();
    expect(screen.getByText("Adres bu hafta başka bir davet aldı; talep kapanmadan sıra gelmedi")).toBeInTheDocument();
    expect(screen.getByText(/Hesabınız şu an davet gönderemiyor/)).toBeInTheDocument();
    expect(screen.getAllByText("Gönderilmedi")).toHaveLength(5);
    expect(screen.queryByText(/YENI_BIR_KOD/)).not.toBeInTheDocument();
    // Kimse davet edilmediyse başlık yalnız bulunanı ve gönderilmeyeni söyler ("0 davet edildi" yazmaz).
    expect(screen.getByText("5 tedarikçi bulundu").textContent).toBe("5 tedarikçi bulundu · 5 gönderilmedi");
  });

  // Canlı doğrulama AUTO-UI-6: uzun adlı satırda alt satıra inen rozet sola
  // düşüyor, 390 px'te rozet sütunu satırdan satıra sağ / sol gidip geliyordu.
  it("AUTO-UI-6: sonuç rozeti her satırda sağa yaslanır (kısa ad, uzun ad, nedenli satır — aynı hiza)", () => {
    h.data = done([
      cand("a", "Kısa AŞ", { invite: "INVITED" }),
      cand("b", "Uzun Adlı Bağlantı Elemanları ve Endüstriyel Tedarik Sanayi Ticaret Anonim Şirketi", { invite: "QUEUED" }),
      cand("c", "Nedenli Ltd", { invite: "NOT_SENT", inviteReason: "OPTED_OUT" }),
      cand("d", "Eski Ltd", { invite: "ALREADY_INVITED" }),
    ]);
    render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    const chips = ["Davet edildi", "Davet sırada", "Gönderilmedi", "Zaten davetliydi"].map((label) => screen.getByText(label));
    for (const chip of chips) {
      const outcome = chip.parentElement as HTMLElement;
      expect(outcome.parentElement?.tagName, chip.textContent ?? "").toBe("LI");
      expect(outcome.classList.contains("ml-auto"), chip.textContent ?? "").toBe(true);
      expect(outcome.classList.contains("text-right"), chip.textContent ?? "").toBe(true);
    }
  });

  /**
   * Canlı doğrulama AUTO-UI-7: alıcı otomatik aramayı kapatınca yedi satır
   * "Gönderilmedi — Davet iptal edildi" diyor, üstündeki cümle hâlâ "bulunan
   * tedarikçiler sizin adınıza davet edildi" diyordu.
   */
  describe("AUTO-UI-7: açıklama sayılarla uyuşur; kapatılan otomatik aramanın nedeni adıyla yazılır", () => {
    const INVITED_LEAD = /Bulunan tedarikçiler sizin adınıza davet edildi/;
    const NONE_SENT_LEAD = "Bulunan tedarikçilere davet gönderilmedi; nedenleri aşağıdaki satırlarda yazar.";
    const AUTO_OFF_REASON = "AI tedarikçi araması kapatıldı ya da talep yalnız davet edilen firmalara açıldı";
    const AUTO_OFF_LEAD = /AI tedarikçi araması kapatıldığı ya da talep yalnız davet ettiğiniz firmalara açıldığı için gönderilmedi\. Talebi düzenleyip bu ayarı geri alırsanız davetler yeniden sıraya girer\./;
    const off = (n: number, reason: string) =>
      Array.from({ length: n }, (_, i) => cand(`x${i}`, `Firma ${i + 1}`, { invite: "NOT_SENT", inviteReason: reason }));

    it("otomatik arama kapatıldı: satırlar nedeni söyler; açıklama 'davet edildi' DEMEZ ve ayarın nasıl geri alınacağını söyler", () => {
      h.data = { ...done(off(7, "AUTO_INVITE_OFF")), aiDiscovery: false };
      render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
      expect(screen.getByText("7 tedarikçi bulundu").textContent).toBe("7 tedarikçi bulundu · 7 gönderilmedi");
      expect(screen.getAllByText(AUTO_OFF_REASON)).toHaveLength(7);
      expect(screen.queryByText("Davet iptal edildi")).toBeNull();
      expect(screen.getByText(NONE_SENT_LEAD)).toBeInTheDocument();
      expect(screen.queryByText(INVITED_LEAD)).toBeNull();
      expect(screen.getByText(AUTO_OFF_LEAD)).toBeInTheDocument();
    });

    it("bir kısmı gönderilmedi: 'bir kısmı davet edildi' der; onay gerekmediği sözü durur", () => {
      h.data = done(MIXED);
      render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
      expect(screen.getByText(/Bulunan tedarikçilerin bir kısmı sizin adınıza davet edildi; onaylamanız gereken bir şey yok\. Gönderilmeyen davetlerin nedeni satırında yazar\./)).toBeInTheDocument();
      expect(screen.queryByText(INVITED_LEAD)).toBeNull();
      expect(screen.queryByText(NONE_SENT_LEAD)).toBeNull();
      expect(screen.queryByText(AUTO_OFF_LEAD)).toBeNull();
    });

    it("gönderilmeyen yok: eski cümle aynen", () => {
      h.data = done([cand("a", "Cıvata AŞ"), cand("b", "Viti Srl", { invite: "INVITED" }), cand("e", "Eski Ltd", { invite: "ALREADY_INVITED" })]);
      render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
      expect(screen.getByText(INVITED_LEAD)).toBeInTheDocument();
      expect(screen.queryByText(NONE_SENT_LEAD)).toBeNull();
    });

    it("neden kodunu taşımayan API yanıtında (CANCELLED) da açıklama satırlarla çelişmez", () => {
      h.data = { ...done(off(3, "CANCELLED")), aiDiscovery: false };
      render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
      expect(screen.getAllByText("Davet iptal edildi")).toHaveLength(3);
      expect(screen.getByText(NONE_SENT_LEAD)).toBeInTheDocument();
      expect(screen.queryByText(INVITED_LEAD)).toBeNull();
      // Kod gelmedikçe neden tahmin edilmez.
      expect(screen.queryByText(AUTO_OFF_LEAD)).toBeNull();
    });

    it("statusLeadKey: gönderilmeyen yok / bir kısmı / hepsi", () => {
      expect(statusLeadKey({ found: 5, notSent: 0 })).toBe("statusLead");
      expect(statusLeadKey({ found: 5, notSent: 2 })).toBe("statusLeadPartial");
      expect(statusLeadKey({ found: 5, notSent: 5 })).toBe("statusLeadNoneSent");
    });
  });

  it("?ai-davet=1 (sonuç bildirimi bağlantısı) ile liste açık gelir", () => {
    h.data = done([cand("a", "Cıvata AŞ")]);
    render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listeyi gizle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("ikinci tur: iki turun adayları tek listede, aynı firma bir kez; not düşülür", () => {
    h.data = {
      aiDiscovery: true,
      listingStatus: "OPEN",
      runs: [
        run([cand("n", "Neue Srl", { country: "IT" })], { id: "r2", trigger: "SECOND_ROUND" }),
        run([cand("a", "Cıvata AŞ"), cand("n2", "Neue Srl", { email: "n@x.com", country: "IT" })]),
      ],
    };
    render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    expect(screen.getByText("2 tedarikçi bulundu")).toBeInTheDocument();
    expect(screen.getAllByText("Neue Srl")).toHaveLength(1);
    expect(screen.getByText("Teklif az geldiği için AI yeniden aradı")).toBeInTheDocument();
  });

  it("AI-UI-1: 'Gizle' ile kapatılmış bant sonuç bağlantısıyla (?ai-davet=1) GERİ gelir, liste açık; yeniden 'Gizle' sunucuya yazmadan kapatır", () => {
    h.data = done([cand("a", "Cıvata AŞ"), cand("b", "Viti Srl", { country: "IT", invite: "INVITED" })], {
      dismissedAt: "2026-10-09T08:00:00Z",
    });
    // Bağlantısız açılışta gizli kalır.
    const plain = render(<ListingSuggestions listingId="l1" variant="band" />);
    expect(plain.container).toBeEmptyDOMElement();
    plain.unmount();

    const { container } = render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    expect(screen.getByText("2 tedarikçi bulundu")).toBeInTheDocument();
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
    expect(within(screen.getByText("Viti Srl").closest("li")!).getByText("Davet edildi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gizle" }));
    expect(container).toBeEmptyDOMElement();
    // Tur zaten gizlenmişti: yeniden gizleme isteği atılmaz.
    expect(h.dismiss).not.toHaveBeenCalled();
  });

  it("AI-UI-1: bağlantıyla gelinen (gizlenmemiş) bantta 'Gizle' sunucuya yazar ve tur gizlenince bant kapanır", () => {
    h.data = done([cand("a", "Cıvata AŞ")]);
    const view = render(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Gizle" }));
    expect(h.dismiss).toHaveBeenCalledTimes(1);
    h.data = done([cand("a", "Cıvata AŞ")], { dismissedAt: "2026-10-09T08:00:00Z" });
    view.rerender(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("R1: bağlantı sayfa AÇIKKEN gelirse (zil / canlı bildirim — aynı bileşen örneği, `defaultOpen` sonradan true) gizlenmiş bant geri gelir, liste açık", () => {
    h.data = done([cand("a", "Cıvata AŞ")], { dismissedAt: "2026-10-09T08:00:00Z" });
    const onDismiss = vi.fn();
    const view = render(<ListingSuggestions listingId="l1" variant="band" onDismiss={onDismiss} />);
    // "Gizle" denmiş bant: bağlantısız sayfada çizilmez.
    expect(view.container).toBeEmptyDOMElement();

    // Bildirime tıklandı: adres `?ai-davet=1` kazandı, bileşen YENİDEN BAĞLANMADI.
    view.rerender(<ListingSuggestions listingId="l1" variant="band" defaultOpen onDismiss={onDismiss} />);
    expect(screen.getByText("1 tedarikçi bulundu")).toBeInTheDocument();
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listeyi gizle" })).toHaveAttribute("aria-expanded", "true");

    // Yeniden "Gizle": bant kapanır, sayfaya haber verilir (parametreyi adresten siler).
    fireEvent.click(screen.getByRole("button", { name: "Gizle" }));
    expect(view.container).toBeEmptyDOMElement();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(h.dismiss).not.toHaveBeenCalled();

    // Parametre silindi (true → false): hiçbir şey açılmaz…
    view.rerender(<ListingSuggestions listingId="l1" variant="band" onDismiss={onDismiss} />);
    expect(view.container).toBeEmptyDOMElement();
    // …aynı bildirime bir kez daha tıklanınca bant yine gelir.
    view.rerender(<ListingSuggestions listingId="l1" variant="band" defaultOpen onDismiss={onDismiss} />);
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
  });

  it("R1: görünen bantta bağlantı sonradan gelirse kapalı liste açılır; parametrenin silinmesi açık listeyi kapatmaz", () => {
    h.data = done([cand("a", "Cıvata AŞ")]);
    const view = render(<ListingSuggestions listingId="l1" variant="band" />);
    expect(screen.queryByText("Cıvata AŞ")).not.toBeInTheDocument();
    view.rerender(<ListingSuggestions listingId="l1" variant="band" defaultOpen />);
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
    view.rerender(<ListingSuggestions listingId="l1" variant="band" />);
    expect(screen.getByText("Cıvata AŞ")).toBeInTheDocument();
    // Kullanıcının kapattığı liste aynı değerle yeniden çizimde açılmaz.
    fireEvent.click(screen.getByRole("button", { name: "Listeyi gizle" }));
    view.rerender(<ListingSuggestions listingId="l1" variant="band" />);
    expect(screen.queryByText("Cıvata AŞ")).not.toBeInTheDocument();
  });

  it("R5: başlık satırı sarar — metin en az 12rem alır (taban 0 değil), eylemler sığmazsa kendi satırına iner ve sağa yaslanır", () => {
    h.data = done(MIXED);
    render(<ListingSuggestions listingId="l1" variant="band" />);
    const text = screen.getByText("6 tedarikçi bulundu").parentElement as HTMLElement;
    expect(text.className).toMatch(/\bmin-w-0\b/);
    expect(text.className).toContain("flex-[1_1_12rem]");
    // `flex-1` (taban 0): satır hiç sarmaz, metin kalan dar sütuna sıkışır.
    expect(text.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
    const row = text.parentElement as HTMLElement;
    expect(row.className).toMatch(/\bflex-wrap\b/);
    const actions = screen.getByRole("button", { name: "Gizle" }).parentElement as HTMLElement;
    expect(actions.parentElement).toBe(row);
    expect(actions).toContainElement(screen.getByRole("button", { name: "Listeyi göster" }));
    expect(actions.className).toMatch(/\bml-auto\b/);
    expect(actions.className).toMatch(/\bshrink-0\b/);
  });

  it("tur bitince talep sayfasındaki 'E-postayla davet edilenler' listesi tazelenir; ilk yüklemede tazelenmez", () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    try {
      h.data = { aiDiscovery: true, listingStatus: "OPEN", runs: [run([], { state: "RUNNING", finishedAt: null })] };
      const view = render(<ListingSuggestions listingId="l1" variant="band" />);
      expect(invalidate).not.toHaveBeenCalled();
      h.data = done([cand("a", "Cıvata AŞ")]);
      view.rerender(<ListingSuggestions listingId="l1" variant="band" />);
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["company", "listing-email-invites", "l1"] });
      // Aynı veriyle yeniden çizim yeniden tazelemez.
      view.rerender(<ListingSuggestions listingId="l1" variant="band" />);
      expect(invalidate).toHaveBeenCalledTimes(1);
      view.unmount();

      // Bitmiş turla açılan sayfa: liste zaten yeni okunur.
      invalidate.mockClear();
      render(<ListingSuggestions listingId="l2" variant="band" />);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      invalidate.mockRestore();
    }
  });

  it("Gizle bandı kapatır; kapatılmış tur çizilmez; panelde Gizle yok", () => {
    h.data = done([cand("a", "Cıvata AŞ")]);
    const { unmount } = render(<ListingSuggestions listingId="l1" variant="band" />);
    fireEvent.click(screen.getByRole("button", { name: "Gizle" }));
    expect(h.dismiss).toHaveBeenCalled();
    unmount();
    const panel = render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.queryByRole("button", { name: "Gizle" })).not.toBeInTheDocument();
    panel.unmount();
    h.data = done([cand("a", "Cıvata AŞ")], { dismissedAt: "2026-09-27T10:00:00Z" });
    const { container } = render(<ListingSuggestions listingId="l1" variant="band" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hiçbir şey bulunmadıysa: bant çizilmez, yayın paneli 'bulunamadı' der", () => {
    h.data = done([]);
    const band = render(<ListingSuggestions listingId="l1" variant="band" />);
    expect(band.container).toBeEmptyDOMElement();
    band.unmount();
    render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText("Bu talep için uygun tedarikçi bulunamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Listeyi göster" })).not.toBeInTheDocument();
  });

  it("tur sürerken 'AI arıyor'; otomatik arama kapalı ve tur yoksa hiçbir şey çizilmez", () => {
    h.data = { aiDiscovery: true, listingStatus: "OPEN", runs: [run([], { state: "RUNNING", finishedAt: null })] };
    render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText(/AI talebiniz için yurt içinde ve yurt dışında tedarikçi arıyor/)).toBeInTheDocument();
    h.data = { aiDiscovery: false, listingStatus: "OPEN", runs: [] };
    const { container } = render(<ListingSuggestions listingId="l2" variant="panel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("embargolu talepte tur yokken 'aranıyor' değil 'açılınca başlar' der (S090)", () => {
    h.data = { aiDiscovery: true, listingStatus: "OPEN", startsAt: "2099-01-01T09:00:00.000Z", runs: [] };
    render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText("AI tedarikçi araması talep teklife açılınca başlar.")).toBeInTheDocument();
    expect(screen.queryByText(/tedarikçi arıyor/)).not.toBeInTheDocument();
  });

  it("tur hiç gelmediyse (yoklama tavanı doldu) süresiz 'aranıyor' bandı çizilmez (S090)", () => {
    h.data = { aiDiscovery: true, listingStatus: "OPEN", startsAt: null, runs: [] };
    const { unmount } = render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(screen.getByText(/tedarikçi arıyor/)).toBeInTheDocument();
    unmount();
    h.exhausted = true;
    const { container } = render(<ListingSuggestions listingId="l1" variant="panel" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("candidateOutcome — `invite` alanı olmayan (eski) yanıtta ham durumdan türetilir", () => {
  it.each([
    [{ status: "INVITED" }, false, { invite: "INVITED", reason: null }],
    [{ status: "ALREADY_INVITED" }, false, { invite: "ALREADY_INVITED", reason: null }],
    [{ status: "CONSENT_REQUIRED" }, false, { invite: "NOT_SENT", reason: "CONSENT_REQUIRED" }],
    [{ status: "SUGGESTED" }, true, { invite: "WAITING", reason: null }],
    [{ status: "MEMBER" }, false, { invite: "NOT_SENT", reason: null }],
    [{ status: "INVITED", invite: "NOT_SENT" as const, inviteReason: "PAUSED" }, false, { invite: "NOT_SENT", reason: "PAUSED" }],
  ])("%j (tur sürüyor: %s)", (c, active, expected) => {
    expect(candidateOutcome(c, active)).toEqual(expected);
  });
});

describe("inviteCounts — bant başlığının sayıları (AI-UI-2)", () => {
  it("davet edildi = INVITED; sırada = QUEUED; gönderilmedi = NOT_SENT; zaten davetli ve bekleyen hiçbirine girmez", () => {
    const rows = (["INVITED", "INVITED", "QUEUED", "NOT_SENT", "ALREADY_INVITED", "WAITING"] as const).map((invite) => ({ invite }));
    expect(inviteCounts(rows)).toEqual({ found: 6, invited: 2, queued: 1, notSent: 1 });
    expect(inviteCounts([])).toEqual({ found: 0, invited: 0, queued: 0, notSent: 0 });
  });

  // AUTO-MEMBER-1: otomatik tur yalnız genel sektörü tutan üyeyi bilinçli olarak
  // davet etmez. Bu bir gönderim hatası değildir: "gönderilmedi" sayısına girmez,
  // açıklama cümlesini "hiçbiri gönderilmedi"ye çevirmez.
  it("zayıf eşleşme (WEAK_MATCH) bulunanlara sayılır ama gönderilmeyenlere SAYILMAZ", () => {
    const rows = [
      { invite: "INVITED" as const },
      { invite: "QUEUED" as const },
      { invite: "NOT_SENT" as const, reason: "WEAK_MATCH" },
      { invite: "NOT_SENT" as const, reason: "WEAK_MATCH" },
      { invite: "NOT_SENT" as const, reason: "DAILY_LIMIT" },
    ];
    const counts = inviteCounts(rows);
    expect(counts).toEqual({ found: 5, invited: 1, queued: 1, notSent: 1 });
    // Yalnız zayıf eşleşme kaldıysa "gönderilmeyen yok" cümlesi kalır.
    const onlyWeak = inviteCounts([{ invite: "INVITED" }, { invite: "NOT_SENT", reason: "WEAK_MATCH" }]);
    expect(statusLeadKey(onlyWeak)).toBe("statusLead");
  });
});

describe("bant başlığı metinleri — sayı + ad TEK ICU çoğul mesajında, üç dilde (AI-UI-2)", () => {
  const tFor = (locale: "tr" | "en" | "ru") =>
    createTranslator({
      locale,
      messages: messagesFor(locale, WEB_NAMESPACES),
      namespace: "web.panel.requests.aiSuppliers" as never,
      onError: (e) => {
        throw e;
      },
    }) as unknown as (key: string, values: { n: number }) => string;
  const KEYS = ["bandFound", "bandInvited", "bandQueued", "bandNotSent"] as const;

  it("her dilde dört anahtar tek çoğul mesajdır (sayı mesajın içinde; sabit çoğul ada yapıştırılmaz)", () => {
    for (const locale of ["tr", "en", "ru"] as const) {
      const raw = messagesFor(locale, WEB_NAMESPACES).web.panel.requests.aiSuppliers;
      for (const key of KEYS) expect(raw[key], `${locale}.${key}`).toMatch(/^\{n, plural, .*\}$/);
    }
  });

  it("TR", () => {
    const t = tFor("tr");
    expect(KEYS.map((k) => t(k, { n: 3 }))).toEqual(["3 tedarikçi bulundu", "3 davet edildi", "3 davet sırada", "3 gönderilmedi"]);
  });

  it("EN: tekil / çoğul", () => {
    const t = tFor("en");
    expect(t("bandFound", { n: 1 })).toBe("1 supplier found");
    expect(t("bandFound", { n: 23 })).toBe("23 suppliers found");
    expect(t("bandInvited", { n: 3 })).toBe("3 invited");
    expect(t("bandQueued", { n: 1 })).toBe("1 invitation queued");
    expect(t("bandQueued", { n: 20 })).toBe("20 invitations queued");
    expect(t("bandNotSent", { n: 2 })).toBe("2 not sent");
  });

  it("RU: one / few / many", () => {
    const t = tFor("ru");
    expect(t("bandFound", { n: 1 })).toBe("Найден 1 поставщик");
    expect(t("bandFound", { n: 23 })).toBe("Найдено 23 поставщика");
    expect(t("bandFound", { n: 20 })).toBe("Найдено 20 поставщиков");
    expect(t("bandInvited", { n: 1 })).toBe("1 приглашён");
    expect(t("bandInvited", { n: 3 })).toBe("3 приглашены");
    expect(t("bandInvited", { n: 5 })).toBe("5 приглашено");
    expect(t("bandQueued", { n: 1 })).toBe("1 приглашение в очереди");
    expect(t("bandQueued", { n: 2 })).toBe("2 приглашения в очереди");
    expect(t("bandQueued", { n: 20 })).toBe("20 приглашений в очереди");
    expect(t("bandNotSent", { n: 14 })).toBe("14 не отправлено");
  });
});

/**
 * Neden kodu = `INVITE_REASON_KEYS`e satır + ÜÇ dilde katalog metni; açıklama
 * cümleleri de üç dilde (AUTO-UI-7). Eksik anahtar ekranda ham anahtar yolu olur.
 */
describe("davet nedeni ve açıklama metinleri üç dilde tam", () => {
  const LEADS = ["statusLead", "statusLeadPartial", "statusLeadNoneSent", "statusLeadAutoOff"] as const;

  it.each(["tr", "en", "ru"] as const)("%s: her neden kodunun ve her açıklamanın metni var", (locale) => {
    const raw = messagesFor(locale, WEB_NAMESPACES).web.panel.requests.aiSuppliers as unknown as Record<string, unknown>;
    const reasons = raw.reason as Record<string, string>;
    for (const code of INVITE_REASON_KEYS) expect(reasons[code], `${locale}.reason.${code}`).toEqual(expect.any(String));
    expect(INVITE_REASON_KEYS.has("AUTO_INVITE_OFF")).toBe(true);
    // Katalogda olup ekranın tanımadığı neden kalmasın (iki liste ayrışmasın).
    expect(Object.keys(reasons).sort()).toEqual([...INVITE_REASON_KEYS].sort());
    for (const key of LEADS) expect(raw[key], `${locale}.${key}`).toEqual(expect.any(String));
    expect(new Set(LEADS.map((key) => raw[key])).size).toBe(LEADS.length);
    // Kapatılan aramanın nedeni çıplak "iptal edildi" ile aynı cümle değil.
    expect(reasons.AUTO_INVITE_OFF).not.toBe(reasons.CANCELLED);
  });
});
