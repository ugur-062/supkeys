/**
 * TEKLİF FORMU TASLAĞI — GERİ HAREKETİ FİYATLARI SİLMEZ (mobil denetim 2026-10
 * g08 "Vazgeç / geri hareketi").
 *
 * Teklif formu kaydedilmemiş editör durumudur: fiyatlar "Taslak olarak kaydet"e
 * ya da gönderime kadar yalnız bellekte. Telefonda geri hareketi (Android geri,
 * iOS kaydırma) App Router'da gezinme olayı üretmez, soru da sorulamaz — yazılan
 * fiyatlar sessizce gidiyordu. Çözüm Profilim "Hakkında" taslağıyla aynı
 * (`lib/company/profile-about-draft.ts`): kaydedilmemiş form sürekli buraya
 * yazılır, form yeniden açılınca geri yüklenir.
 *  · depo `sessionStorage` — taslak sekmeyle biter (fiyat ticari veridir);
 *  · anahtar kullanıcı + talep kimliğine bağlı, kayıt firma kimliğini taşır —
 *    aynı sekmede başka hesabın/firmanın taslağı okunmaz; önek çıkışta
 *    silinen önekler arasında (`tenant-storage.ts` `TENANT_SESSION_PREFIXES`);
 *  · kayıt sunucudaki teklifin parmak izini (`base`) taşır — teklif bu arada
 *    kaydedildiyse / gönderildiyse / yeni tura geçtiyse eski taslak okunmaz;
 *  · okumak SİLMEZ; silindiği yerler: gönderim, taslak kaydı, "Değişiklikleri
 *    at" ve ayrılma diyaloğunda "Ayrıl";
 *  · depo kapalıysa (gizli sekme) sessizce yok sayılır — form yine çalışır.
 *
 * Seçilen dosyalar (File) saklanamaz; yalnız form alanları.
 */
export const BID_FORM_DRAFT_PREFIX = "rothern:bid-form-draft";

/** Saklanan biçim değişince ARTIRILIR; tanınmayan sürümün kaydı okunmaz ve silinir. */
export const BID_FORM_DRAFT_VERSION = 1;

/** Kalem başına form durumu (teklif formundaki `ItemState` ile aynı biçim). */
export interface BidFormItemDraft {
  price: string | null;
  deliveryTime: string;
  currency: string;
  answers: Record<string, string>;
  isAlternative: boolean;
  offeredBrand: string;
  offeredMpn: string;
}

export interface BidFormDraft {
  itemState: Record<string, BidFormItemDraft>;
  singleAmount: string;
  deliveryTime: string;
  validityDays: string;
  currency: string;
  note: string;
}

export interface BidFormDraftScope {
  userId: string;
  companyId: string;
  listingId: string;
  /** Sunucudaki teklifin parmak izi (`bidDraftBase`). */
  base: string;
}

const EMPTY_ITEM: BidFormItemDraft = {
  price: "",
  deliveryTime: "",
  currency: "",
  answers: {},
  isAlternative: false,
  offeredBrand: "",
  offeredMpn: "",
};

const keyFor = (userId: string, listingId: string) =>
  `${BID_FORM_DRAFT_PREFIX}:${userId}:${listingId}`;

/**
 * Sunucudaki teklifin parmak izi: teklif yokken "none"; varsa durum + sürüm +
 * tur + son güncelleme. Taslak kaydı, gönderim ya da yeni tur bunu değiştirir.
 */
export function bidDraftBase(
  bid:
    | { status: string; version?: number; round?: number; updatedAt?: string }
    | null
    | undefined,
): string {
  if (!bid) return "none";
  return [bid.status, bid.version ?? "", bid.round ?? "", bid.updatedAt ?? ""].join("|");
}

/**
 * Formun sıra bağımsız özeti — "değişti mi" kıyası için. Kalemler talebin
 * kalem sırasıyla, boş soru cevabı ile hiç girilmemiş cevap eş sayılır
 * (yazıp silmek formu kirletmez).
 */
export function bidFormFingerprint(form: BidFormDraft, itemIds: readonly string[]): string {
  return JSON.stringify([
    itemIds.map((id) => {
      const st = form.itemState[id] ?? EMPTY_ITEM;
      const answers = Object.entries(st.answers ?? {})
        .filter(([, v]) => v !== "")
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return [
        id,
        st.price,
        st.deliveryTime,
        st.currency,
        answers,
        st.isAlternative,
        st.offeredBrand,
        st.offeredMpn,
      ];
    }),
    form.singleAmount,
    form.deliveryTime,
    form.validityDays,
    form.currency,
    form.note,
  ]);
}

const isStr = (v: unknown): v is string => typeof v === "string";

function parseItem(raw: unknown): BidFormItemDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.price !== null && !isStr(r.price)) return undefined;
  if (!isStr(r.deliveryTime) || !isStr(r.currency)) return undefined;
  if (typeof r.isAlternative !== "boolean") return undefined;
  if (!isStr(r.offeredBrand) || !isStr(r.offeredMpn)) return undefined;
  if (!r.answers || typeof r.answers !== "object") return undefined;
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
    if (!isStr(v)) return undefined;
    answers[k] = v;
  }
  return {
    price: r.price as string | null,
    deliveryTime: r.deliveryTime,
    currency: r.currency,
    answers,
    isAlternative: r.isAlternative,
    offeredBrand: r.offeredBrand,
    offeredMpn: r.offeredMpn,
  };
}

function parseForm(raw: unknown): BidFormDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  for (const k of ["singleAmount", "deliveryTime", "validityDays", "currency", "note"] as const) {
    if (!isStr(r[k])) return undefined;
  }
  if (!r.itemState || typeof r.itemState !== "object") return undefined;
  const itemState: Record<string, BidFormItemDraft> = {};
  for (const [id, v] of Object.entries(r.itemState as Record<string, unknown>)) {
    const item = parseItem(v);
    if (!item) return undefined;
    itemState[id] = item;
  }
  return {
    itemState,
    singleAmount: r.singleAmount as string,
    deliveryTime: r.deliveryTime as string,
    validityDays: r.validityDays as string,
    currency: r.currency as string,
    note: r.note as string,
  };
}

export function saveBidFormDraft(scope: BidFormDraftScope, form: BidFormDraft): void {
  if (!scope.userId || !scope.companyId || !scope.listingId) return;
  try {
    sessionStorage.setItem(
      keyFor(scope.userId, scope.listingId),
      JSON.stringify({
        v: BID_FORM_DRAFT_VERSION,
        companyId: scope.companyId,
        base: scope.base,
        form,
      }),
    );
  } catch {
    // depo kapalı / dolu — taslak korunmaz, form çalışır
  }
}

/**
 * Taslağı okur (silmez). Kayıt yoksa `null`. Bozuk kayıt, tanınmayan sürüm,
 * BAŞKA firmaya ait ya da sunucudaki teklif değiştikten sonra kalmış kayıt
 * `null` döner VE silinir (bir daha okunmasın).
 */
export function readBidFormDraft(scope: BidFormDraftScope): BidFormDraft | null {
  if (!scope.userId || !scope.companyId || !scope.listingId) return null;
  const key = keyFor(scope.userId, scope.listingId);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const p = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const form = p ? parseForm(p.form) : undefined;
    if (
      !p ||
      !form ||
      p.v !== BID_FORM_DRAFT_VERSION ||
      p.companyId !== scope.companyId ||
      p.base !== scope.base
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return form;
  } catch {
    return null;
  }
}

export function clearBidFormDraft(userId: string, listingId: string): void {
  if (!userId || !listingId) return;
  try {
    sessionStorage.removeItem(keyFor(userId, listingId));
  } catch {
    // yok say
  }
}

/**
 * Saklanan taslağı sunucu tohumunun ÜSTÜNE uygular: yalnız talepte HÂLÂ olan
 * kalemler alınır (alıcı kalem sildiyse eski satır forma sızmaz), taslakta
 * olmayan kalem tohumda kalır.
 */
export function mergeBidFormDraft(
  seed: BidFormDraft,
  draft: BidFormDraft,
  itemIds: readonly string[],
): BidFormDraft {
  const itemState: Record<string, BidFormItemDraft> = {};
  for (const id of itemIds) {
    const fromDraft = draft.itemState[id];
    const fromSeed = seed.itemState[id];
    if (fromDraft) itemState[id] = fromDraft;
    else if (fromSeed) itemState[id] = fromSeed;
  }
  return {
    itemState,
    singleAmount: draft.singleAmount,
    deliveryTime: draft.deliveryTime,
    validityDays: draft.validityDays,
    currency: draft.currency,
    note: draft.note,
  };
}
