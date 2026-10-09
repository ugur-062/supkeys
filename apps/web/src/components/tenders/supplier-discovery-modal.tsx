"use client";

import { useLocale, useTranslations } from "next-intl";
import { recipientLocale, type Locale } from "@rothern/i18n";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useInviteConnection } from "@/hooks/use-company-connections";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import {
  emailSiteMismatch,
  isInviteAccepted,
  isInviteQueued,
  isInviteSent,
  queuedSendTime,
} from "@/lib/tenders/external-invite-status";
import { MAX_PENDING_EXTERNAL_INVITES } from "@/lib/tenders/quick-draft";
import {
  ExternalSearchError,
  clearPendingExternalSearch,
  readPendingExternalSearch,
  resumeExternalSupplierSearch,
  savePendingExternalSearch,
  searchExternalSuppliers,
  useExternalTenderInvite,
  useInviteDiscoveredMembers,
  useSupplierDiscovery,
  type DiscoveryCandidate,
  type DiscoveryIncompleteReason,
  type DiscoveryScope,
  type ExternalCandidate,
  type ExternalDiscoveryResult,
  type ExternalInviteStatus,
  type ExternalInviteTarget,
  type ExternalSearchFailureKind,
  type ExternalSearchOptions,
  type MemberInviteStatus,
} from "@/hooks/use-supplier-discovery";
import { InviteLocaleSelect } from "@/components/company/invite-locale-select";
import { useFormatDate } from "@/i18n/domain";
import { CountryLabel } from "@/components/ui/country-flag";
import { useListingDetail } from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { safeExternalUrl } from "@/lib/safe-url";
import { useVerificationGateCopy } from "@/components/company/verification-gate";
import { cn } from "@/lib/utils";
import axios from "axios";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  Clock,
  Globe,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A: platform dizininden ihale
 * kategorileriyle ya da vitrinindeki ürünle kalemlere eşleşen, bağlantısız
 * firmalar. Talepten açılışta (2026-09-28, kullanıcı: "sistemimize kayıtlıysa
 * doğrudan davet etsin") üye DOĞRUDAN TALEBE davet edilir — bağlantı şartı
 * yok; talepsiz açılışta eskisi gibi BAĞLANTI daveti gider.
 *
 * ELLE YOL (2026-10-08): yayın sonrası otomatik tur bulduğunu kendisi davet
 * eder; alıcının SEÇİP davet ettiği tek yer bu pencere. Aynı gün uçtan uca
 * gözden geçirmede düzeltilenler: talep bağlamı yüklenirken yanlış "önce
 * kategori seçin" durumu; web aramasının bulduğu Rothern üyesinin sessizce
 * düşmesi; "e-postası yok" diyen yanlış boş durum metni; gönderimden sonra
 * gönderilemeyen/atlanan adayların seçiminin kaybolması; davet edilemeyeceği
 * kesinleşen satırın yeniden seçilebilmesi.
 *
 * CANLI DOĞRULAMA TURU (2026-10-09) — web sekmesi, kusur numaralarıyla:
 *  - D4  PENCEREYİ KAPATMAK ÜCRETLİ ARAMAYI ATMAZ. Sonuçlar, seçim, sekme ve
 *        yazılan adresler BAĞLAM başına bir oturumda yaşar (`DiscoverySession`,
 *        React Query önbelleğinde): Escape / arka plan / X sonrası yeniden
 *        açılışta her şey yerindedir; talep sayfasındaki iki giriş (görünür
 *        düğme ve ⋮ menüsü — iki ayrı pencere örneği) AYNI oturumu görür.
 *        Bağlam = talep (talepsiz açılışta kategori + kalem + ülke); başka
 *        bağlam başka oturumdur, yeni arama sonuç başarıyla gelince yeniler.
 *        Pencere kapalıyken süren arama sürer, sonucu oturuma yazılır. Onay
 *        sorusu yok. Oturum girişte/çıkışta önbellekle birlikte silinir.
 *  - D7  SONUÇ GÖVDEDE KALIR: bulunamadı · bulundu ama hiçbiri davet edilemiyor
 *        (firmalar nedenleriyle listelenir) · başarısız (mesaj + "Yeniden ara").
 *        Hata başına TEK mesaj: istek `skipErrorToast` taşır, mesaj gövdededir
 *        (pencere kapalıysa görünmeyeceği için o durumda tek toast).
 *  - D2  Sıradaki davet "Gönderildi" DEĞİL "Sıraya alındı" + planlanan an
 *        (`sendAfter`, ürün saat dilimi). "Gönderildi" yalnız SENT'te.
 *  - D9  Adayın karşıladığı kalemler, üyenin ülkesi (`CountryLabel`), adres
 *        yakın zamanda davet aldıysa gecikme / özet notu.
 *  - D10 "Tümünü seç" / "Seçimi temizle"; başlık kısaldı, açıklama ve
 *        altbilgi kaydırılan gövdeye alındı → liste pencerenin çoğunu kullanır;
 *        üye satırı dar ekranda sarar.
 *  - D11 Adresi geçersiz seçili satır alanında işaretlenir ve gönder
 *        düğmesindeki sayıya girmez.
 *  - D12 Bekleme bloğu `role="status"`, dürüst süre metni, geçen süre sayacı.
 *  - D13 Adresin alan adı firmanın sitesinden farklıysa "doğrulayın" ipucu.
 *  - Kısmi sonuç: geçişlerden (yurt içi / yurt dışı) biri yanıt vermediyse uç
 *        hata dönmez; yanıt verenin adayları listelenir, yanıt vermeyen adıyla
 *        söylenir ve "Yeniden ara" eldeki adayların ÜSTÜNE ekler.
 *
 * EKSİK GEÇİŞİN NEDENİ + YALNIZ EKSİĞİ ARAMA (2026-10-09, API `incompleteReasons`
 * / `incompleteMessages` / istekte `scopes`):
 *  - Kısmi sonuç notundaki "Yeniden ara" YALNIZ eksik kalan geçişi arar
 *        (`scopes`) — yanıt vermiş geçiş ikinci kez aranmaz ve ÖDENMEZ; yeni
 *        adaylar eldeki listeye eklenir (yinelenen yok; seçim, yazılan adres,
 *        dil ve gönderim durumları yerinde). Ana "Web'de Ara" düğmesi yeni
 *        aramadır: her şeyi arar.
 *  - Not metni nedene göre: süre yetmedi · arama hizmeti yanıt vermedi (ikisinde
 *        "Yeniden ara") · AI bütçesi reddetti (sunucunun metni gösterilir,
 *        "Yeniden ara" YOK — yeniden aramak sonucu değiştirmez).
 *  - Yalnız eksiği arayan istek tek geçiş koşar; o da düşerse uç HATA döner:
 *        bütçe reddi (403 `AI_BUDGET_EXCEEDED`) nota işlenir (hata kutusu ve
 *        "Yeniden ara" yok), diğer hata her zamanki hata kutusudur ve kutunun
 *        "Yeniden ara"sı düşen aramayı (yine yalnız eksiği) yineler. İki durumda
 *        da eldeki sonuç ve not durur.
 *  - ESKİ API (yanıtta `incompleteReasons` yok): `scopes` GÖNDERİLMEZ (alanı
 *        tanımayan uç gövdeyi 400 ile reddeder); not eski genel metindir ve
 *        "Yeniden ara" eskisi gibi bütün geçişleri arayıp üstüne ekler.
 *
 * GÖZDEN GEÇİRME (2026-10-09, R2 / R3 / R4 / R6):
 *  - R2  Sonuç ve hata kutusu YALNIZ web sekmesinin gövdesinde çizilir: arama
 *        biterken pencere "Platformda" sekmesindeyse sonuç hiçbir yerde
 *        görünmüyordu → o durumda sekmeyi gösteren tek toast; alıcı "Platformda"
 *        sekmesindeyken süren aramada web sekmesinin simgesi döner.
 *  - R3  Üye satırının durumu (davetli / reddedildi) oturumda yaşar ama SUNUCUNUN
 *        yanıtı önce gelir: her başarılı platform yüklemesi, yanıtın "davetli
 *        değil" dediği firmayı oturumdan düşürür (davet düzenleme formunda
 *        kaldırılmış, ülke kapsamı genişletilmiş olabilir).
 *  - R4  "Yeniden ara" düğmesi arama başlayınca kaybolur (hata kutusu) ya da
 *        pasifleşir: odak önce kalıcı bekleme bloğuna alınır.
 *  - R6  Gönder şeridindeki düğme daralabilir (uzun RU etiketi 375 px'te
 *        pencereden taşıyordu); etiket iki satıra sarar.
 *
 * CANLI YENİDEN DOĞRULAMA (2026-10-09, N1 / N2 / N4 / N5):
 *  - N1  WEB ARAMASI ZAMAN UYUMSUZ. Arama gündüz 70-90 sn sürüyor, tek isteğe
 *        sığmıyordu (vekilin 100 sn sınırı; bitmiş ücretli araştırma 503 ile
 *        atılıyordu). Arama sunucuda başlatılır (`…/external/start` → kimlik) ve
 *        3 sn'de bir yoklanır; kimlik OTURUMDA saklıdır (`searchId`). Yoklamayı
 *        başlatan pencerenin döngüsü sürdürür (pencere kapansa, sayfadan çıkılsa
 *        da); döngüsü olmayan süren arama (`followedSearches`ta yok — sayfa
 *        yeniden bağlandı) bağlamın bağlanan ilk penceresince DEVRALINIR, ikinci
 *        ücretli arama başlamaz. Kimlik bilinmiyorsa (404: API yeniden başladı)
 *        "arama yarıda kesildi"; 8 dakikada sonuç yoksa yoklama bırakılır.
 *        Başlatma ucu yoksa (eski API) eş zamanlı uca düşülür ve bağlamın oturumu
 *        bunu hatırlar (`syncOnly`). Bekleme metni dürüst: genellikle bir-iki
 *        dakika, yoğun saatlerde daha uzun.
 *  - N2  "Platformda" sekmesi iki gruptur: GÜÇLÜ eşleşenler (sunucunun
 *        `strongMatch`i) önce — toplu davet YALNIZ onlara; yalnız aynı sektörde
 *        olanlar ayrı başlık ve açıklamayla, tek tek davet edilir. Eskiden
 *        birincil düğme "Hepsini talebe davet et" yalnız segment düzeyinde
 *        eşleşen üyeleri de davet ediyordu.
 *  - N4  Sunucunun HAM varsayılan metni basılmaz (`serverUserText`): işlenmemiş
 *        500'ün "Internal server error"ı yerine pencerenin kendi çevrilmiş
 *        yedeği. Pencerenin bütün hata metinleri `windowErrorMessage`ten geçer.
 *  - N5  390 px: adres alanı simgesini içinde taşır (simge tek başına satır
 *        tutmuyor), adres + dil en çok iki satır; bölge yer tutucusu kısa;
 *        gönderim sonucu toast yığını DEĞİL gönder şeridinde tek özet satırı
 *        (her satır kendi sonucunu zaten yazar; telefonda toast'lar başlığı ve
 *        kapat düğmesini örtüyordu). Toast yalnız özet görünmüyorsa.
 *
 * GÖZDEN GEÇİRME (2026-10-09, R6-02) — SÜREN ARAMA SAYFA YENİLEMEYİ AŞAR:
 *  Oturum da onu izleyen döngü de bellektedir; sayfa yenilenince (F5, sekmeyi
 *  kapatıp geri açma) ikisi birlikte ölüyordu → N1'in "devralma" dalı gerçekte
 *  hiç çalışmıyor, pencere "aranıyor" demiyor, ikinci tıklama ikinci ücretli
 *  aramayı başlatıyordu. Sunucu kimliği verdiği AN arama bağlam başına
 *  `sessionStorage`a yazılır (`savePendingExternalSearch`: kimlik, başlangıç anı,
 *  kip, geçişler, kalem adları, bölge); pencere bağlanırken önbellekte süren
 *  arama yoksa kayıttan oturumu kurar ve N1'in devralması aynı aramayı yoklar —
 *  sayaç gerçek geçen süreden sürer, "Web'de Ara" pasiftir. Kayıt arama BİTİNCE
 *  silinir (sonuç / sunucuda düştü / kimlik bilinmiyor / süre doldu); BIRAKILAN
 *  yoklamada silinmez (oturum silindi: çıkış depoyu zaten temizler, aynı
 *  kullanıcı geri girerse arama yine bulunur).
 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Yeniden denemenin sonucu değiştirmeyeceği sonuçlar — satır kilitlenir (adres düzeltilirse açılır). */
const FINAL_EXTERNAL_STATUSES: ReadonlySet<ExternalInviteStatus> = new Set([
  "ALREADY_INVITED",
  "SKIPPED_REGISTERED",
  "OPTED_OUT",
  "CONSENT_REQUIRED",
  "COUNTRY_BLOCKED",
]);
/**
 * N5 — adres satırındaki UZUN durum metni ("Sıraya alındı · planlanan gönderim: …",
 * "Bu ülkeye izinsiz davet gönderilmiyor"): dar ekranda dil seçicinin yanında
 * kalan genişliğe sığar ve orada sarar; geniş ekranda eskisi gibi kendi genişliğinde.
 */
const ROW_STATUS_FIT = "min-w-0 flex-[1_1_8rem] sm:flex-initial";
/** Aramaya giden kalem tavanı — API `MAX_ITEMS_IN_PROMPT` ile aynı (kalem sıra numaraları buna göre). */
const MAX_SEARCH_ITEMS = 15;

/** Web araması satırı: aday + aramanın kalem listesine göre çözülmüş "karşıladığı kalemler". */
interface WebRow {
  /** Satır kimliği — sonuçlar birleştirilince de değişmez (seçim/adres/dil buna bağlı). */
  id: number;
  c: ExternalCandidate;
  /** Adayın karşıladığı kalem ADLARI (aramaya giden listeden; liste sonradan değişse de doğru kalır). */
  covered: string[];
  /** Aramaya giden kalem sayısı. */
  itemTotal: number;
}

/** Listelenmeyen (davet edilemeyen) aday ve nedeni. */
type ExcludedReason = "ALREADY_INVITED" | "CONSENT_REQUIRED" | "SKIPPED_REGISTERED" | "NO_EMAIL" | "OTHER";
interface ExcludedFirm {
  name: string;
  country: string | null;
  reason: ExcludedReason;
}

/** Bir web aramasının (ya da birleştirilmiş aramaların) pencerede tutulan sonucu. */
interface WebResults {
  /** E-posta daveti gönderilebilecek adaylar. */
  rows: WebRow[];
  /** Rothern üyesi çıkan adaylar — e-posta değil doğrudan talebe davet (yalnız talepten açılışta). */
  members: WebRow[];
  excluded: ExcludedFirm[];
  /** Yanıt vermeyen geçişler (boş = arama tam). */
  incompleteScopes: DiscoveryScope[];
  /** Eksik geçişin nedeni; yoksa (eski API / tanınmayan neden) not genel metindir. */
  incompleteReasons: Partial<Record<DiscoveryScope, DiscoveryIncompleteReason>>;
  /** Bütçe reddinde sunucunun kullanıcı metni (istek dilinde). */
  incompleteMessages: Partial<Record<DiscoveryScope, string>>;
  /** Uç istekte `scopes` tanıyor: "Yeniden ara" yalnız eksik geçişi arayabilir. */
  scopedRetry: boolean;
}

type SearchMode = "replace" | "merge";

/** Sunucunun AI bütçe reddinin kodu (`AiBudgetExceededException`, 403). */
const AI_BUDGET_EXCEEDED = "AI_BUDGET_EXCEEDED";

const nameKey = (name: string) => name.trim().toLowerCase();

function coveredItems(c: ExternalCandidate, items: readonly string[]): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const n of c.matchedItems ?? []) {
    const name = items[n - 1];
    if (!name || seen.has(n)) continue;
    seen.add(n);
    out.push(name);
  }
  return out;
}

function excludedReason(status: string, hasEmail: boolean): ExcludedReason {
  if (status === "ALREADY_INVITED" || status === "INVITED") return "ALREADY_INVITED";
  if (status === "CONSENT_REQUIRED") return "CONSENT_REQUIRED";
  if (status === "MEMBER") return "SKIPPED_REGISTERED";
  return hasEmail ? "OTHER" : "NO_EMAIL";
}

function uniqueByName(list: readonly ExcludedFirm[]): ExcludedFirm[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const key = nameKey(x.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Yanıtı pencerenin üç listesine ayırır. E-POSTASI OLMAYAN FİRMA LİSTELENMEZ
 * (2026-09-17, kullanıcı kararı); zaten davetli, kayıtlı üye (talepsiz
 * açılışta) ve önceden onay isteyen ülkedeki aday da e-posta listesine girmez
 * (2026-09-27: "davetli olanlara bir daha gitmesin") — ama KAYBOLMAZ: nedeniyle
 * `excluded` listesine düşer (D7).
 */
function readWebResults(
  res: ExternalDiscoveryResult,
  items: readonly string[],
  withMembers: boolean,
  nextId: () => number,
): WebResults {
  const rows: WebRow[] = [];
  const members: WebRow[] = [];
  const excluded: ExcludedFirm[] = [];
  const seenMembers = new Set<string>();
  for (const c of res.companies) {
    const status = c.status ?? "SUGGESTED";
    const hasEmail = !!(c.email ?? "").trim();
    if (status === "SUGGESTED" && hasEmail) {
      rows.push({ id: nextId(), c, covered: coveredItems(c, items), itemTotal: items.length });
      continue;
    }
    if (status === "MEMBER" && withMembers && c.memberCompanyId) {
      // Aynı üyenin ikinci adresi tek satır.
      if (!seenMembers.has(c.memberCompanyId)) {
        seenMembers.add(c.memberCompanyId);
        members.push({ id: nextId(), c, covered: coveredItems(c, items), itemTotal: items.length });
      }
      continue;
    }
    excluded.push({ name: c.name, country: c.country ?? null, reason: excludedReason(status, hasEmail) });
  }
  return {
    rows,
    members,
    excluded: uniqueByName(excluded),
    incompleteScopes: res.incompleteScopes ?? [],
    incompleteReasons: res.incompleteReasons ?? {},
    incompleteMessages: res.incompleteMessages ?? {},
    scopedRetry: res.supportsScopes === true,
  };
}

/** Kısmi sonuçta yeniden aranabilecek geçişler — bütçenin reddettiği geçiş yeniden denenmez. */
function retriableScopes(web: WebResults): DiscoveryScope[] {
  return web.incompleteScopes.filter((scope) => web.incompleteReasons[scope] !== "BUDGET");
}

/**
 * N4 — Nest'in / HTTP'nin KENDİ varsayılan gövde metinleri: işlenmemiş istisnanın
 * "Internal server error"ı ve mesajsız fırlatılan 5xx'in durum adı. Sunucunun
 * kullanıcı için YAZMADIĞI bu metinler pencerede basılmaz (Türkçe pencerede ham
 * İngilizce metin çıkıyordu).
 */
const RAW_SERVER_DEFAULT =
  /^(internal server error|not implemented|bad gateway|service unavailable|gateway timeout|http version not supported)$/i;

/** Sunucunun metni kullanıcıya gösterilebilir mi → metin; değilse null (pencere kendi yedeğini yazar). */
function serverUserText(status: number | null, message: string | null | undefined): string | null {
  const text = (message ?? "").trim();
  if (!text) return null;
  if ((status === null || status >= 500) && RAW_SERVER_DEFAULT.test(text)) return null;
  return text;
}

/**
 * Pencerenin hata metni: sunucunun KULLANICI metni (doğrulama, yetki, bütçe,
 * çevrilmiş 5xx), yoksa pencerenin kendi çevrilmiş yedeği. HTTP yanıtı olmayan
 * hata (ağ, beklenmeyen istisna) her zaman yedeği yazar.
 */
function windowErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  return serverUserText(err.response?.status ?? null, extractErrorMessage(err, "")) ?? fallback;
}

/** Düşen web aramasının okunmuş hâli — HTTP hata yanıtı ve başlamış aramanın sonuçsuz bitişi tek biçimde. */
interface SearchFailure {
  /** Başlamış aramanın bitiş türü (yarıda kesildi / süre doldu / sunucuda düştü); HTTP hatasında null. */
  kind: ExternalSearchFailureKind | null;
  status: number | null;
  /** Sunucunun makine kodu (`AI_BUDGET_EXCEEDED`…). */
  code: string | null;
  /** Sunucunun kullanıcı metni (ham varsayılan süzülmüş); yoksa null. */
  message: string | null;
}

function readSearchFailure(err: unknown): SearchFailure {
  if (err instanceof ExternalSearchError) {
    return {
      kind: err.kind,
      status: err.statusCode,
      code: err.code,
      message: serverUserText(err.statusCode, err.serverMessage),
    };
  }
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? null;
    const code = (err.response?.data as { code?: unknown } | undefined)?.code;
    return {
      kind: null,
      status,
      code: typeof code === "string" ? code : null,
      message: serverUserText(status, extractErrorMessage(err, "")),
    };
  }
  return { kind: null, status: null, code: null, message: null };
}

/**
 * Yalnız eksiği arayan istek bütçe reddiyle DÜŞTÜ: eldeki sonuç durur, aranan
 * eksik geçişlerin notu "bütçe reddi" olur (sunucunun metniyle; metin yoksa
 * not kendi genel cümlesini yazar).
 */
function markBudgetRefused(web: WebResults, scopes: readonly DiscoveryScope[], message: string | null): WebResults {
  const incompleteReasons = { ...web.incompleteReasons };
  const incompleteMessages = { ...web.incompleteMessages };
  for (const scope of scopes) {
    if (!web.incompleteScopes.includes(scope)) continue;
    incompleteReasons[scope] = "BUDGET";
    if (message) incompleteMessages[scope] = message;
    else delete incompleteMessages[scope];
  }
  return { ...web, incompleteReasons, incompleteMessages };
}

/** Adayı tanıtan anahtarlar: adres, ad ve site konağı (sunucu da tek yanıtta aynı siteden tek adres verir). */
function candidateKeys(c: ExternalCandidate): string[] {
  const keys = [`n:${nameKey(c.name)}`];
  const email = (c.email ?? "").trim().toLowerCase();
  if (email) keys.push(`e:${email}`);
  const site = safeExternalUrl(c.website);
  if (site) {
    try {
      keys.push(`h:${new URL(site).hostname.toLowerCase().replace(/^www\./, "")}`);
    } catch {
      // Okunamayan site adresi anahtar üretmez.
    }
  }
  return keys;
}

/**
 * Kısmi sonucun ÜSTÜNE yeni aramayı ekler: eldeki satırlar (seçim, yazılan
 * adres, dil) yerinde kalır; yeni yanıttan yalnız listede olmayan adaylar
 * (adres, ad ve site eşleşmiyorsa) sona eklenir. Bir geçiş, iki aramanın
 * HERHANGİ birinde yanıt verdiyse artık eksik değildir.
 *
 * `searched`: yeni aramanın koştuğu geçişler (null = hepsi). Yalnız eksiği
 * arayan aramada ARANMAYAN eksik geçiş (bütçenin reddettiği) notuyla durur;
 * aranan ve yine yanıt vermeyen geçiş YENİ nedeniyle durur.
 */
function mergeWebResults(prev: WebResults, next: WebResults, searched: readonly DiscoveryScope[] | null): WebResults {
  const known = new Set<string>();
  const remember = (c: ExternalCandidate) => {
    for (const key of candidateKeys(c)) known.add(key);
  };
  const isKnown = (c: ExternalCandidate) => candidateKeys(c).some((key) => known.has(key));
  for (const r of prev.rows) remember(r.c);
  for (const m of prev.members) remember(m.c);
  const memberIds = new Set(prev.members.map((m) => m.c.memberCompanyId));
  const rows = [...prev.rows];
  for (const r of next.rows) {
    if (isKnown(r.c)) continue;
    remember(r.c);
    rows.push(r);
  }
  const members = [...prev.members];
  for (const m of next.members) {
    if (memberIds.has(m.c.memberCompanyId) || isKnown(m.c)) continue;
    memberIds.add(m.c.memberCompanyId);
    remember(m.c);
    members.push(m);
  }
  // İlk aramada listelenen (bu arada davet edilmiş olabilir) firma ikinci
  // yanıtta "zaten davetli" diye gelir — satırı duruyor, ayrıca yazılmaz.
  const excluded = uniqueByName([...prev.excluded, ...next.excluded]).filter((x) => !known.has(`n:${nameKey(x.name)}`));
  const failedAgain = (scope: DiscoveryScope) => next.incompleteScopes.includes(scope);
  const incompleteScopes = prev.incompleteScopes.filter(
    (scope) => failedAgain(scope) || (searched !== null && !searched.includes(scope)),
  );
  const incompleteReasons: WebResults["incompleteReasons"] = {};
  const incompleteMessages: WebResults["incompleteMessages"] = {};
  for (const scope of incompleteScopes) {
    const source = failedAgain(scope) ? next : prev;
    const reason = source.incompleteReasons[scope];
    const message = source.incompleteMessages[scope];
    if (reason) incompleteReasons[scope] = reason;
    if (message) incompleteMessages[scope] = message;
  }
  return {
    rows,
    members,
    excluded,
    incompleteScopes,
    incompleteReasons,
    incompleteMessages,
    // `scopes` taşıyan isteği kabul eden uç alanı tanıyordur.
    scopedRetry: searched !== null || next.scopedRetry,
  };
}

/**
 * Pencerenin BAĞLAM başına oturumu (D4). Bileşen durumu DEĞİL: React Query
 * önbelleğinde tutulur — pencere kapanınca, aynı talebin öteki pencere
 * örneğinde ve sayfa bağlıyken yerinde kalır; oturum değişiminde
 * (`queryClient.clear()`) silinir. Yalnız düz veri (dizi / nesne) taşır.
 */
interface DiscoverySession {
  tab: "platform" | "external";
  /** Web aramasının sonucu (null = bu bağlamda henüz tamamlanmış arama yok). */
  web: WebResults | null;
  /** Süren aramanın başlangıç anı (ms); null = arama yok. Sayaç gerçek geçen süreyi buradan okur. */
  searchSince: number | null;
  /** Süren aramanın kipi: `merge` eldeki listeyi gizlemez (alıcı seçmeye devam eder). */
  searchMode: SearchMode;
  /**
   * Son başlatılan aramanın geçişleri (null = hepsi). Arama düşerse hata
   * kutusundaki "Yeniden ara" DÜŞEN aramayı yineler: yalnız eksiği arayan arama
   * düştüyse yine yalnız eksik aranır.
   */
  searchScopes: DiscoveryScope[] | null;
  /** Süren aramanın kimliği — sonucu yalnız son başlatılan arama yazar. */
  searchToken: number;
  /**
   * N1 — süren aramanın SUNUCUDAKİ kimliği (başlatma ucu verdi); null = henüz
   * verilmedi ya da arama eş zamanlı uçta. Yeniden bağlanan pencere / sayfa
   * aynı aramayı bununla izler.
   */
  searchId: string | null;
  /** Süren aramaya giden kalem adları — "karşıladığı kalemler" sonuç gelince buna göre çözülür. */
  searchItems: string[];
  /** Başlatma ucu bu API'de yok (404 görüldü): bağlamın sonraki aramaları doğrudan eş zamanlı uca gider. */
  syncOnly: boolean;
  searchError: string | null;
  region: string;
  /** Satır kimliği → yazılan adres. */
  emailDrafts: Record<number, string>;
  /**
   * Satır başına davet dili — yalnız kullanıcı DEĞİŞTİRDİYSE burada; yoksa
   * `rowLocale` firmanın ülkesinden/adresinden türetir (e-posta düzeltilince
   * varsayılan da güncellensin).
   */
  langDrafts: Record<number, Locale>;
  /** Seçili satır kimlikleri. */
  selected: number[];
  /** Adres başına GERÇEK gönderim sonucu (QUEUED + planlanan an / SENT / FAILED / …). */
  sendStatus: Record<string, { status: ExternalInviteStatus; sendAfter: string | null }>;
  /**
   * N5 — SON gönderimin özeti (gönder şeridinde tek satır): kaç davet sıraya
   * alındı / gitti / gönderilemedi. Yeni gönderim üstüne yazar, yeni arama siler.
   */
  sendNote: SendNote | null;
  /** Bu pencereden davet edilen üyeler (firma kimliği). */
  invited: string[];
  /** Üye davetinin satır başına sonucu (NOT_ELIGIBLE satırı yeniden denenmez). */
  memberStatus: Record<string, MemberInviteStatus>;
}

interface SendNote {
  queued: number;
  sent: number;
  notSent: number;
}

const EMPTY_SESSION: DiscoverySession = {
  tab: "platform",
  web: null,
  searchSince: null,
  searchMode: "replace",
  searchScopes: null,
  searchToken: 0,
  searchId: null,
  searchItems: [],
  syncOnly: false,
  searchError: null,
  region: "",
  emailDrafts: {},
  langDrafts: {},
  selected: [],
  sendStatus: {},
  sendNote: null,
  invited: [],
  memberStatus: {},
};

const SESSION_QUERY_ROOT = "supplier-discovery-session";
/** Sayfadan çıkıldıktan sonra oturumun (ücretli sonuçların) önbellekte kalma süresi. */
const SESSION_GC_MS = 30 * 60_000;

let searchTokenSeq = 0;
let rowIdSeq = 0;
/** Bağlam başına AÇIK pencere sayısı — arama biterken sonucu gören bir pencere var mı. */
const openWindows = new Map<string, number>();
/**
 * N1 — İZLENEN süren aramalar (bağlam + arama kimliği başına tek döngü). Oturumda
 * süren ama burada olmayan arama sahipsizdir (sayfa yeniden bağlandı): bağlamın
 * bağlanan ilk penceresi devralır; talep sayfasındaki iki pencere örneği aynı
 * aramayı iki kez yoklamaz.
 */
const followedSearches = new Set<string>();
const followId = (context: string, token: number) => `${context}#${token}`;

/** Bir web aramasının izleme bilgisi — başlatan da devralan da aynı biçimle sonuca bağlar. */
interface SearchRun {
  key: QueryKey;
  context: string;
  token: number;
  mode: SearchMode;
  /** Yalnız bu geçişler arandı (null = hepsi). */
  scoped: DiscoveryScope[] | null;
  /** Aramaya giden kalem adları. */
  items: string[];
  /** Aramanın başladığı an (ms). */
  since: number;
  /** Aramaya giden bölge metni (R6-02: süren aramanın kaydına yazılır). */
  region: string;
}

/** Şehir + ülke (bayrak + ad; ISO kodu ya da emoji basılmaz). */
function Place({ city, country }: { city?: string | null; country?: string | null }) {
  if (!city && !country) return null;
  return (
    <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {city ? (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          {city}
        </span>
      ) : null}
      {country ? <CountryLabel code={country} /> : null}
    </span>
  );
}

export function SupplierDiscoveryModal({
  isOpen,
  onClose,
  categoryIds,
  itemNames = [],
  listingId,
  targetCountries,
  collected = [],
  onCollect,
}: {
  isOpen: boolean;
  onClose: () => void;
  categoryIds: string[];
  /** Faz B — web aramasına bağlam (kalem adları). */
  itemNames?: string[];
  /** Faz C — dış davet gönderimi bu ihale bağlamıyla yapılır. */
  listingId?: string;
  /** Yayın öncesi — web aramasının konumu talebin görünürlük ülkelerinden (boş = tüm ülkeler). */
  targetCountries?: string[];
  /**
   * YAYIN ÖNCESİ TOPLAMA (2026-09-27): talep henüz yoksa e-posta HEMEN
   * GİTMEZ — seçilen alıcılar (adres + dil + ülke) forma eklenir, yayın
   * sonrası talebe özel davet (`external-tender-invite`) gider. Eskiden bu
   * kipte genel "Rothern'e katıl" daveti (`invite-by-email/batch`)
   * gidiyordu; talepten habersiz bir e-posta.
   */
  onCollect?: (invites: ExternalInviteTarget[]) => void;
  /** Forma eklenmiş adresler — satırda "Talebe eklendi" görünür. */
  collected?: string[];
}) {
  const tr = useTranslations("web.panel.requests.supplierDiscoveryModal");
  const gateCopy = useVerificationGateCopy();
  const tStatus = useTranslations("web.panel.requests.externalInviteStatus");
  const tAi = useTranslations("web.panel.requests.aiSuppliers");
  const tMember = useTranslations("web.panel.requests.memberInviteStatus");
  const uiLocale = useLocale() as Locale;
  const formatDate = useFormatDate();
  const uid = useId();
  const qc = useQueryClient();
  // listingId verildiyse (ihale detayından açılış) bağlamı kendisi çeker —
  // çağıranın kategori/kalem taşıması gerekmez.
  const detail = useListingDetail(listingId && isOpen ? listingId : "");
  const effCategoryIds =
    categoryIds.length > 0
      ? categoryIds
      : ((detail.data?.categoryIds as string[] | undefined) ?? []);
  // Boş / yalnız boşluk adlar düşer: sunucu da böyle sayar, kalem sıra
  // numaraları (`matchedItems`) iki tarafta aynı listeye bakmalı.
  const effItemNames = (
    itemNames.length > 0
      ? itemNames
      : ((detail.data?.items as Array<{ name?: string }> | undefined) ?? []).map((i) => i.name ?? "")
  )
    .map((n) => n.trim())
    .filter(Boolean);
  // Talepten açılışta bağlam detaydan gelir; çağıran vermediyse ve detay
  // henüz yüklenmediyse bekleme durumu.
  const contextLoading =
    !!listingId && categoryIds.length === 0 && itemNames.length === 0 && !detail.data && !!detail.isLoading;
  const canSearch = effCategoryIds.length > 0 || effItemNames.length > 0;
  const catKey = `${effCategoryIds.join(",")}|${effItemNames.join("|")}`;
  // BAĞLAM: talepten açılışta talebin kendisi (talep detayı pencere kapalıyken
  // okunmaz → kategori/kalem anahtarı kapanışta boşalır, bağlam sayılmaz);
  // talepsiz açılışta aramanın girdileri (kategori + kalem + görünürlük ülkesi).
  const contextKey = listingId ? `l:${listingId}` : `f:${catKey}|${(targetCountries ?? []).join(",")}`;

  // D4 — oturum bağlam başına önbellekte; yalnız `setQueryData` ile yazılır.
  //  - Bu sorgu hiç ÇEKMEZ (`enabled: false`) ve yeniden çizdirmez
  //    (`notifyOnChangeProps: []`): tek işi GÖZLEMCİ olmak — gözlemcisi olan
  //    kayıt çöpe gitmez (sayfa bağlıyken oturum durur), son gözlemci
  //    ayrılınca `SESSION_GC_MS` daha yaşar.
  //  - Okuma `useSyncExternalStore` ile önbelleğin kendisinden: React Query
  //    gözlemci bildirimlerini bir sonraki göreve erteler; adres kutusu gibi
  //    denetimli alanlar ise tuş vuruşuyla AYNI anda çizilmelidir (yoksa imleç
  //    sona atlar). Önbellek dinleyicisi eşzamanlı çağrılır.
  const sessionKey: QueryKey = [SESSION_QUERY_ROOT, contextKey];
  useQuery<DiscoverySession>({
    queryKey: sessionKey,
    queryFn: () => qc.getQueryData<DiscoverySession>(sessionKey) ?? EMPTY_SESSION,
    enabled: false,
    staleTime: Infinity,
    gcTime: SESSION_GC_MS,
    notifyOnChangeProps: [],
  });
  const subscribeSession = useCallback(
    (onChange: () => void) =>
      qc.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        if (key[0] === SESSION_QUERY_ROOT && key[1] === contextKey) onChange();
      }),
    [qc, contextKey],
  );
  const session = useSyncExternalStore(
    subscribeSession,
    () => qc.getQueryData<DiscoverySession>([SESSION_QUERY_ROOT, contextKey]) ?? EMPTY_SESSION,
    () => EMPTY_SESSION,
  );
  /** Belirli bir bağlamın oturumunu günceller (zaman uyumsuz işler başladıkları bağlama yazar). */
  const patchSession = (key: QueryKey, fn: (s: DiscoverySession) => DiscoverySession) =>
    qc.setQueryData<DiscoverySession>(key, (prev) => fn(prev ?? EMPTY_SESSION));
  const patch = (fn: (s: DiscoverySession) => DiscoverySession) => patchSession(sessionKey, fn);
  const {
    tab,
    web,
    region,
    emailDrafts,
    langDrafts,
    sendStatus,
    sendNote,
    memberStatus,
    searchError,
    searchMode,
    searchSince,
  } = session;
  const selectedExt = new Set(session.selected);
  const invited = new Set(session.invited);
  const searching = searchSince !== null;
  const setTab = (next: DiscoverySession["tab"]) => patch((s) => ({ ...s, tab: next }));
  const setRegion = (next: string) => patch((s) => ({ ...s, region: next }));
  const setEmailDrafts = (fn: (d: Record<number, string>) => Record<number, string>) =>
    patch((s) => ({ ...s, emailDrafts: fn(s.emailDrafts) }));
  const setLangDrafts = (fn: (d: Record<number, Locale>) => Record<number, Locale>) =>
    patch((s) => ({ ...s, langDrafts: fn(s.langDrafts) }));
  const setSelectedExt = (next: Set<number> | ((sel: Set<number>) => Set<number>)) =>
    patch((s) => ({ ...s, selected: [...(typeof next === "function" ? next(new Set(s.selected)) : next)] }));

  const discovery = useSupplierDiscovery();
  const invite = useInviteConnection();
  const inviteMembers = useInviteDiscoveredMembers();
  // Platform önerileri pencere örneğine özgüdür: her açılışta yeniden çekilir.
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  // İlk yanıt gelene dek "öneri yok" boş durumu çizilmez (istek efektle başlar).
  const [platformLoaded, setPlatformLoaded] = useState(false);
  // Öneri çağrısı hatası (403 paket kilidi dahil) BOŞ SONUÇ DEĞİLDİR — arayüz
  // testi O-058: 403 "önerilebilecek yeni firma bulunamadı" diye gösteriliyordu.
  const [loadError, setLoadError] = useState<string | null>(null);
  // 403 TIER_REQUIRED (sayfa açıkken Gold düştü / süresi bitti): hata metninin
  // altında Gold CTA'sı; istemcideki firma verisi bayat olabileceği için karar
  // sunucunun koduna göre verilir (arayüz testi webB-04 yeniden doğrulama).
  const [tierLocked, setTierLocked] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Faz B/C durumları. Web aramasının bulduğu ROTHERN ÜYELERİ (adresi/sitesi
  // kayıtlı firmayla eşleşti) `web.members`ta: e-posta daveti gitmez, talebe
  // doğrudan davet edilir. Eskiden bu adaylar listeden sessizce düşüyordu.
  const sendExternal = useExternalTenderInvite();
  const sendLock = useSubmitLock();
  const collectMode = !listingId && !!onCollect;
  const collectedSet = new Set(collected);

  // Bu bağlamı GÖSTEREN açık pencere sayısı (arama biterken toast kararı).
  useEffect(() => {
    if (!isOpen) return;
    openWindows.set(contextKey, (openWindows.get(contextKey) ?? 0) + 1);
    return () => {
      const left = (openWindows.get(contextKey) ?? 1) - 1;
      if (left > 0) openWindows.set(contextKey, left);
      else openWindows.delete(contextKey);
    };
  }, [isOpen, contextKey]);
  const platformContext = useRef(contextKey);
  /** R4 — web sekmesinin KALICI bekleme bloğu: "Yeniden ara" kaybolurken odağın durağı. */
  const searchStatusRef = useRef<HTMLDivElement>(null);

  // Platform önerileri: her açılışta ve kategori bağlamı hazır olunca
  // (listingId'li açılışta detay sonradan yüklenir) yeniden çekilir — model
  // çağrısı yok, ücretsiz; "talebe davetli" bilgisi tazelenir.
  useEffect(() => {
    if (!isOpen) return;
    setPlatformLoaded(false);
    setLoadError(null);
    setTierLocked(false);
    // Başka bağlamın önerileri yeni bağlamda bir an bile okunmasın.
    if (platformContext.current !== contextKey) {
      platformContext.current = contextKey;
      setCandidates([]);
    }
    if (effCategoryIds.length === 0 && effItemNames.length === 0) return;
    // Pencere kapanırsa ya da bağlam değişirse geç gelen yanıt yazılmaz.
    let stale = false;
    // R3 — oturumda saklanan üye durumu (davetli / reddedildi) İSTEK BAŞLARKEN
    // okunur: yanıt yalnız bu firmaları düzeltir. İstek sürerken web
    // grubundan yapılan davet (yanıt ondan önce hesaplandı) düşürülmez.
    const key = sessionKey;
    const storedAtStart = qc.getQueryData<DiscoverySession>(key);
    const storedIds = new Set([...(storedAtStart?.invited ?? []), ...Object.keys(storedAtStart?.memberStatus ?? {})]);
    discovery
      .mutateAsync({
        type: "ALIM",
        categoryIds: effCategoryIds,
        // Vitrinde kalemi satan üyeler + talebin ülkeleri (2026-09-27).
        itemNames: effItemNames.slice(0, MAX_SEARCH_ITEMS),
        ...(listingId ? { listingId } : { targetCountries: targetCountries ?? [] }),
      })
      .then((rows) => {
        if (stale) return;
        // R3 — SUNUCUNUN YANITI saklanan durumdan önce gelir: yanıtın "davetli
        // değil" dediği firma oturumdan düşer (davet düzenleme formunda
        // kaldırıldı / bağlantı isteği geri çekildi), reddi de silinir (ülke
        // kapsamı genişletilmiş olabilir — sunucu yeniden karar verir). Yanıtta
        // OLMAYAN firma (yalnız web aramasının bulduğu üye) için taze bilgi
        // yoktur; saklanan durumu kalır.
        const dropped = new Set(
          rows
            .filter((r) => storedIds.has(r.companyId) && !(listingId ? r.alreadyInvited : r.connectionStatus === "PENDING"))
            .map((r) => r.companyId),
        );
        if (dropped.size > 0) {
          patchSession(key, (s) => ({
            ...s,
            invited: s.invited.filter((id) => !dropped.has(id)),
            memberStatus: Object.fromEntries(Object.entries(s.memberStatus).filter(([id]) => !dropped.has(id))),
          }));
        }
        setLoadError(null);
        setTierLocked(false);
        setCandidates(rows);
        setPlatformLoaded(true);
      })
      // Hata gövdede kalıcı gösterilir (sunucunun nedeni: paket/izin/ağ);
      // 403 için genel istemci zaten toast atar — ikinci toast yok.
      .catch((err) => {
        if (stale) return;
        setTierLocked(
          axios.isAxiosError(err) &&
            err.response?.status === 403 &&
            (err.response.data as { code?: string } | undefined)?.code === "TIER_REQUIRED",
        );
        setLoadError(windowErrorMessage(err, tr("onerilerYuklenemediTekrarDeneyin")));
        setPlatformLoaded(true);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, catKey, contextKey]);

  // D12 — geçen süre sayacı (yalnız pencere açıkken döner).
  useEffect(() => {
    if (searchSince === null || !isOpen) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - searchSince) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [searchSince, isOpen]);

  /**
   * Bir web aramasını SONUCA BAĞLAR (N1): `wait` aramanın sözüdür — yeni
   * başlatılan arama (başlat + yokla) ya da devralınan aramanın yoklaması.
   * Sonuç / hata aramanın BAŞLADIĞI bağlamın oturumuna yazılır; pencere kapansa,
   * sayfadan çıkılsa da döngü sürer. Oturum bu arada silindiyse (çıkış / başka
   * hesap) yoklama bırakılır ve hiçbir şey yazılmaz.
   */
  const followSearch = async (
    run: SearchRun,
    wait: (options: ExternalSearchOptions) => Promise<ExternalDiscoveryResult>,
  ) => {
    const { key, context, token, mode, scoped, items } = run;
    const id = followId(context, token);
    if (followedSearches.has(id)) return;
    followedSearches.add(id);
    // Sonucu yalnız HÂLÂ süren ve son başlatılan arama yazar.
    const isCurrent = () => {
      const s = qc.getQueryData<DiscoverySession>(key);
      return !!s && s.searchToken === token && s.searchSince !== null;
    };
    // Sonuç ve hata kutusu yalnız WEB SEKMESİNİN gövdesinde çizilir. Onu gören
    // yoksa kullanıcıya tek toast: pencere kapalıysa "yeniden açın"; pencere
    // açık ama "Platformda" sekmesindeyse sekmeyi gösteren metin (R2 — eskiden
    // açık pencere sekmesine bakılmadan "gördü" sayılıyor, sonuç hiçbir yerde
    // görünmüyordu). Sekme oturumdadır: bağlamın bütün pencereleri aynı sekmeyi
    // gösterir; ikisi de sonuç GELDİĞİ anda okunur.
    const windowOpen = () => (openWindows.get(context) ?? 0) > 0;
    const onWebTab = () => qc.getQueryData<DiscoverySession>(key)?.tab === "external";
    try {
      const res = await wait({
        since: run.since,
        shouldStop: () => !isCurrent(),
        onStarted: (searchId) => {
          if (!isCurrent()) return;
          patchSession(key, (s) => ({ ...s, searchId }));
          // R6-02 — kimlik sayfa yenilemeyi aşsın: yeniden bağlanan sayfa AYNI aramayı izler.
          savePendingExternalSearch(context, {
            searchId,
            since: run.since,
            mode,
            scopes: scoped,
            items,
            region: run.region,
          });
        },
        onSyncFallback: () => {
          if (isCurrent()) patchSession(key, (s) => ({ ...s, syncOnly: true }));
        },
      });
      if (!isCurrent()) return;
      // R6-02 — arama bitti: kaydı önce silinir (boşta oturum + duran kayıt hiç görülmesin).
      clearPendingExternalSearch(context);
      const next = readWebResults(res, items, !!listingId, () => ++rowIdSeq);
      const drafts = Object.fromEntries(next.rows.map((r) => [r.id, r.c.email ?? ""]));
      patchSession(key, (s) =>
        mode === "merge" && s.web
          ? {
              ...s,
              searchSince: null,
              searchId: null,
              web: mergeWebResults(s.web, next, scoped),
              emailDrafts: { ...s.emailDrafts, ...drafts },
            }
          : {
              ...s,
              searchSince: null,
              searchId: null,
              web: next,
              selected: [],
              emailDrafts: drafts,
              langDrafts: {},
              sendNote: null,
            },
      );
      if (!windowOpen()) toast.success(tr("aramaTamamlandi"));
      else if (!onWebTab()) toast.success(tr("aramaTamamlandiSekmede", { tab: tr("webDeAraAi") }));
    } catch (err) {
      if (!isCurrent()) return;
      const failure = readSearchFailure(err);
      // BIRAKILAN yoklama aramanın bitişi DEĞİLDİR (oturum silindi): kayıt durur.
      if (failure.kind === "ABANDONED") return;
      // R6-02 — arama sonuçsuz bitti (sunucuda düştü / kimlik bilinmiyor / süre doldu / ret).
      clearPendingExternalSearch(context);
      // Yalnız eksiği arayan istek TEK geçiş koşar; o da düşerse arama hatayla
      // biter. BÜTÇE REDDİ hata kutusuna DEĞİL nota yazılır: kutu "Yeniden ara"
      // sunar, oysa yeniden aramak sonucu değiştirmez. Eldeki sonuç ve not durur;
      // not artık sunucunun metnini taşır ve "Yeniden ara" sunmaz.
      if (scoped && failure.code === AI_BUDGET_EXCEEDED && qc.getQueryData<DiscoverySession>(key)?.web) {
        const refusal = failure.message;
        patchSession(key, (s) => ({
          ...s,
          searchSince: null,
          searchId: null,
          web: s.web ? markBudgetRefused(s.web, scoped, refusal) : s.web,
        }));
        // Not görünmüyorsa (pencere kapalı / öteki sekmede) ret bir kez toast olur;
        // gidilecek bir "Yeniden ara" olmadığı için sekme ipucu eklenmez.
        if (!windowOpen() || !onWebTab()) {
          toast.error(refusal ?? tr("kismiSonucButce", { scope: scoped.length === 1 ? scoped[0]! : "ALL" }));
        }
        return;
      }
      // Arama kimliği artık bilinmiyor (API yeniden başladı) ve bekleme tavanı
      // pencerenin KENDİ metnidir; diğerlerinde sunucunun kullanıcı metni, o da
      // yoksa (ağ hatası, işlenmemiş 500 — N4) genel yedek.
      const message =
        failure.kind === "INTERRUPTED"
          ? tr("aramaYaridaKesildi")
          : failure.kind === "TIMED_OUT"
            ? tr("aramaCokUzunSurdu")
            : (failure.message ?? tr("webAramasiBasarisizTekrarDeneyin"));
      // Mesaj gövdede kalır (D7); genel istemci toast'ı istekte kapalı. Gövde
      // görünmüyorsa (pencere kapalı ya da öteki sekmede) aynı mesaj bir kez
      // toast olarak verilir; öteki sekmedeyse "Yeniden ara"nın yeri de söylenir.
      //
      // `scopes` taşıyan isteğin 400'ü: alanı tanımayan bir uca düştü (yanıt
      // yeni sürümden gelmişti, istek eski bir örneğe gitti — eski uç bilinmeyen
      // alanı reddeder). Sonraki "Yeniden ara" alanı GÖNDERMEZ: eskisi gibi
      // bütün geçişleri arar, kullanıcı aynı hataya kilitlenmez.
      const scopesRejected = scoped !== null && failure.status === 400;
      patchSession(key, (s) => ({
        ...s,
        searchSince: null,
        searchId: null,
        searchError: message,
        web: scopesRejected && s.web ? { ...s.web, scopedRetry: false } : s.web,
      }));
      if (!windowOpen()) toast.error(message);
      else if (!onWebTab()) toast.error(message, { description: tr("aramaHatasiSekmede", { tab: tr("webDeAraAi") }) });
    } finally {
      followedSearches.delete(id);
    }
  };

  /**
   * Web araması. `replace`: yeni arama — sonuç BAŞARIYLA gelince eldekinin
   * yerine geçer (başarısız olursa önceki sonuçlar durur). `merge`: kısmi
   * sonucun üstüne ekler (eldeki satırlar ve seçim yerinde kalır).
   * Pencere kapansa da sürer; sonucu BAŞLADIĞI bağlamın oturumuna yazılır.
   *
   * `scopes` (yalnız `merge`): YALNIZ bu geçişler aranır — kısmi sonucun eksik
   * kalanı; yanıt vermiş geçiş ikinci kez aranmaz ve ödenmez. Çağıran alanı
   * yalnız uç tanıyorsa (`web.scopedRetry`) verir; verilmezse bütün geçişler.
   */
  const runExternalSearch = (mode: SearchMode, scopes?: readonly DiscoveryScope[]) => {
    const key = sessionKey;
    // Oturumdan okunur (bileşen durumu değil): çift tıklama ve aynı talebin
    // öteki penceresi aynı anda ikinci ücretli aramayı başlatamaz.
    const stored = qc.getQueryData<DiscoverySession>(key);
    if (!canSearch || (stored?.searchSince ?? null) !== null) return;
    const run: SearchRun = {
      key,
      context: contextKey,
      token: ++searchTokenSeq,
      mode,
      scoped: mode === "merge" && scopes && scopes.length > 0 ? [...scopes] : null,
      items: effItemNames.slice(0, MAX_SEARCH_ITEMS),
      since: Date.now(),
      region: region.trim(),
    };
    patchSession(key, (s) => ({
      ...s,
      searchSince: run.since,
      searchMode: mode,
      searchScopes: run.scoped,
      searchToken: run.token,
      searchId: null,
      searchItems: run.items,
      searchError: null,
    }));
    setElapsed(0);
    const input = {
      type: "ALIM" as const,
      categoryIds: effCategoryIds,
      itemNames: run.items,
      region: run.region || undefined,
      // Konum talebin görünürlük ülkesinden: kayıtlı talepte sunucu okur.
      ...(listingId ? { listingId } : { targetCountries: targetCountries ?? [] }),
      ...(run.scoped ? { scopes: run.scoped } : {}),
    };
    // Başlatma ucunun olmadığı (eski API) bu bağlamda öğrenildiyse yeniden denenmez.
    const sync = stored?.syncOnly === true;
    void followSearch(run, (options) => searchExternalSuppliers(input, sync ? { ...options, sync } : options));
  };

  // R6-02 — SAYFA YENİLENDİ: önbellek (oturum) ve arama döngüsü birlikte gitti,
  // arama sunucuda sürüyor. Bağlamın bağlanan ilk penceresi (kapalı olsa da)
  // depodaki kayıttan oturumu kurar; aşağıdaki devralma aynı aramayı yoklar.
  // Oturumda arama SÜRÜYORSA dokunulmaz (döngüsü bu sayfada yaşıyor ya da öteki
  // pencere örneği az önce kurdu). Web sekmesi yalnız oturum hiç yokken seçilir
  // (alıcı aramayı orada başlatmıştı; açık pencerenin sekmesi değiştirilmez).
  useEffect(() => {
    const key: QueryKey = [SESSION_QUERY_ROOT, contextKey];
    const current = qc.getQueryData<DiscoverySession>(key);
    if (current && current.searchSince !== null) return;
    const stored = readPendingExternalSearch(contextKey);
    if (!stored) return;
    patchSession(key, (s) => ({
      ...s,
      tab: current ? s.tab : "external",
      searchSince: stored.since,
      searchMode: stored.mode,
      searchScopes: stored.scopes,
      searchToken: ++searchTokenSeq,
      searchId: stored.searchId,
      searchItems: stored.items,
      searchError: null,
      region: s.region || stored.region,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  // N1 — SAHİPSİZ süren arama devralınır: oturumda arama sürüyor ve sunucudaki
  // kimliği belli, ama onu izleyen döngü yok (sayfa yeniden bağlandı). Bağlamın
  // bağlanan ilk penceresi (kapalı olsa da) aynı aramayı yoklamayı sürdürür —
  // yeni arama BAŞLAMAZ. Başlatan pencerenin döngüsü sürüyorsa hiçbir şey yapılmaz.
  const pendingSearchId = searching ? session.searchId : null;
  useEffect(() => {
    if (!pendingSearchId) return;
    const key: QueryKey = [SESSION_QUERY_ROOT, contextKey];
    const s = qc.getQueryData<DiscoverySession>(key);
    if (!s || s.searchSince === null || s.searchId !== pendingSearchId) return;
    void followSearch(
      {
        key,
        context: contextKey,
        token: s.searchToken,
        mode: s.searchMode,
        scoped: s.searchScopes,
        items: s.searchItems,
        since: s.searchSince,
        region: s.region.trim(),
      },
      (options) => resumeExternalSupplierSearch(pendingSearchId, options),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearchId, contextKey]);

  /**
   * R4 — "Yeniden ara": arama başlayınca hata kutusu (ve içindeki düğme)
   * kaldırılır, kısmi sonuç kutusundaki düğme pasifleşir → odak önce KALICI
   * bekleme bloğuna alınır (yoksa belgeye düşer, sonraki Tab pencerenin
   * başından başlar). Blok arama bitince de yerinde durur; sonraki Tab ondan
   * sonraki ilk denetime (yeniden hata olursa yine "Yeniden ara") gider.
   */
  const retrySearch = (mode: SearchMode, scopes?: readonly DiscoveryScope[]) => {
    searchStatusRef.current?.focus();
    void runExternalSearch(mode, scopes);
  };

  /** Kısmi sonuçta yeniden aranabilecek eksik geçişler (bütçenin reddettiği hariç). */
  const missingScopes = web ? retriableScopes(web) : [];
  /**
   * Kısmi sonuç notundaki "Yeniden ara": eldeki adayların ÜSTÜNE ekler ve — uç
   * tanıyorsa — YALNIZ eksik geçişi arar. Eski API'de bütün geçişler (eskisi gibi).
   */
  const retryMissing = () => {
    if (missingScopes.length === 0) return;
    retrySearch("merge", web?.scopedRetry ? missingScopes : undefined);
  };
  /**
   * Hata kutusundaki "Yeniden ara" DÜŞEN aramayı yineler: yalnız eksiği arayan
   * arama düştüyse yine yalnız eksik aranır; ana düğmenin yeni araması düştüyse
   * her şey aranır (kısmi sonuç eldeyse üstüne eklenir, yoksa yerine geçer).
   */
  const retryFailed = () => {
    if (!web || web.incompleteScopes.length === 0) return retrySearch("replace");
    if (session.searchScopes && web.scopedRetry && missingScopes.length > 0) return retryMissing();
    return retrySearch("merge");
  };

  /**
   * Davet dili: kullanıcının seçtiği, yoksa kayıtsız alıcı kuralı (ülke →
   * e-posta/site uzantısı → arayüz dili). Rusça arayüzlü alıcının Alman
   * firmaya daveti İngilizce gider — eskiden davet edenin dilindeydi.
   */
  const rowLocale = (row: WebRow): Locale =>
    langDrafts[row.id] ??
    recipientLocale({
      country: row.c.country ?? null,
      email: emailDrafts[row.id] ?? row.c.email ?? null,
      website: row.c.website ?? null,
      fallback: uiLocale,
    });

  // Satır görünümleri — kilit, seçim ve geçerlilik TEK yerde hesaplanır;
  // liste, "tümünü seç", gönder düğmesindeki sayı ve gönderim aynı kuralı okur.
  const rowViews = (web?.rows ?? []).map((row) => {
    const email = (emailDrafts[row.id] ?? "").trim().toLowerCase();
    const result = email !== "" ? sendStatus[email] : undefined;
    const status = result?.status;
    const isCollected = collectMode && email !== "" && collectedSet.has(email);
    // Davet alındı (sırada / gönderildi) ya da talebe eklendi → satır kilitli;
    // başarısız gönderim yeniden seçilebilir. Sonucu kesinleşen (zaten
    // davetli, kayıtlı, çıkmış, izinsiz/kapalı ülke) satır da seçilemez —
    // adres düzeltilirse durum düşer, seçim açılır.
    const locked = (status !== undefined && isInviteAccepted(status)) || isCollected;
    const isFinal = status !== undefined && FINAL_EXTERNAL_STATUSES.has(status);
    const selectable = !locked && !isFinal;
    const selected = selectedExt.has(row.id);
    const valid = EMAIL_FORMAT.test(email);
    return { row, email, result, status, isCollected, locked, selectable, selected, valid };
  });
  const selectableIds = rowViews.filter((v) => v.selectable).map((v) => v.row.id);
  const selectedCount = rowViews.filter((v) => v.selected && v.selectable).length;
  /** Seçili ama adresi geçersiz satırlar — sessizce atlanmaz, alanında işaretlenir (D11). */
  const invalidCount = rowViews.filter((v) => v.selected && v.selectable && !v.valid).length;

  /** GERÇEKTEN gidecek alıcılar: seçili ∧ seçilebilir ∧ adresi geçerli; aynı adres bir kez. */
  const sendTargets = (): ExternalInviteTarget[] => {
    const seen = new Set<string>();
    const out: ExternalInviteTarget[] = [];
    for (const v of rowViews) {
      if (!v.selected || !v.selectable || !v.valid || seen.has(v.email)) continue;
      seen.add(v.email);
      out.push({ email: v.email, locale: rowLocale(v.row), country: v.row.c.country ?? null });
    }
    return out;
  };
  const sendableCount = sendTargets().length;

  /** N5 — gönderim özeti: yalnız sıfırdan büyük kalemler, tek satırda. */
  const sendNoteText = (note: SendNote): string =>
    [
      note.queued > 0 ? tr("ozetSirayaAlindi", { n: note.queued }) : null,
      note.sent > 0 ? tr("ozetGonderildi", { n: note.sent }) : null,
      note.notSent > 0 ? tr("ozetGonderilemedi", { n: note.notSent }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const sendExternalInvites = async () => {
    if (!listingId || sendExternal.isPending) return;
    const key = sessionKey;
    const context = contextKey;
    const invites = sendTargets();
    if (invites.length === 0) return;
    try {
      const results = await sendExternal.mutateAsync({ listingId, invites, source: "AI_FORM" });
      const keyOf = (email: string) => email.trim().toLowerCase();
      // N5 — sonuç TEK özet satırıdır (gönder şeridinde): "sıraya alındı" ile
      // "gönderildi" ayrı sayılır (D2), gönderilemeyenlerin nedeni kendi
      // satırında yazar. Eskiden iki başarı + üç adres toast'ı üst üste biniyor,
      // telefonda pencerenin başlığını ve kapat düğmesini örtüyordu.
      const note: SendNote = {
        queued: results.filter((r) => isInviteQueued(r.status)).length,
        sent: results.filter((r) => isInviteSent(r.status)).length,
        notSent: results.filter((r) => !isInviteAccepted(r.status)).length,
      };
      // Seçim yalnız davet edilenlerden ve sonucu kesinleşenlerden temizlenir:
      // adresi geçersiz (hiç gönderilmedi) ya da yeniden denenebilir (günlük
      // sınır, geçici hata) satır SEÇİLİ kalır. Eskiden hepsi sıfırlanıyordu.
      const statusOf = new Map(results.map((r) => [keyOf(r.email), r.status]));
      const emailOf = new Map(rowViews.map((v) => [v.row.id, v.email]));
      patchSession(key, (s) => ({
        ...s,
        sendStatus: {
          ...s.sendStatus,
          ...Object.fromEntries(results.map((r) => [keyOf(r.email), { status: r.status, sendAfter: queuedSendTime(r) }])),
        },
        selected: s.selected.filter((id) => {
          const email = emailOf.get(id) ?? "";
          if (!EMAIL_FORMAT.test(email)) return true;
          const st = statusOf.get(email);
          return st !== undefined && !isInviteAccepted(st) && !FINAL_EXTERNAL_STATUSES.has(st);
        }),
        sendNote: note,
      }));
      // Özet ve satırlar görünmüyorsa (yanıt gelmeden pencere kapandı / sekme
      // değişti) sonuç bir kez toast olarak verilir.
      const summaryVisible =
        (openWindows.get(context) ?? 0) > 0 && qc.getQueryData<DiscoverySession>(key)?.tab === "external";
      if (!summaryVisible) {
        if (note.queued + note.sent > 0) toast.success(sendNoteText(note));
        else toast.warning(sendNoteText(note));
      }
    } catch (err) {
      toast.error(windowErrorMessage(err, tr("davetlerGonderilemedi")));
    }
  };

  /** Yayın öncesi (talep yok): adresler forma eklenir, e-posta yayında gider. */
  const collectInvites = () => {
    if (!onCollect) return;
    const invites = sendTargets();
    if (invites.length === 0) return;
    onCollect(invites);
    toast.success(tr("adresTalebeEklendi", { n: invites.length }));
    // Adresi geçersiz satır seçili kalır (düzeltilip eklenebilsin).
    const added = new Set(invites.map((i) => i.email));
    const emailOf = new Map(rowViews.map((v) => [v.row.id, v.email]));
    setSelectedExt((sel) => new Set([...sel].filter((id) => !added.has(emailOf.get(id) ?? ""))));
  };

  /** Talepten açılış: üyeleri doğrudan talebe davet (tek ya da hepsi). */
  const inviteToListing = async (list: ReadonlyArray<{ companyId: string }>) => {
    if (!listingId || list.length === 0 || inviting) return;
    const key = sessionKey;
    setInviting(list.length === 1 ? list[0]!.companyId : "*");
    try {
      const results = await inviteMembers.mutateAsync({ listingId, companyIds: list.map((c) => c.companyId) });
      const ok = results.filter((r) => r.status === "INVITED" || r.status === "ALREADY_INVITED").map((r) => r.companyId);
      patchSession(key, (s) => ({
        ...s,
        invited: [...new Set([...s.invited, ...ok])],
        memberStatus: { ...s.memberStatus, ...Object.fromEntries(results.map((r) => [r.companyId, r.status])) },
      }));
      const n = results.filter((r) => r.status === "INVITED").length;
      if (n > 0) toast.success(tAi("memberInvitedToast", { n }));
      // Her ret türü ayrı söylenir (eskiden yalnız ilki; toplu davette günlük
      // sınır ile "bu talebi göremiyor" birlikte dönebilir).
      for (const status of ["DAILY_LIMIT", "NOT_ELIGIBLE"] as const) {
        if (results.some((r) => r.status === status)) toast.warning(tMember(status));
      }
    } catch (err) {
      toast.error(windowErrorMessage(err, tr("davetGonderilemedi")));
    } finally {
      setInviting(null);
    }
  };

  const sendInvite = async (c: DiscoveryCandidate) => {
    if (listingId) return inviteToListing([c]);
    if (!c.rothernId || inviting) return;
    const key = sessionKey;
    setInviting(c.companyId);
    try {
      await invite.mutateAsync(c.rothernId);
      patchSession(key, (s) => ({ ...s, invited: [...new Set([...s.invited, c.companyId])] }));
      toast.success(tr("firmasinaBaglantiDavetiGonderildi", { name: c.name }));
    } catch (err) {
      toast.error(windowErrorMessage(err, tr("davetGonderilemedi")));
    } finally {
      setInviting(null);
    }
  };

  /** D9 — adayın karşıladığı kalemler (tek kalemli talepte bilgi taşımaz, yazılmaz). */
  const coveredText = (row: WebRow): string | null => {
    if (row.itemTotal < 2 || row.covered.length === 0) return null;
    return row.covered.length >= row.itemTotal
      ? tr("tumKalemleriKarsiliyor", { n: row.itemTotal })
      : tr("karsiladigiKalemler", { k: row.covered.length, n: row.itemTotal, items: row.covered.join(", ") });
  };

  const excludedReasonLabel = (reason: ExcludedReason) =>
    reason === "NO_EMAIL" ? tr("nedenEPostaYok") : reason === "OTHER" ? tr("nedenDiger") : tStatus(reason);

  const excludedList = (list: readonly ExcludedFirm[]) => (
    <ul className="mt-2 space-y-1.5">
      {list.map((x) => (
        <li
          key={x.name}
          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs"
        >
          <span className="min-w-0 flex-[1_1_10rem] font-medium break-words text-zinc-900">{x.name}</span>
          {x.country ? <CountryLabel code={x.country} className="text-zinc-600" /> : null}
          <span className="ml-auto text-right text-zinc-600">{excludedReasonLabel(x.reason)}</span>
        </li>
      ))}
    </ul>
  );

  /**
   * Kısmi sonuç notu — metin NEDENE göre: süre yetmedi / arama hizmeti yanıt
   * vermedi (ikisi "yeniden arayabilirsiniz" der) / AI bütçesi reddetti (neden
   * cümlesi + sunucunun kendi metni; yeniden arama önerilmez). Nedeni
   * bildirmeyen eski API'de eski genel metin.
   */
  const incompleteNote = (scope: DiscoveryScope) => {
    const reason = web?.incompleteReasons[scope];
    if (reason === "BUDGET") {
      const refusal = web?.incompleteMessages[scope];
      return (
        <div key={scope}>
          <p>{tr("kismiSonucButce", { scope })}</p>
          {refusal ? <p className="mt-0.5 font-medium break-words">{refusal}</p> : null}
        </div>
      );
    }
    return (
      <p key={scope}>
        {reason === "TIMEOUT"
          ? tr("kismiSonucZamanAsimi", { scope })
          : reason === "PROVIDER"
            ? tr("kismiSonucHizmet", { scope })
            : tr("kismiSonucNotu", { scope })}
      </p>
    );
  };

  // N2 — "Platformda" listesi iki gruptur: sunucunun GÜÇLÜ dediği eşleşmeler
  // (kalemi vitrininde satıyor / talebin alt kategorisini beyan ediyor —
  // `strongMatch`, tek kaynak API) ve yalnız aynı sektörde olanlar. Sunucu sırası
  // grup içinde korunur. Toplu davet YALNIZ güçlü eşleşenlere gider: eskiden
  // "Hepsini talebe davet et" yalnız segment düzeyinde eşleşen üyeleri de
  // (canlı taleplerde listenin tamamı) birincil eylemle davet ediyordu.
  const strongCandidates = candidates.filter((c) => c.strongMatch);
  const sectorCandidates = candidates.filter((c) => !c.strongMatch);
  const strongToInvite = strongCandidates.filter(
    (c) => !invited.has(c.companyId) && !c.alreadyInvited && memberStatus[c.companyId] !== "NOT_ELIGIBLE",
  );
  const platformRow = (c: DiscoveryCandidate) => {
    const done = listingId
      ? invited.has(c.companyId) || !!c.alreadyInvited
      : invited.has(c.companyId) || c.connectionStatus === "PENDING";
    const items = (c.matchedItems ?? [])
      .map((n) => effItemNames[n - 1])
      .filter(Boolean)
      .join(", ");
    return (
      <li key={c.companyId} className="flex flex-wrap items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
          <Building2 className="h-4 w-4 text-zinc-600" />
        </div>
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-zinc-900">
            <span className="min-w-0 break-words">{c.name}</span>
            {c.strongMatch ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                {tr("gucluEslesme")}
              </span>
            ) : null}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            {/* D9 — şehir + ÜLKE: tüm ülkelere açık talepte iki "Munich" satırı
                ülkesiz ayırt edilemiyordu. */}
            <Place city={c.city} country={c.country} />
            {c.matchedCategories.length > 0 ? (
              <span className="min-w-0 truncate">{c.matchedCategories.join(" · ")}</span>
            ) : null}
          </div>
          {items ? <p className="mt-1 text-xs font-medium text-blue-800">{tAi("memberItems", { items })}</p> : null}
        </div>
        {done ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            {listingId ? tr("talebeDavetli") : tr("davetGonderildi2")}
          </span>
        ) : listingId && memberStatus[c.companyId] === "NOT_ELIGIBLE" ? (
          // Sunucu bu firmayı reddetti (ülke kısıtı / engel): yeniden denemek
          // sonucu değiştirmez — düğme yerine neden.
          <span className="ml-auto max-w-full text-right text-xs font-medium text-zinc-600">
            {tMember("NOT_ELIGIBLE")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            disabled={inviting !== null}
            onClick={() => sendInvite(c)}
          >
            {inviting === c.companyId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {listingId ? tr("talebeDavetEt") : tr("baglantiDavetiGonder")}
          </Button>
        )}
      </li>
    );
  };

  const hasListed = !!web && (web.rows.length > 0 || web.members.length > 0);
  // Yeni arama sürerken eski liste gizlenir (sonuç gelince yerine geçecek,
  // yapılan seçim boşa gider); üstüne ekleyen arama sürerken liste durur.
  const resultsHidden = searching && searchMode === "replace";
  const showSendBar =
    tab === "external" && !resultsHidden && !!web && web.rows.length > 0 && (!!listingId || collectMode);
  const showFooterNote = (!!listingId || tab === "platform") && !(tab === "platform" && loadError);
  const bulkLinkClass =
    "rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm transition data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-2 pt-4 sm:p-4 sm:pt-6">
        {/* Yükseklik `dvh` (telefonda adres çubuğu); başlık, sekmeler ve gönder
            şeridi küçülmez, aradaki gövde kayar (D10). */}
        <DialogPanel className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2.5rem)]">
          {/* Header — tek satır; açıklama kaydırılan gövdenin başında (liste
              pencerenin çoğunu kullansın). */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/5 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <DialogTitle className="min-w-0 text-base font-semibold text-zinc-950 sm:text-lg">
                {tr("dahaFazlaTedarikciyeEris")}
              </DialogTitle>
            </div>
            <IconButton aria-label={tr("kapat")} onClick={onClose} className="shrink-0">
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Sekmeler */}
          <div
            role="tablist"
            aria-label={tr("tedarikciKaynagi")}
            className="flex shrink-0 gap-1 border-b border-zinc-950/5 px-4 pt-2 sm:px-6"
          >
            {(
              [
                { key: "platform", label: tr("platformda"), icon: Building2 },
                { key: "external", label: tr("webDeAraAi"), icon: Globe },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                {/* R2 — alıcı arama sürerken "Platformda" sekmesine geçtiyse web
                    sekmesinin simgesi döner: aramanın sürdüğü / bittiği buradan
                    görünür (web sekmesinin kendisinde bekleme bloğu zaten var). */}
                {t.key === "external" && searching && tab !== "external" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <t.icon className="h-4 w-4" aria-hidden />
                )}
                {t.label}
              </button>
            ))}
          </div>

          {/* Gövde — iki sekme de tek kaydırma alanında */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
            {/* Web sonuçları listelenirken giriş açıklaması yer tutmaz: alıcı
                aramayı yaptı, alan adaylara kalır (D10). */}
            {tab === "external" && hasListed && !resultsHidden ? null : (
              <p className="mb-3 text-xs text-zinc-600">
                {/* Talepten açılışta bağlantı akışı anlatılmaz (D-098):
                    üye doğrudan talebe, web'deki firma talebe özel e-postayla. */}
                {listingId ? tr("talepIcinAciklama") : tr("satinAlmaTalebiKategorilerinizeGore")}
              </p>
            )}

            {tab === "external" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {/* N5 — yer tutucu KISA (390 px'te "Bölge (ops. — örn. İst" diye
                      kesiliyordu); erişilebilir ad uzun açıklamayı taşır. */}
                  <input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder={tr("bolgeYerTutucu")}
                    aria-label={tr("bolgeOpsOrnIstanbulEge")}
                    className="min-w-[180px] flex-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                  <Button
                    type="button"
                    onClick={() => void runExternalSearch("replace")}
                    disabled={searching || !canSearch}
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {tr("webDeAra")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {tr("aiTalebinizinKategorisineUygunFirmalari")} {tr("davetDiliIpucu")}
                </p>

                {/* Bekleme bloğu. Kabı HER ZAMAN bağlıdır (arama yokken boş, yer
                    tutmaz): "Yeniden ara" kaybolurken odak buraya alınır ve arama
                    bitince de burada kalır (R4). */}
                <div
                  ref={searchStatusRef}
                  tabIndex={-1}
                  className={cn(
                    "rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30",
                    searching && "flex flex-col items-center gap-1.5 text-center",
                    searching && (resultsHidden ? "py-10" : "py-5"),
                  )}
                >
                  {searching ? (
                    // D12 — durum duyurulur; sayaç `timer` (ekran okuyucu her
                    // saniye okumaz, gezinince güncel değeri okur).
                    <>
                      <p role="status" className="flex items-center justify-center gap-2 text-sm text-zinc-600">
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                        {tr("webDeAraniyorSure")}
                      </p>
                      <p role="timer" className="text-sm font-medium tabular-nums text-zinc-700">
                        {/* Arama dakikalar sürebilir (N1): bir dakikadan sonra "dk + sn". */}
                        {elapsed >= 60
                          ? tr("gecenSureDakika", { m: Math.floor(elapsed / 60), s: elapsed % 60 })
                          : tr("gecenSure", { s: elapsed })}
                      </p>
                      <p className="max-w-sm text-xs text-zinc-500">{tr("aramaSurerkenKapatabilirsiniz")}</p>
                    </>
                  ) : null}
                </div>

                {resultsHidden ? null : (
                  <>
                    {searchError ? (
                      <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                        <div className="min-w-0 flex-[1_1_14rem] text-sm text-red-800">
                          <p role="alert" className="font-medium">
                            {searchError}
                          </p>
                          {hasListed ? <p className="mt-0.5 text-xs">{tr("oncekiSonuclarDuruyor")}</p> : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="ml-auto shrink-0"
                          disabled={!canSearch}
                          onClick={retryFailed}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {tr("yenidenAra")}
                        </Button>
                      </div>
                    ) : null}

                    {web ? (
                      <>
                        {web.incompleteScopes.length > 0 ? (
                          <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                            <div role="status" className="min-w-0 flex-[1_1_14rem] space-y-1 text-sm text-amber-900">
                              {web.incompleteScopes.map(incompleteNote)}
                            </div>
                            {/* Hata kutusu görünüyorsa "Yeniden ara" oradadır (tek düğme).
                                Yeniden aranabilecek geçiş yoksa (eksik kalanı AI bütçesi
                                reddetti) düğme hiç çizilmez. */}
                            {searchError || missingScopes.length === 0 ? null : (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="ml-auto shrink-0"
                                disabled={searching || !canSearch}
                                onClick={retryMissing}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {tr("yenidenAra")}
                              </Button>
                            )}
                          </div>
                        ) : null}

                        {!hasListed ? (
                          web.excluded.length === 0 ? (
                            <div role="status" className="py-8 text-center">
                              <p className="text-sm font-medium text-zinc-700">{tr("webAramasindaUygunFirmaBulunamadi")}</p>
                              <p className="mt-1 text-xs text-zinc-500">{tr("bulunamadiIpucu")}</p>
                            </div>
                          ) : (
                            // Sunucu e-postasız firmayı zaten döndürmez: sonuç var
                            // ama listelenen yoksa neden adres değil, adayların
                            // davet edilemez olmasıdır — firma firma söylenir.
                            <div className="mt-4">
                              <p role="status" className="text-sm font-medium text-zinc-700">
                                {tr("hicbiriDavetEdilemiyor")}
                              </p>
                              {excludedList(web.excluded)}
                            </div>
                          )
                        ) : (
                          <>
                            {web.members.length > 0 ? (
                              <section aria-label={tAi("groupMembers")} className="mt-4">
                                <h4 className="text-xs font-semibold tracking-wide text-blue-800 uppercase">
                                  {tAi("groupMembers")}{" "}
                                  <span className="font-normal text-zinc-500">· {web.members.length}</span>
                                </h4>
                                <p className="mt-0.5 text-xs text-zinc-600">{tAi("groupMembersLead")}</p>
                                <ul className="mt-2 space-y-2">
                                  {web.members.map((row) => {
                                    const c = row.c;
                                    const id = c.memberCompanyId as string;
                                    const done =
                                      invited.has(id) || candidates.some((p) => p.companyId === id && p.alreadyInvited);
                                    const refused = memberStatus[id] === "NOT_ELIGIBLE";
                                    const covered = coveredText(row);
                                    return (
                                      // Dar ekranda metin tam genişlik alır, eylem alt satıra iner (D10).
                                      <li
                                        key={id}
                                        className="flex flex-wrap items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3.5"
                                      >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
                                          <Building2 className="h-4 w-4 text-blue-700" />
                                        </div>
                                        <div className="min-w-0 flex-[1_1_12rem]">
                                          <p className="text-sm font-semibold break-words text-zinc-900">{c.name}</p>
                                          <div className="mt-0.5 text-xs text-zinc-600">
                                            <Place city={c.city} country={c.country} />
                                          </div>
                                          {c.reason ? <p className="mt-1 text-xs text-zinc-600">{c.reason}</p> : null}
                                          {covered ? (
                                            <p className="mt-1 line-clamp-2 text-xs font-medium text-blue-800" title={covered}>
                                              {covered}
                                            </p>
                                          ) : null}
                                        </div>
                                        {done ? (
                                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                                            <Check className="h-3.5 w-3.5" />
                                            {tr("talebeDavetli")}
                                          </span>
                                        ) : refused ? (
                                          <span className="ml-auto max-w-full text-right text-xs font-medium text-zinc-600">
                                            {tMember("NOT_ELIGIBLE")}
                                          </span>
                                        ) : (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="ml-auto shrink-0"
                                            disabled={inviting !== null}
                                            onClick={() => void inviteToListing([{ companyId: id }])}
                                            aria-label={tr("talebeDavetEtFirma", { name: c.name })}
                                          >
                                            {inviting === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                            {tr("talebeDavetEt")}
                                          </Button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </section>
                            ) : null}

                            {web.rows.length > 0 ? (
                              <div className="mt-4">
                                {/* D10 — toplu seçim (yalnız seçilebilir satırlar). */}
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                  <p className="text-xs font-medium text-zinc-700">
                                    {tr("adaySecimOzeti", { n: web.rows.length, k: selectedCount })}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      className={bulkLinkClass}
                                      disabled={selectableIds.length === 0 || selectedCount === selectableIds.length}
                                      onClick={() => setSelectedExt(new Set(selectableIds))}
                                    >
                                      {tr("tumunuSec")}
                                    </button>
                                    <button
                                      type="button"
                                      className={bulkLinkClass}
                                      disabled={selectedExt.size === 0}
                                      onClick={() => setSelectedExt(new Set())}
                                    >
                                      {tr("secimiTemizle")}
                                    </button>
                                  </div>
                                </div>
                                <ul className="mt-2 space-y-2">
                                  {rowViews.map((v) => {
                                    const { row, status, locked } = v;
                                    const c = row.c;
                                    const site = safeExternalUrl(c.website);
                                    const covered = coveredText(row);
                                    // D11 — seçili ama adresi geçersiz: alan işaretlenir.
                                    const invalid = v.selected && v.selectable && !v.valid;
                                    // D13 — adresin alan adı firmanın sitesinden farklı.
                                    const mismatch = !locked && v.valid ? emailSiteMismatch(v.email, c.website) : null;
                                    const errorId = `${uid}-email-error-${row.id}`;
                                    const hintId = `${uid}-email-hint-${row.id}`;
                                    const describedBy =
                                      [invalid ? errorId : null, mismatch ? hintId : null].filter(Boolean).join(" ") ||
                                      undefined;
                                    const sendAt = v.result?.sendAfter ?? null;
                                    return (
                                      <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-3.5">
                                        <div className="flex items-start gap-3">
                                          <input
                                            type="checkbox"
                                            className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                                            checked={v.selected}
                                            disabled={!v.selectable}
                                            onChange={(e) =>
                                              setSelectedExt((s) => {
                                                const n = new Set(s);
                                                if (e.target.checked) n.add(row.id);
                                                else n.delete(row.id);
                                                return n;
                                              })
                                            }
                                            aria-label={tr("sec", { name: c.name })}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold break-words text-zinc-900">{c.name}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                                              <Place city={c.city} country={c.country} />
                                              {site && c.website ? (
                                                <a
                                                  href={site}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex min-w-0 items-center gap-1 underline hover:text-zinc-800"
                                                >
                                                  <Globe className="h-3 w-3 shrink-0" />
                                                  <span className="truncate">
                                                    {c.website.replace(/^https?:\/\//, "").slice(0, 40)}
                                                  </span>
                                                </a>
                                              ) : null}
                                            </div>
                                            {c.reason ? <p className="mt-1 text-xs text-zinc-600">{c.reason}</p> : null}
                                            {covered ? (
                                              <p className="mt-1 line-clamp-2 text-xs font-medium text-blue-800" title={covered}>
                                                {covered}
                                              </p>
                                            ) : null}
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                              {/* N5 — simge alanın İÇİNDE: eskiden sarmalanan satırın ayrı
                                                  öğesiydi ve `w-full` alan yanına sığmadığı için 390 px'te
                                                  tek başına bir satır tutuyordu (simge / adres / dil = üç
                                                  satır). Alan satırı doldurur; dil seçici sığarsa yanında,
                                                  sığmazsa bir alt satırda — en çok iki satır. */}
                                              <div className="relative min-w-0 max-w-[300px] flex-[1_1_13rem]">
                                                <Mail
                                                  aria-hidden
                                                  className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                                                />
                                                <input
                                                  value={emailDrafts[row.id] ?? ""}
                                                  onChange={(e) => setEmailDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                                                  disabled={locked}
                                                  inputMode="email"
                                                  autoComplete="off"
                                                  spellCheck={false}
                                                  placeholder={tr("ePostaAdresiniDogrulayinGirin")}
                                                  aria-label={tr("ePostaAdresiFirma", { name: c.name })}
                                                  aria-invalid={invalid || undefined}
                                                  aria-describedby={describedBy}
                                                  className={cn(
                                                    "w-full rounded-lg border bg-white py-1.5 pr-2.5 pl-8 text-xs shadow-sm focus:outline-none focus:ring-2 disabled:bg-zinc-50",
                                                    invalid
                                                      ? "border-red-500 focus:ring-red-500/20"
                                                      : "border-surface-border focus:ring-zinc-900/10",
                                                  )}
                                                />
                                              </div>
                                              <InviteLocaleSelect
                                                value={rowLocale(row)}
                                                onChange={(l) => setLangDrafts((d) => ({ ...d, [row.id]: l }))}
                                                disabled={locked}
                                                label={tr("davetDiliFirma", { name: c.name })}
                                              />
                                              {v.isCollected ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                                  <Check className="h-3.5 w-3.5" />
                                                  {tr("talebeEklendi")}
                                                </span>
                                              ) : status && isInviteSent(status) ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                                  <Check className="h-3.5 w-3.5" />
                                                  {tr("gonderildi")}
                                                </span>
                                              ) : status && isInviteQueued(status) ? (
                                                // D2 — sırada: e-posta henüz gitmedi; planlanan an ürün saat dilimiyle.
                                                // N5 — uzun durum metni dar ekranda dil seçicinin YANINDA sarar
                                                // (kendi satırına inip bloğu bir satır daha uzatmaz).
                                                <span
                                                  className={cn(
                                                    "inline-flex items-center gap-1 text-xs font-semibold text-blue-800",
                                                    ROW_STATUS_FIT,
                                                  )}
                                                >
                                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                                  {sendAt
                                                    ? tr("sirayaAlindiZamani", { when: formatDate(sendAt, "datetime") })
                                                    : tStatus("QUEUED")}
                                                </span>
                                              ) : status ? (
                                                <span
                                                  className={cn(
                                                    "text-xs font-semibold",
                                                    ROW_STATUS_FIT,
                                                    status === "FAILED" || status === "SUPPRESSED"
                                                      ? "text-red-700"
                                                      : "text-zinc-600",
                                                  )}
                                                >
                                                  {tStatus(status)}
                                                </span>
                                              ) : null}
                                            </div>
                                            {invalid ? (
                                              <p id={errorId} className="mt-1 text-xs font-medium text-red-700">
                                                {tr("gecersizEPosta")}
                                              </p>
                                            ) : null}
                                            {mismatch ? (
                                              <p id={hintId} className="mt-1 text-xs text-amber-800">
                                                {tr("alanAdiFarkli", { domain: mismatch.domain, host: mismatch.host })}
                                              </p>
                                            ) : null}
                                            {c.recentlyInvited && !locked ? (
                                              <p className="mt-1 text-xs text-zinc-600">{tr("yakindaDavetAldi")}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p className="mt-3 text-xs text-zinc-500">
                                  {listingId
                                    ? tr("gunlukDisDavetLimitiFirma", { limit: MAX_PENDING_EXTERNAL_INVITES })
                                    : collectMode
                                      ? tr("yayindaDavetGonderilir", { limit: MAX_PENDING_EXTERNAL_INVITES })
                                      : tr("onceTalebiKaydedin")}
                                </p>
                              </div>
                            ) : null}

                            {web.excluded.length > 0 ? (
                              <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2">
                                <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                                  {tr("davetEdilemeyenFirmalar", { n: web.excluded.length })}
                                </summary>
                                {excludedList(web.excluded)}
                              </details>
                            ) : null}
                          </>
                        )}
                      </>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <div>
                {contextLoading ? (
                  // Talepten açılış: kategori/kalem bağlamı talep detayından gelir.
                  // Yüklenirken "önce kategori seçin" denmez (liste ⋮ menüsünden
                  // açılışta detay önbellekte yok — yanlış boş durum görünüyordu).
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500" role="status">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {tr("eslesenFirmalarAraniyor")}
                  </div>
                ) : effCategoryIds.length === 0 && effItemNames.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500">
                    {tr("onceSatinAlmaTalebininKategorisini")}
                  </p>
                ) : discovery.isPending || (!platformLoaded && !loadError) ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500" role="status">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {tr("eslesenFirmalarAraniyor")}
                  </div>
                ) : loadError ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="text-sm text-red-700">
                      {loadError}
                    </p>
                    {/* Kilit = firma doğrulanmamış: eylem doğrulama akışı, etiket
                        doğrulama durumunu izler (ücretsiz dönem 2026-10-07). */}
                    {tierLocked && gateCopy.managerNote ? (
                      <p className="text-sm text-zinc-600">{gateCopy.managerNote}</p>
                    ) : tierLocked && gateCopy.href ? (
                      <Link
                        href={gateCopy.href}
                        onClick={onClose}
                        className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                      >
                        {gateCopy.cta}
                      </Link>
                    ) : null}
                  </div>
                ) : candidates.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500">
                    {tr("buKategorilerdeOnerilebilecekYeniFirma")}
                  </p>
                ) : (
                  <>
                    {listingId ? <p className="mb-3 text-xs text-zinc-600">{tAi("groupMembersLead")}</p> : null}
                    {/* N2 — GÜÇLÜ eşleşenler önce; toplu davet YALNIZ onlara. */}
                    {strongCandidates.length > 0 ? (
                      <section aria-label={tr("grupGucluEslesenler")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="min-w-0 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                            {tr("grupGucluEslesenler")}{" "}
                            <span className="font-normal text-zinc-500">· {strongCandidates.length}</span>
                          </h4>
                          {listingId && strongToInvite.length > 1 ? (
                            <Button
                              type="button"
                              size="sm"
                              className="ml-auto max-w-full"
                              disabled={inviting !== null}
                              onClick={() => void inviteToListing(strongToInvite)}
                            >
                              {inviting === "*" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              {tr("gucluEslesenleriDavetEt", { n: strongToInvite.length })}
                            </Button>
                          ) : null}
                        </div>
                        <ul className="mt-2 space-y-2">{strongCandidates.map(platformRow)}</ul>
                      </section>
                    ) : null}
                    {/* Yalnız aynı sektörde olanlar: ayrı başlık + açıklama, toplu
                        eylem YOK — alıcı tek tek inceleyip davet eder. */}
                    {sectorCandidates.length > 0 ? (
                      <section
                        aria-label={tr("grupAyniSektorde")}
                        className={cn(strongCandidates.length > 0 && "mt-5")}
                      >
                        <h4 className="text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                          {tr("grupAyniSektorde")}{" "}
                          <span className="font-normal text-zinc-500">· {sectorCandidates.length}</span>
                        </h4>
                        <p className="mt-0.5 text-xs text-zinc-600">{tr("ayniSektordeAciklama")}</p>
                        <ul className="mt-2 space-y-2">{sectorCandidates.map(platformRow)}</ul>
                      </section>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {/* Altbilgi sekmenin GERÇEK akışını anlatır (D-098): talepte üye
                doğrudan davet / web'deki firmaya talebe özel e-posta; talepsiz
                açılışta platform sekmesi bağlantı daveti gönderir. Öneriler
                yüklenemediyse (paket kilidi dahil) kullanıcının yürütemeyeceği
                bir davet akışı anlatılmaz. Kaydırılan gövdenin sonunda durur:
                sabit şerit liste alanını daraltıyordu (D10). */}
            {showFooterNote ? (
              <p className="mt-4 border-t border-zinc-950/5 pt-3 text-xs text-zinc-500">
                {listingId
                  ? tab === "platform"
                    ? tr("uyeDogrudanTalebeDavet")
                    : tr("talebeOzelDisDavetNotu")
                  : tr("davetKabulEdilinceFirmaBaglantilariniza")}
              </p>
            ) : null}
          </div>

          {/* GÖNDER DÜĞMESİ SABİT ALT ŞERİTTE (2026-09-17, kullanıcı: "sırf
              görmek için en aşağı inilmemeli"): liste kaydırılır, düğme
              kutunun altında hep görünür. Düğmedeki sayı GERÇEKTEN gidecek
              adres sayısıdır; adresi geçersiz seçili satırlar yanında söylenir.
              Düğmeler `shrink-0` TAŞIMAZ (R6): şeritten uzun etiket (RU
              "Отправить письмо-приглашение (N)", 375 px) düğmeyi pencerenin
              dışına itiyordu — düğme şerit genişliğine daralır, etiket sarar. */}
          {showSendBar ? (
            <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {sendNote || invalidCount > 0 ? (
                  <div className="min-w-0 flex-[1_1_12rem] space-y-0.5 text-xs">
                    {/* N5 — son gönderimin sonucu burada, düğmenin yanında (toast değil). */}
                    {sendNote ? (
                      <p role="status" className="font-medium text-zinc-700">
                        {sendNoteText(sendNote)}
                      </p>
                    ) : null}
                    {invalidCount > 0 ? (
                      <p className="font-medium text-red-700">{tr("gecersizAdresSayisi", { n: invalidCount })}</p>
                    ) : null}
                  </div>
                ) : null}
                {listingId ? (
                  <Button
                    type="button"
                    className="max-w-full"
                    onClick={() => void sendLock.run(sendExternalInvites)}
                    disabled={sendableCount === 0 || sendLock.locked || sendExternal.isPending}
                  >
                    {sendLock.locked || sendExternal.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {tr("davetEPostasiGonderN", { n: sendableCount })}
                  </Button>
                ) : (
                  <Button type="button" className="max-w-full" onClick={collectInvites} disabled={sendableCount === 0}>
                    <Mail className="h-4 w-4" />
                    {tr("talebeEkleN", { n: sendableCount })}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
