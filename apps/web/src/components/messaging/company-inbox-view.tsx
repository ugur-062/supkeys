"use client";

import { foldSearchText } from "@rothern/shared";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { PageHeader } from "@/components/list";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { CompanyMessageThread } from "@/components/messaging/company-message-thread";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useThreadMessages,
  useThreads,
  type MessagePortal,
  type ThreadSummary,
} from "@/hooks/use-company-messages";
import {
  canUseMessaging,
  messagingDirectionOpen,
  PORTAL_ORDER,
} from "@/lib/company/portals";
import { ErrorState } from "@/components/ui/error-state";
import {
  isEditableElement,
  isPhoneLike,
} from "@/components/company-shell/assistant/fab-suppression";
import { useReadFailed } from "@/hooks/use-read-failed";
import { cn } from "@/lib/utils";
import { format, isToday } from "date-fns";
import { ArrowLeft, Lock, MessageSquare, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * BİRLEŞİK gelen kutusu (kullanıcı isteği 2026-08-02): Satınalma + Satış
 * konuşmaları TEK listede, her satırda "Alıcısınız/Satıcısınız" rozeti.
 * Konuşma modeli değişmedi — thread hâlâ (alıcı, satıcı) çifti; aynı firmayla
 * iki yönde iki ayrı konuşma olabilir, rozet farkıyla ayrışır. Rol kapıları
 * aynen: kullanıcı yalnız İŞLEM ROLÜ olan tarafların konuşmalarını görür,
 * composer o tarafın rolünü ister.
 */

/**
 * TELEFONDA KONUŞMA = AYRI EKRAN, GERİ LİSTEYE DÖNER (mobil denetim g04):
 * seçim adrese `replaceState` ile yazıldığı için Android'in Geri hareketi
 * (kabukta WebView `goBack`) konuşmadan listeye değil Mesajlar'dan önceki
 * sayfaya gidiyordu. Tek panelli düzende (sm altı) listeden açılan konuşma
 * geçmişe YENİ kayıt ekler ve kayıt `history.state`te işaretlenir; ekrandaki
 * geri oku işaretli kaydı `history.back()` ile geri alır (Geri/İleri sonrası
 * da işaret kayıtta durur — ref'e güvenilmez). Yan yana düzende, derin
 * bağlantıda ve aynı konuşmada yön değişiminde adres yerinde yazılır.
 */
export const INBOX_THREAD_STATE_KEY = "rothernInboxThread";
/** sm — liste ve sohbet yan yana; altında tek panel (liste ↔ sohbet). */
const SIDE_BY_SIDE_QUERY = "(min-width: 40rem)";

function stackedLayout(): boolean {
  return typeof window.matchMedia !== "function" || !window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
}

/** Geçerli geçmiş kaydı telefonda listeden açılan konuşmanın kaydı mı? */
function onPushedThreadEntry(): boolean {
  const state = window.history.state as Record<string, unknown> | null;
  return !!state && state[INBOX_THREAD_STATE_KEY] === true;
}

function parsePortal(raw: string | null): MessagePortal | null {
  return raw === "satis" || raw === "satinalma" ? raw : null;
}

interface ThreadRow {
  key: string;
  id: string; // karşı firma id
  name: string;
  /** Konuşmanın tarafı; undefined = henüz konuşulmamış bağlantı. */
  portal: MessagePortal | undefined;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
}

/** "Bu konuşmada ben kimim?" rozeti — satinalma kutusu = ben ALICIYIM. Etiket katalog anahtarı. */
const ROLE_CHIP: Record<MessagePortal, { label: "rozetAlicisiniz" | "rozetSaticisiniz"; cls: string }> = {
  satinalma: { label: "rozetAlicisiniz", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "rozetSaticisiniz", cls: "bg-emerald-50 text-emerald-700" },
};

function RoleChip({ portal, className }: { portal: MessagePortal; className?: string }) {
  const t = useTranslations("web.panel.inbox.companyInboxView");
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        ROLE_CHIP[portal].cls,
        className,
      )}
    >
      {t(ROLE_CHIP[portal].label)}
    </span>
  );
}

/**
 * Portalsız derin link (`?with=` — yeni mesaj e-postası eski biçimi) için yön:
 * bu firmayla VAR OLAN konuşmanın portalı (okunmamış olan, yoksa en yenisi).
 * Konuşma yoksa null → çağıran rolüm olan ilk tarafa düşer.
 */
function pickDeepLinkPortal(
  threads: ThreadSummary[],
  otherPartyId: string,
  myPortals: MessagePortal[],
): MessagePortal | null {
  const mine = threads.filter(
    (th) => th.otherPartyId === otherPartyId && myPortals.includes(th.portal),
  );
  if (mine.length === 0) return null;
  const unread = mine.find((th) => th.unread);
  if (unread) return unread.portal;
  const byRecent = [...mine].sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
  return byRecent[0]!.portal;
}

export function CompanyInboxView() {
  const t = useTranslations("web.panel.inbox.companyInboxView");
  const locale = useLocale();
  const { user, company } = useCompanyAuth();
  // Kullanıcının mesajlaşabildiği taraflar (işlem rolü olan portallar).
  const myPortals = PORTAL_ORDER.filter((p) =>
    canUseMessaging(user, p),
  );
  // YENİ konuşmanın açılabileceği yönler (arayüz testi O-123): alıcı yönü
  // satınalma panelidir → Gold. Gold altı firma eski alıcı konuşmalarını
  // listede görür ve okur; varsayılan yön alıcı tarafı olmaz, yön seçicide
  // alıcı tarafı kilitli görünür (API `send` aynı kuralla 403 TIER_REQUIRED
  // verir — süren sipariş istisnası dışında).
  const newChatPortals = myPortals.filter((p) =>
    messagingDirectionOpen(p, company?.tier),
  );
  const allowed = myPortals.length > 0;
  const connections = useConnections();
  const threads = useThreads("all", allowed);
  // Okunamayan konuşma listesi: hata satırı 5 sn'lik yoklamayla iskelete DÖNMEZ,
  // veri gelene dek durur (`useReadFailed`, son canlı kontrol OUTF-1).
  const threadsRead = useReadFailed(threads);
  const searchParams = useSearchParams();
  const urlWith = searchParams.get("with");
  const urlPortal = parsePortal(searchParams.get("portal"));
  const [selected, setSelected] = useState<{
    id: string;
    /** null = derin linkte yön yok; konuşmalar yüklenince çözülür. */
    portal: MessagePortal | null;
  } | null>(() => (urlWith ? { id: urlWith, portal: urlPortal } : null));
  const [search, setSearch] = useState("");
  /** Sıradaki adres yazımı geçmişe yeni kayıt mı ekler (telefonda listeden açılış). */
  const pushNextRef = useRef(false);
  /**
   * Listenin son kaydırma konumu — telefonda konuşma açılınca liste gizlenir
   * ve kap konumunu yitirir; listeye dönünce (geri oku, Geri, İleri→Geri)
   * geri yüklenir.
   */
  const listScrollRef = useRef<HTMLDivElement>(null);
  const savedListScroll = useRef<number | null>(null);

  // Seçim adres çubuğunda (arayüz testi D-355): listeden seçilen konuşma
  // `?with=&portal=` olarak yazılır — yenileme/paylaşım aynı konuşmayı açar
  // (derin link okuyucusu yukarıdaki başlangıç durumu). Yönü henüz çözülmemiş
  // (portalsız) seçimde `portal` yazılmaz; sabitlenince eklenir. Next
  // `history.replaceState`i yönlendiriciyle eşitler (gezinme/yeniden yükleme yok).
  // Telefonda listeden açılış `pushState` (yukarıda); işaretli kayıt kapanırken
  // adres yazılmaz — kaydı geri oku `history.back()` ile geri alır.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const push = pushNextRef.current;
    pushNextRef.current = false;
    const u = new URL(window.location.href);
    if (selected) {
      u.searchParams.set("with", selected.id);
      if (selected.portal) u.searchParams.set("portal", selected.portal);
      else u.searchParams.delete("portal");
    } else {
      u.searchParams.delete("with");
      u.searchParams.delete("portal");
    }
    if (u.toString() === window.location.href) return;
    const pushed = onPushedThreadEntry();
    if (!selected && pushed) return;
    if (push) {
      window.history.pushState({ [INBOX_THREAD_STATE_KEY]: true }, "", u.toString());
    } else {
      // İşaret aynı kayıtta korunur (yön değişimi, yönün çözülmesi).
      window.history.replaceState(pushed ? { [INBOX_THREAD_STATE_KEY]: true } : null, "", u.toString());
    }
  }, [selected]);

  // Adres DIŞARIDAN değişince (Geri/İleri) görünüm izler — boyamadan önce,
  // eski görünüm bir kare bile kalmaz. Kendi yazımlarımız aynı seçimi verir →
  // dokunulmaz; portalsız adres eldeki yönü ezmez.
  const lastUrlKey = useRef(`${urlWith ?? ""}|${urlPortal ?? ""}`);
  useLayoutEffect(() => {
    const key = `${urlWith ?? ""}|${urlPortal ?? ""}`;
    if (lastUrlKey.current === key) return;
    lastUrlKey.current = key;
    setSelected((prev) => {
      if (!urlWith) return null;
      if (prev && prev.id === urlWith && (urlPortal === null || prev.portal === urlPortal)) return prev;
      return { id: urlWith, portal: urlPortal };
    });
  }, [urlWith, urlPortal]);

  // Listeye dönünce kaydırma konumu geri gelir (gizlenen kap konumunu yitirir).
  useLayoutEffect(() => {
    if (selected || savedListScroll.current === null || !listScrollRef.current) return;
    listScrollRef.current.scrollTop = savedListScroll.current;
  }, [selected]);

  /** Listeden konuşma aç — telefonda geçmişe kayıt bırakır (Geri listeye döner). */
  const openFromList = (next: { id: string; portal: MessagePortal }) => {
    if (typeof window !== "undefined" && stackedLayout()) {
      savedListScroll.current = listScrollRef.current?.scrollTop ?? null;
      pushNextRef.current = !new URL(window.location.href).searchParams.has("with");
    }
    setSelected(next);
  };
  /** Telefonda listeye dön: işaretli kayıt geri alınır, değilse adres temizlenir. */
  const closeThread = () => {
    setSelected(null);
    if (typeof window !== "undefined" && onPushedThreadEntry()) window.history.back();
  };

  /*
   * YAZARKEN KUTU EKRANI DOLDURUR (mobil denetim g04): telefonda sohbet
   * açıkken kutu, alttaki 96 px'lik AI Asistan payını (`pb-24`) boş bırakıyordu;
   * klavye açıkken (görünür alan ~480 px) mesaj listesine ~110 px kalıyordu.
   * Yazma alanı odaktayken düğme zaten gizli (`fab-suppression`, aynı kural:
   * telefon ya da dokunmatik + metin alanı odakta) → pay kutuya katılır.
   */
  const [typingInThread, setTypingInThread] = useState(false);
  // Sohbet kapanınca bayrak düşer: odaktaki kutu DOM'dan kalkarken `blur`
  // her tarayıcıda gelmez (Android Geri'si klavyeyi kapatır ama odak kutuda
  // kalır). Kalırsa sonraki açılışta kutu, düğme görünürken payı kaplar ve
  // asistan düğmesi Gönder'in üstüne biner.
  if (selected === null && typingInThread) setTypingInThread(false);
  const typing = typingInThread && selected !== null;

  const rows = useMemo<ThreadRow[]>(() => {
    const threadRows: ThreadRow[] = (threads.data ?? []).map((th) => ({
      key: `${th.portal}:${th.otherPartyId}`,
      id: th.otherPartyId,
      name: th.otherPartyName,
      portal: th.portal,
      lastMessagePreview: th.lastMessagePreview,
      lastMessageAt: th.lastMessageAt,
      unread: th.unread,
    }));
    const threadCompanyIds = new Set(threadRows.map((r) => r.id));
    // Henüz konuşulmamış bağlantılar — yeni sohbet başlatma girişleri
    // (firma başına TEK satır; yön, sohbet panelindeki seçiciyle belirlenir).
    const fresh: ThreadRow[] = (connections.data ?? [])
      .filter((c) => !threadCompanyIds.has(c.company.id))
      .map((c) => ({
        key: `new:${c.company.id}`,
        id: c.company.id,
        name: c.company.name,
        portal: undefined,
        lastMessagePreview: null,
        lastMessageAt: null,
        unread: false,
      }));
    const all = [...threadRows, ...fresh];
    // Sohbeti olanlar üstte (son mesaj desc), sonra alfabetik.
    all.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt)
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name, "tr");
    });
    // Katlanmış karşılaştırma — `tr` küçültme Latin "I"yı "ı" yapıyordu.
    const q = foldSearchText(search);
    return q
      ? all.filter((r) => foldSearchText(r.name).includes(q))
      : all;
  }, [connections.data, threads.data, search]);

  // Seçili sohbetin yönü. Açık portal (rolüm varsa) aynen; yoksa (portalsız
  // e-posta linki, derin denetim Y-18) bu firmayla var olan konuşmanın yönü —
  // eskiden iki izinli kullanıcıda hep "satinalma" seçilip satıcı tarafa ters
  // yöndeki BOŞ konuşma açılıyordu. Konuşmalar yüklenirken null (iskelet).
  const activePortal: MessagePortal | null = !selected
    ? null
    : selected.portal && myPortals.includes(selected.portal)
      ? selected.portal
      : threads.isLoading
        ? null
        : (pickDeepLinkPortal(threads.data ?? [], selected.id, myPortals) ??
          newChatPortals[0] ??
          myPortals[0] ??
          "satinalma");

  // Çözülen yön BİR KEZ sabitlenir (gözden geçirme W4): her render'da
  // yeniden hesaplansaydı, LIVE yoklamada okunmamış bayrağı düşünce ya da
  // öbür yönde yeni okunmamış gelince seçim diğer konuşmaya kayar, sohbet
  // yeniden bağlanıp taslak silinirdi.
  // Gözden geçirme R-4: YALNIZ yönü belirsiz (portalsız) seçim ve YALNIZ yön
  // gerçekten çözüldüğünde yazılır. Açık `?portal=` / kullanıcı seçimi asla
  // ezilmez: kalıcı oturum anlık görüntüsünde izinler bayat/eksikken
  // (myPortals boş ya da tek taraf) fallback "satinalma" state'e yazılıyor,
  // /me doğru izinleri getirince ters yöndeki boş konuşma kilitleniyordu.
  // Tek taraflı kullanıcıda yön zaten belirlenimci (tek seçenek), kayma
  // yok — sabitlenmez; ikinci taraf sonradan verilirse taze veriyle çözülür.
  const pinReady =
    allowed &&
    myPortals.length > 1 &&
    !threads.isLoading &&
    threads.data !== undefined;
  useEffect(() => {
    if (!pinReady || !selected || selected.portal !== null || !activePortal) {
      return;
    }
    setSelected({ id: selected.id, portal: activePortal });
  }, [pinReady, selected, activePortal]);

  const knownName =
    rows.find((r) => r.id === selected?.id)?.name ??
    (threads.data ?? []).find((th) => th.otherPartyId === selected?.id)
      ?.otherPartyName ??
    // Derin denetim LU-31: `rows` arama süzgecinden geçmiş liste; henüz
    // konuşması olmayan seçili bağlantı süzgeçle düşünce ad kayboluyor,
    // sohbet paneli unmount olup taslak siliniyordu.
    (connections.data ?? []).find((c) => c.company.id === selected?.id)
      ?.company.name ??
    null;
  // Derin denetim Y-18: ad yalnız konuşmalar + AKTİF bağlantılardan
  // çözülüyordu; bağlantısız teklif veren / sipariş karşı tarafıyla ilk
  // temasta (backend D1 kararıyla serbest) panel hiç çizilmiyordu. Ad yoksa
  // sohbet ucunun `otherParty.name`i kullanılır — sohbet bileşeniyle AYNI
  // sorgu anahtarı, yani ek istek yok.
  const nameQuery = useThreadMessages(
    activePortal ?? "satinalma",
    selected && activePortal && !knownName ? selected.id : undefined,
  );
  const selectedName = knownName ?? nameQuery.data?.otherParty.name ?? null;

  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={t("mesajlar")}
          description={t("satinalmaVeSatisKonusmalarinTek")}
        />
        <div className="flex flex-col items-center rounded-xl border border-zinc-950/10 bg-white px-6 py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-700">
            {t("mesajlasmaIcinSatinAlmaciVeya")}
          </p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            {t("buHesaptaOperasyonRoluTanimli")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Telefonda sohbet açıkken sayfa başlığı ve 3 satırlık açıklama yer
          kaplamasın (mobil denetim g04: mesajlara ~250 px kalıyordu) —
          başlık ekran okuyucu için durur (`sr-only`), görsel olarak çekilir. */}
      <PageHeader
        title={t("mesajlar")}
        description={t("satinalmaVeSatisKonusmalarinizTek")}
        className={selected ? "max-sm:sr-only" : undefined}
      />

      {/* C44: standart düzen — konuşma listesi SOLDA, sohbet SAĞDA.
          Arayüz testi Y-07: kutu ekranın altına kadar uzanınca sağ-alttaki
          sabit AI Asistan düğmesi (bottom-8, 56px) Gönder düğmesini
          örtüyordu; sayfa kaymadığı için kabuğun pb-24 payı da işlemiyordu.
          Alt kenar düğmenin üstünde kalacak kadar kısaltıldı (17rem).
          Yükseklik `dvh` ile (mobil denetim g04): `vh` iOS tarayıcı araç
          çubuğunu saymıyor, yazma kutusu çubuğun altında kalıyordu. Telefonda
          sohbet açıkken başlık çekildiği için kutu sayfanın üst payına da
          çıkar (`-mt-6`, şerit doğrudan üst çubuğun altında; kesinti notu
          varsa onun `mb-6` payıyla notun altına oturur) ve üst çubuk (56) ile
          alt pay (pb-24 = 96, asistan düğmesinin sütunu) arasını tam doldurur:
          9.5rem — sayfa kaymaz, Gönder düğmenin üstünde. YAZARKEN (yukarıda)
          düğme gizli → alt pay da kutuya katılır (`-mb-24`, yalnız üst çubuk
          düşülür). Güvenli alan (mobil kabuk): üst çubuk üst pay kadar uzar,
          kabuk alttan ana ekran çizgisi kadar pay alır → ikisi de düşülür. */}
      <div
        className={cn(
          "grid h-[calc(100dvh-17rem-var(--safe-top)-var(--safe-bottom))] min-h-[480px] grid-cols-1 overflow-hidden border-t border-zinc-950/10 sm:grid-cols-[340px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]",
          selected && "max-sm:-mt-6 max-sm:min-h-72 max-sm:border-t-0",
          selected &&
            (typing
              ? "max-sm:-mb-24 max-sm:h-[calc(100dvh-3.5rem-var(--safe-top)-var(--safe-bottom))]"
              : "max-sm:h-[calc(100dvh-9.5rem-var(--safe-top)-var(--safe-bottom))]"),
        )}
      >
        {/* Sol: kontak listesi */}
        <div
          className={`flex flex-col border-zinc-950/10 bg-white sm:order-1 sm:border-r ${
            selected ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="border-b border-zinc-950/5 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                // Erişilebilir ad (arayüz testi D-267): yer tutucu ad değildir.
                aria-label={t("kisiAraEtiketi")}
                placeholder={t("kisiAra")}
                className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
          </div>
          <div
            ref={listScrollRef}
            onScroll={(e) => {
              savedListScroll.current = e.currentTarget.scrollTop;
            }}
            className="flex-1 overflow-y-auto"
          >
            {threadsRead.failed ? (
              // Kesinti ≠ boş kutu (arayüz testi D-070): 5xx'te "önce bağlantı
              // kur" boş durumu yanıltıyordu.
              <ErrorState
                className="m-3"
                message={t("konusmalarYuklenemediTekrarDeneyin")}
                onRetry={threadsRead.retry}
              />
            ) : connections.isPending || threads.isPending ? (
              // `isPending`: çevrimdışı duraklayan sorguda `isLoading` false kalır
              // ve "önce bağlantı kurun" çizilirdi (LİSTE DURUMLARI).
              <div className="space-y-2 p-3" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-zinc-100"
                  />
                ))}
              </div>
            ) : rows.length === 0 && connections.isError && !connections.data ? (
              // Konuşma yok ve bağlantı listesi OKUNAMADI: "önce bir firmayla
              // bağlantı kurun" demek yalan olur — bağlantılar bilinmiyor.
              <ErrorState
                className="m-3"
                message={t("konusmalarYuklenemediTekrarDeneyin")}
                onRetry={() => void connections.refetch()}
              />
            ) : rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">
                  {t("mesajlasmakIcinOnceBirFirmayla")}
                </p>
              </div>
            ) : (
              rows.map((r) => {
                const isActive =
                  selected?.id === r.id &&
                  (r.portal === undefined || activePortal === r.portal);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() =>
                      openFromList({
                        id: r.id,
                        // Yeni sohbette varsayılan yön: paketin ve rolün
                        // açtığı ilk taraf (Gold altında satıcı yönü, O-123).
                        portal: r.portal ?? newChatPortals[0] ?? myPortals[0]!,
                      })
                    }
                    className={`flex w-full items-center gap-3 border-l-2 border-b border-zinc-950/5 px-3 py-3 text-left transition hover:bg-zinc-50 ${
                      isActive
                        ? "border-l-brand-600 bg-zinc-100/80"
                        : "border-l-transparent"
                    }`}
                  >
                    <AvatarInitials name={r.name} size="sm" className="mt-0.5" />
                    {/* Telefonda rol rozeti önizleme satırına iner, ad satırında
                        yalnız tarih kalır (mobil denetim g04: RU'da rozet + tarih
                        adı "QA Ted…"ye indiriyor, iki firma ayırt edilemiyordu);
                        ad kırpılmaz, gerekirse iki satıra sarar. */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 max-sm:items-baseline">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900 max-sm:line-clamp-2 max-sm:break-words sm:truncate">
                            {r.name}
                          </span>
                          {r.portal ? (
                            <RoleChip portal={r.portal} className="max-sm:hidden" />
                          ) : null}
                        </span>
                        {r.lastMessageAt ? (
                          <span className="shrink-0 text-xs text-zinc-400">
                            {isToday(new Date(r.lastMessageAt))
                              ? format(new Date(r.lastMessageAt), "HH:mm")
                              : formatDate(r.lastMessageAt, "short", locale)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.portal ? (
                          <RoleChip portal={r.portal} className="sm:hidden" />
                        ) : null}
                        <span
                          className="truncate text-xs text-zinc-500"
                          title={r.lastMessagePreview ?? undefined}
                        >
                          {r.lastMessagePreview ?? t("yeniSohbet")}
                        </span>
                        {r.unread ? (
                          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Sol: aktif sohbet */}
        <div
          className={`min-h-0 sm:order-2 ${selected ? "flex" : "hidden sm:flex"} flex-col`}
          onFocus={(e) => setTypingInThread(isPhoneLike() && isEditableElement(e.target))}
          onBlur={(e) => {
            const next = e.relatedTarget;
            setTypingInThread(
              isPhoneLike() && next instanceof Element && e.currentTarget.contains(next) && isEditableElement(next),
            );
          }}
        >
          {selected ? (
            <>
              {activePortal && selectedName ? null : (
                /* Mobil geri — ad çözülmese de her zaman (çıkmaz ekran olmasın).
                   Sohbet çizilince geri oku bağlam şeridine taşınır. */
                <button
                  type="button"
                  onClick={closeThread}
                  className="border-b border-zinc-950/5 px-4 py-3 text-left text-xs text-zinc-500 sm:hidden"
                >
                  {t("kisiler")}
                </button>
              )}
              {activePortal && selectedName ? (
                <>
                  {/* Bağlam şeridi — bu konuşmada hangi taraftayım? İki rolü olan
                      kullanıcı yönü buradan değiştirebilir (yeni sohbet yönü).
                      Telefonda TEK satır (mobil denetim g04): solda geri oku
                      (eski ayrı "← Kişiler" satırı), yön seçicisi varsa cümle
                      çekilir — seçicinin etkin düğmesi aynı bilgiyi verir;
                      cümle ekran okuyucu için durur. */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-zinc-950/5 bg-zinc-50/60 px-4 py-2 max-sm:flex-nowrap max-sm:px-2 max-sm:py-1.5">
                    <button
                      type="button"
                      onClick={closeThread}
                      aria-label={t("kisilereDon")}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900 sm:hidden"
                    >
                      <ArrowLeft aria-hidden className="size-5" />
                    </button>
                    <span
                      className={cn(
                        "text-xs text-zinc-600 max-sm:min-w-0 max-sm:flex-1",
                        myPortals.length === 2 && "max-sm:sr-only",
                      )}
                    >
                      {t.rich(activePortal === "satinalma" ? "buKonusmadaAlicisiniz" : "buKonusmadaSaticisiniz", {
                        name: selectedName,
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </span>
                    {/* Seçici iki işlem rolü olan HER pakette (gözden geçirme
                        webA-08): Gold altında da kapalı yön (alıcı) kilitli
                        görünür — seçilirse sohbet okunur ve Gold çağrısı çıkar.
                        Gizlenseydi, firmayla yalnız alıcı yönlü konuşması olan
                        kullanıcı (tek satıra sabit) her pakete açık satıcı
                        yönüne geçemezdi. */}
                    {myPortals.length === 2 ? (
                      /* Telefonda şeridi dolduran iki eşit düğme, 40 px yükseklik
                         (mobil denetim g04: 20 px'lik düğmelere parmakla
                         basılamıyordu). */
                      <div className="ml-auto flex gap-1 rounded-lg bg-zinc-100 p-0.5 max-sm:min-w-0 max-sm:flex-1">
                        {PORTAL_ORDER.map((p) => (
                          <button
                            key={p}
                            type="button"
                            // Telefonda bağlam cümlesi görsel olarak çekildiği için
                            // etkin yön yalnız bu düğmede görünür → durum programatik de.
                            aria-pressed={activePortal === p}
                            onClick={() =>
                              setSelected({ id: selected.id, portal: p })
                            }
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition max-sm:min-h-10 max-sm:flex-1 max-sm:justify-center max-sm:px-3",
                              activePortal === p
                                ? "bg-white shadow-sm " +
                                    (p === "satinalma"
                                      ? "text-blue-700"
                                      : "text-emerald-700")
                                : "text-zinc-500 hover:text-zinc-800",
                            )}
                          >
                            {newChatPortals.includes(p) ? null : (
                              <Lock
                                aria-hidden
                                data-testid={`inbox-direction-locked-${p}`}
                                className="size-3"
                              />
                            )}
                            {p === "satinalma" ? t("aliciOlarak") : t("saticiOlarak")}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1">
                    <CompanyMessageThread
                      key={`${activePortal}:${selected.id}`}
                      portal={activePortal}
                      otherPartyId={selected.id}
                      otherPartyName={selectedName}
                      bare
                    />
                  </div>
                </>
              ) : nameQuery.isError ? (
                <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center">
                  <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
                  <p className="text-sm font-medium text-zinc-600">
                    {t("sohbetAcilamadi")}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-zinc-400">
                    {t("sohbetAcilamadiAciklama")}
                  </p>
                </div>
              ) : (
                <div
                  className="flex-1 space-y-3 p-4"
                  aria-hidden
                  data-testid="inbox-thread-skeleton"
                >
                  <div className="h-10 w-1/2 animate-pulse rounded-lg bg-zinc-100" />
                  <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
                  <div className="h-16 w-2/3 animate-pulse rounded-lg bg-zinc-100" />
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-zinc-50 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-600">{t("birKisiSec")}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {t("soldanBirFirmaSecerekSohbete")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
