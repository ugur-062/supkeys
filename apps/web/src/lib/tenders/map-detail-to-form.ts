import type { ListingDetail } from "@/hooks/use-company-listings";
import { MONEY_DECIMALS, isHiddenCategory, visibleCategoryIds } from "@rothern/shared";
import { toAppWallClockInput } from "@/lib/time-zone";
import {
  DEFAULT_FORM_VALUES,
  nowLocalDateTimeValue,
  type TenderFormData,
} from "./form-schema";

type Currency = TenderFormData["primaryCurrency"];

/**
 * ISO → datetime-local input ("YYYY-MM-DDTHH:mm") — ÜRÜN saat diliminde
 * (Europe/Istanbul; gösterimle aynı, 2026-09-27). Tarayıcı saatiyle yazılsaydı
 * yurt dışındaki kullanıcının seçtiği saat ekranda başka görünürdü.
 */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return toAppWallClockInput(d);
}

/**
 * ISO → date input ("YYYY-MM-DD") — TARİH-ONLY, saat dilimi dönüşümü YOK.
 * Kayıt tarafı (`map-to-input` `new Date("YYYY-MM-DD").toISOString()`) günü
 * UTC gece yarısı yazar; burada da UTC alanlarıyla okunur ki simetrik olsun.
 * Tarayıcının yerel alanlarıyla okumak UTC'nin batısında (Amerika) günü bir
 * geri gösteriyor, her Düzenle/Kopyala kaydında bir gün daha kaydırıyordu
 * (derin denetim S095).
 */
export function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Faz 6.5 — kopya başlığı: "(kopya) (kopya)" zinciri yerine tek seviye
 * sayaç. "X" → "X (2)", "X (2)" → "X (3)", "X (kopya) (kopya)" → "X (2)".
 * (Başlık wizard'da düzenlenebilir — sayaç yalnız çakışmayan varsayılandır.)
 */
export function copyTitle(title: string): string {
  const base = title.replace(/(\s*\(kopya\))+\s*$/i, "").trimEnd();
  const m = base.match(/^(.*)\s\((\d+)\)$/);
  if (m) return `${m[1]} (${Number(m[2]) + 1})`;
  return `${base} (2)`;
}

/**
 * Talep, artık sunulmayan (gizli segment) bir kategori taşıyor mu?
 *
 * `mapDetailToForm` o kodu forma vermez; alan boş açılır ve form nedenini
 * `initialValues`ten bilemez. Düzenleme sayfası cevabı `QuickRequest
 * retiredCategory` ile verir, alan "önceki kategori artık kullanılmıyor" der
 * (kategorinin adı anılmaz).
 *
 * KAYNAK: güncel API sahibine yalnız GÖRÜNÜR kodları döndürür ve saklanan
 * gizli kodu `hasRetiredCategory` işaretiyle haber verir (kod / ad gelmez).
 * Saklanan kodları taşıyan yanıtta (eski API, şablon, oturum taslağı) cevap
 * kodlardan okunur.
 */
export function hasRetiredCategory(l: Pick<ListingDetail, "categoryIds" | "hasRetiredCategory">): boolean {
  return l.hasRetiredCategory === true || (l.categoryIds ?? []).some((id) => isHiddenCategory(id));
}

/**
 * "BU TOHUM KULLANIMDAN KALKAN KATEGORİLİ BİR TALEPTEN GELDİ" İŞARETİ (canlı
 * doğrulama 2026-10-09, CP-05).
 *
 * `mapDetailToForm` gizli kodu forma vermez ve form değerleri şemayla sınırlıdır
 * — "kaynakta eski kategori vardı" bilgisi değerlerin İÇİNDE taşınamaz. Düzenleme
 * sayfası bunu ayrı bir prop'la söylüyordu; kopya yolları (`?from=` ile yeni
 * talep, "Son taleplerden başla") söylemiyordu: kategori alanı nedensiz boş
 * açılıyordu. İşaret artık tohumun KENDİSİNE bağlı: eşleyicinin döndürdüğü nesne
 * burada kayıtlıdır, tohumu alan form `seedHasRetiredCategory` ile sorar — araya
 * giren her çağıranın bilgiyi elden ele taşıması gerekmez. Nesne kimliğiyle
 * çalışır: tohum kopyalanırsa işaret taşınmaz (çağıranlar tohumu aynen geçirir).
 */
const RETIRED_CATEGORY_SEEDS = new WeakSet<object>();

/** Tohum (`mapDetailToForm` çıktısı) kullanımdan kalkan kategori taşıyan bir talepten mi üretildi? */
export function seedHasRetiredCategory(seed: object | null | undefined): boolean {
  return !!seed && RETIRED_CATEGORY_SEEDS.has(seed);
}

/**
 * ListingDetail → wizard form (mapToInput'un tersi). Düzenle ve Kopyala
 * akışları paylaşır. `forCopy=true` ise tarih/davet gibi kopyaya taşınmaması
 * gereken alanlar boşaltılır.
 */
export function mapDetailToForm(
  l: ListingDetail,
  opts?: { forCopy?: boolean },
): TenderFormData {
  const forCopy = opts?.forCopy ?? false;
  const allowed = (l.allowedCurrencies ?? []).filter(Boolean) as Currency[];
  const primary = (l.primaryCurrency as Currency) ?? "TRY";
  const form: TenderFormData = {
    ...DEFAULT_FORM_VALUES,
    // Gizli segmentteki kod forma TAŞINMAZ (2026-10-09): düzenlemede ve kopyada
    // çip olarak görünmez, yeni talebe ön-seçili gelmez. Görünür kategorisi
    // kalmayan talepte formun kendi "kategori zorunlu" kuralı güncel bir
    // kategori ister (yayın kapısı gizli kodu zaten reddeder). TEK İSTİSNA
    // yayındaki talebin düzenlemesi: orada kategori zorunlu değildir, eski
    // değer ilgisiz bir düzenlemeyi engellemez (`QuickRequest` categoryOptional).
    categoryIds: visibleCategoryIds(l.categoryIds),
    preferredActivities: l.preferredActivities ?? [],
    title: forCopy ? copyTitle(l.title) : l.title,
    description: l.description ?? "",
    keywords: l.keywords ?? [],
    // Kopya daima RFQ açılır — İngiliz usulü doğrudan açılamaz (tek yol
    // "Yeni Tur" aktarması); eksiltme ilanının kopyası formatı miras almaz.
    type: forCopy ? "RFQ" : ((l.format as TenderFormData["type"]) ?? "RFQ"),
    targetCountries: l.targetCountries ?? [],
    // Kopya yeni talep: ayarlar varsayılana döner; düzenleme kayıttakini açar.
    aiDiscovery: forCopy ? DEFAULT_FORM_VALUES.aiDiscovery : (l.aiDiscovery ?? false),
    inviteShowName: forCopy ? DEFAULT_FORM_VALUES.inviteShowName : (l.inviteShowName ?? true),
    deliveryAddressId: l.deliveryAddressId ?? "",
    // Fatura adresi teslimattan farklıysa tik kapalı + seçim yüklenir;
    // aynıysa/boşsa tik açık (varsayılan davranış).
    billingSameAsDelivery:
      !l.billingAddressId || l.billingAddressId === l.deliveryAddressId,
    billingAddressId:
      l.billingAddressId && l.billingAddressId !== l.deliveryAddressId
        ? l.billingAddressId
        : undefined,
    // W1: CONNECTIONS de geçerli — edit'te üç değeri de koru (eski collapse
    // CONNECTIONS ilanı PRIVATE'e düşürüyordu).
    visibility:
      l.visibility === "PUBLIC"
        ? "PUBLIC"
        : l.visibility === "CONNECTIONS"
          ? "CONNECTIONS"
          : "PRIVATE",
    isLogistics: l.isLogistics ?? false,
    logistics: {
      ...DEFAULT_FORM_VALUES.logistics,
      ...((l.logistics as Record<string, unknown> | null) ?? {}),
    },
    requireAllItems: l.requireAllItems ?? false,
    requireBidDocument: l.requireBidDocument ?? false,
    showTargetToSuppliers: l.showTargetToSuppliers ?? false,
    primaryCurrency: primary,
    allowedCurrencies: allowed.length > 0 ? allowed : [primary],
    deliveryTerm:
      (l.deliveryTerm as TenderFormData["deliveryTerm"]) ?? undefined,
    paymentCategory:
      (l.paymentCategory as TenderFormData["paymentCategory"]) ??
      "OPEN_ACCOUNT",
    advancePercent: l.advancePercent ?? undefined,
    paymentDays: l.paymentDays ?? undefined,
    lcType: (l.lcType as TenderFormData["lcType"]) ?? undefined,
    lcConfirmed: l.lcConfirmed ?? false,
    paymentNote: l.paymentNote ?? "",
    requireGuaranteeLetter: l.requireGuaranteeLetter ?? false,
    termsAndConditions: l.terms ?? "",
    // Kopyada kapanış boş (kullanıcı yeniden seçer); açılış "şimdi" öntanımlı.
    bidsCloseAt: forCopy ? "" : toLocalInput(l.closesAt),
    bidsOpenAt: forCopy ? nowLocalDateTimeValue() : toLocalInput(l.bidsOpenAt),
    bidVisibility:
      (l.bidVisibility as TenderFormData["bidVisibility"]) ?? "OWN_ONLY",
    // Eski (API ile açılmış) talepte 3-4 olabilir; tavan teklif/DB ölçeği.
    decimalPlaces: Math.min(l.decimalPlaces ?? 2, MONEY_DECIMALS),
    autoExtendOnLateBid: l.autoExtendOnLateBid ?? true,
    autoExtendThresholdMin: l.autoExtendThresholdMin ?? undefined,
    autoExtendByMinutes: l.autoExtendByMinutes ?? undefined,
    items:
      l.items && l.items.length > 0
        ? l.items.map((it) => ({
            name: it.name,
            description: it.description ?? "",
            quantity: Number(it.quantity),
            unit: it.unit,
            unitCode: it.unitCode ?? null,
            brand: it.brand ?? "",
            mpn: it.mpn ?? "",
            alternativeAllowed: it.alternativeAllowed ?? true,
            specification: it.specification ?? "",
            warrantyMonths: it.warrantyMonths ?? undefined,
            hsCode: it.hsCode ?? "",
            materialCode: it.materialCode ?? "",
            requiredByDate: toDateInput(it.requiredByDate),
            targetUnitPrice:
              it.targetPrice != null ? Number(it.targetPrice) : undefined,
            customQuestion: "",
            questions: (it.questions ?? []).map((q) => ({
              id: q.id,
              text: q.text,
              answerType: q.answerType,
              required: q.required,
            })),
          }))
        : DEFAULT_FORM_VALUES.items,
    // Kopyada davetliler taşınır (aynı tedarikçi havuzu); düzenlemede de aynı.
    invitedSupplierIds: (l.invitations ?? [])
      .map((iv) => iv.rothernId)
      .filter((s): s is string => !!s),
  };
  if (hasRetiredCategory(l)) RETIRED_CATEGORY_SEEDS.add(form);
  return form;
}
