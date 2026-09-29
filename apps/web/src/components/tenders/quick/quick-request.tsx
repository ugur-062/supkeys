"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { PreferredActivitiesField } from "@/components/tenders/preferred-activities-field";
import { NumberedSection } from "@/components/ui/numbered-section";
import { AddressInline } from "./address-inline";
import { RecentRequests } from "./recent-requests";
import { StagedDocuments, type StagedListingDoc } from "@/components/tenders/wizard/staged-documents";
import { uploadListingDocument } from "@/hooks/use-listing-documents";
import { useConnections } from "@/hooks/use-company-connections";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { useAiSeoEnrich } from "@/hooks/use-ai-seo-enrich";
import { useAiRequestDraftSuggest } from "@/hooks/use-ai-tender-import";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { Link } from "@/i18n/navigation";
import { CategorySuggest } from "./category-suggest";
import { AddressPicker } from "./address-picker";
import { Step2Items } from "@/components/tenders/wizard/step-2-items";
import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { Button } from "@/components/ui/button";
import { PublishedPanel } from "./published-panel";
import { SetupCard } from "./setup-card";
import { SupplierPicker } from "./supplier-picker";
import { clearFormSupplierPanel, FormSupplierPanel } from "@/components/tenders/ai-suppliers/form-supplier-panel";
import { TermsPanel } from "./terms-panel";
import { RequestDefaultsForm, useVisibilityLabels } from "@/components/tenders/request-defaults-form";
import { useAiMissingFieldLabel, useCityLabel, useFormatPaymentPlan, usePaymentCategoryLabel } from "@/i18n/domain";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useAddresses, type CompanyAddress } from "@/hooks/use-company-addresses";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCreateListing, usePublishListing, useUpdateListing } from "@/hooks/use-company-listings";
import { useSaveTemplate } from "@/hooks/use-listing-templates";
import { SaveTemplateDialog } from "@/components/tenders/wizard/save-template-dialog";
import { useRequestDefaults, useSaveRequestDefaults } from "@/hooks/use-request-defaults";
import { formatDate } from "@/lib/format-date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { DEFAULT_FORM_VALUES, makeTenderFormSchema, type TenderFormData } from "@/lib/tenders/form-schema";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { parseAppWallClockInput } from "@/lib/time-zone";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapToInput } from "@/lib/tenders/map-to-input";
import { applyConnectionsScope } from "@/lib/tenders/connections-scope";
import {
  MAX_PENDING_EXTERNAL_INVITES,
  QUICK_DRAFT_KEY,
  clearSession,
  normalizeExternalInvites,
  normalizeMemberInvites,
  pendingInvitesKey,
  pendingMemberInvitesKey,
  readSession,
  writeSession,
  type QuickDraft,
} from "@/lib/tenders/quick-draft";
import {
  useExternalTenderInvite,
  useInviteDiscoveredMembers,
  type ExternalInviteResult,
  type ExternalInviteTarget,
  type MemberInviteResult,
  type MemberInviteTarget,
} from "@/hooks/use-supplier-discovery";
import { isInviteAccepted } from "@/lib/tenders/external-invite-status";
import { InviteLocaleSelect } from "@/components/company/invite-locale-select";
import { titleFromItems, type TitleTranslate } from "@/lib/tenders/quick-parse";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm, initialRequestFormValues, type QuickSeedKind } from "@/lib/tenders/request-defaults";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { REQUEST_CLOSE_DAY_OPTIONS, REQUEST_DEFAULTS_FALLBACK, listingSeoReadiness, requestDefaultsFallbackFor, type AiTenderExtractResult, type RequestDefaults } from "@rothern/shared";
import { CheckIcon, ExclamationTriangleIcon, GlobeAltIcon, SparklesIcon, UserGroupIcon, UserPlusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Sparkles } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

/** Üye daveti sonucu + ad (yayın paneli satır satır gösterir). */
export type NamedMemberResult = MemberInviteResult & { name: string };

/**
 * HIZLI TALEP — tek ekran, üç numaralı bölüm + sağda özet (2026-09-09 v2).
 *
 *  1 Ne lazım?           — kalem satırları SİHİRBAZLA AYNI bileşen
 *                          (`Step2Items`: Kalem Adı · Miktar · Birim · Stok
 *                          Kodu, Detaylar, Katalogdan/Excel/Yeni Kalem) +
 *                          "Belgeden Doldur" (AI-1), başlık, kategori, açıklama.
 *                          Serbest metin "Ne lazım?" kutusu ve satır
 *                          ayrıştırıcı KALDIRILDI (kullanıcı kararı 2026-09-10:
 *                          "detaylı sihirbazdaki gibi olacak").
 *  2 Nereye, ne zamana   — adres kartları (+satır içi ekleme), süre çipleri
 *                          + hesaplanmış kapanış tarihi
 *  3 Kime                — üç görünürlük kartı + kompakt bağlantı seçici
 *  Sağ ray               — Özet & yayın (ne · nereye · ne zamana · kime),
 *                          Şartlar (profilden, satır satır değiştir),
 *                          Teklif kalitesi ipucu. Mobilde yapışkan alt çubuk.
 *
 * Form modeli ve doğrulama SİHİRBAZLA AYNI (`tenderFormSchema`), gövde AYNI
 * (`mapToInput`); yeni backend akışı yok. Renk satınalma: mavi.
 */
/** Varsayılan teslimat adresi: varsayılan TESLİMAT → ilk TESLİMAT → FATURA dışı ilk adres. */
function pickDeliveryAddress(list: CompanyAddress[]): CompanyAddress | undefined {
  return (
    list.find((a) => a.isDefault && a.type === "TESLIMAT") ??
    list.find((a) => a.type === "TESLIMAT") ??
    list.find((a) => a.type !== "FATURA")
  );
}

export function QuickRequest({
  initialValues,
  mode = "new",
  listingId,
  listingStatus,
  seedTerms = false,
}: {
  initialValues?: Partial<TenderFormData>;
  /** `edit`: mevcut talebi günceller (2026-09-19: detaylı sihirbaz kaldırıldı, düzenleme de bu kart). */
  mode?: "new" | "edit";
  listingId?: string;
  /**
   * Düzenlenen talebin durumu. DRAFT dışı (teklifsiz OPEN) talepte birincil
   * düğme "Değişiklikleri kaydet" olur ve yayın ucu ÇAĞRILMAZ (derin denetim
   * Y-20: `publish` yalnız taslağı kabul eder, 400 dönüyordu).
   */
  listingStatus?: string;
  /** Tohum (kopya/şablon) kendi ticari şartlarını taşır — profil varsayılanı onları EZMEZ. */
  seedTerms?: boolean;
}) {
  const tr = useTranslations("web.panel.requests.quickRequest");
  // Şema mesajları (`formSchema.*`, `closesAt.*`) ve üretilen başlık sözcükleri
  // (`quickParse.*`) üst ad alanından — form kullanıcının diliyle kurulur.
  const tReq = useTranslations("web.panel.requests");
  const tAi = useTranslations("web.panel.requests.aiSuppliers");
  const locale = useLocale() as Locale;
  const formatPaymentPlan = useFormatPaymentPlan();
  const missingLabel = useAiMissingFieldLabel();
  const paymentCategoryLabel = usePaymentCategoryLabel();
  const cityLabel = useCityLabel();
  // Görünürlük kartı etiketleri Talep Şartları formuyla AYNI kaynaktan (`requestDefaultsForm.visibility.*`).
  const visibilityLabels = useVisibilityLabels();
  const schema = useMemo(() => makeTenderFormSchema((key, values) => tReq(key as never, values as never)), [tReq]);
  const titleT: TitleTranslate = (key, values) => tReq(`quickParse.${key}` as never, values as never);
  const makeTitle = (items: { name: string }[]) => titleFromItems(items, titleT, locale);
  const isEdit = mode === "edit" && !!listingId;
  // Yayındaki (teklifsiz) talebi düzenleme: kaydet = PATCH + bekleyen davetler.
  const isLiveEdit = isEdit && !!listingStatus && listingStatus !== "DRAFT";
  // Düzenleme/kopya/şablon talebin KENDİ şartlarıyla açılır (derin denetim Y-19).
  const seedKind: QuickSeedKind = isEdit ? "edit" : seedTerms && initialValues ? "seed" : "blank";
  const router = useRouter();
  const { company } = useCompanyAuth();
  const canManage = useHasCompanyPermission("buy:listing:manage");
  const defaultsQ = useRequestDefaults();
  // Kayıtlı şart yoksa platform varsayılanı firmanın ülkesine göre (para
  // birimi: yabancı alıcı TRY ile başlamasın — 2026-09-27).
  const companyCountry = useCompanyAuthStore((st) => st.company?.country);
  const saveDefaults = useSaveRequestDefaults();
  const addresses = useAddresses();
  const create = useCreateListing();
  const update = useUpdateListing(listingId ?? "");
  const publishExisting = usePublishListing(listingId ?? "");
  const saveTemplate = useSaveTemplate();
  const [templateOpen, setTemplateOpen] = useState(false);
  const sendExternal = useExternalTenderInvite();
  const sendMembers = useInviteDiscoveredMembers();
  const busy = create.isPending || update.isPending || publishExisting.isPending || sendExternal.isPending || sendMembers.isPending;

  const [terms, setTerms] = useState<RequestDefaults | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  // AI ile başlık + kategori (2026-09-17): kalemlerden; başlık ve kategori
  // ÜZERİNE yazılır (düğmeye bilinçli basıldı), anahtar kelimeler yalnız boşsa.
  const draftSuggest = useAiRequestDraftSuggest();
  const [published, setPublished] = useState<{
    id: string;
    title: string;
    categoryIds: string[];
    itemNames: string[];
    inviteResults: ExternalInviteResult[] | "error" | null;
    memberResults: NamedMemberResult[] | "error" | null;
  } | null>(null);
  // AI keşfinden eklenen dış davet alıcıları (adres + dil + ülke) — YAYINDA
  // talebe özel davet (`external-tender-invite`) gider; yayından önce e-posta
  // GİTMEZ (2026-09-27). Dil satırda değiştirilebilir.
  const [externalInvites, setExternalInvites] = useState<ExternalInviteTarget[]>([]);
  // AI'ın bulduğu Rothern üyeleri (2026-09-28) — YAYINDA talebe doğrudan davet.
  const [memberInvites, setMemberInvites] = useState<MemberInviteTarget[]>([]);
  const [stagedDocs, setStagedDocs] = useState<StagedListingDoc[]>([]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const connections = useConnections();
  const seoEnrich = useAiSeoEnrich();

  const form = useForm<TenderFormData>({
    resolver: zodResolver(schema),
    defaultValues: { ...DEFAULT_FORM_VALUES, ...initialValues },
    mode: "onTouched",
  });
  const { watch, setValue, getValues, reset } = form;
  const connectionIds = useMemo(
    () => (connections.data ?? []).map((c) => c.company.rothernId).filter((id): id is string => !!id),
    [connections.data],
  );
  // BAĞLANTILARIM = GÖRÜNÜRLÜK LİSTESİ (2026-09-19, kullanıcı kararı): kip
  // seçilince ya da bağlantılar yüklenince liste boşsa TÜM bağlantılar
  // işaretli başlar; alıcı çıkardığını görmez (`applyConnectionsScope`).
  // Yalnız bir kez doldurulur — "Tümünü kaldır" sonrası yeniden dolmaz.
  const autoFilled = useRef(false);
  const watchedVisibility = watch("visibility");
  const watchedInvited = watch("invitedSupplierIds");
  useEffect(() => {
    if (watchedVisibility !== "CONNECTIONS") {
      autoFilled.current = false;
      return;
    }
    if (autoFilled.current || connectionIds.length === 0) return;
    autoFilled.current = true;
    if ((watchedInvited ?? []).length === 0) setValue("invitedSupplierIds", connectionIds, { shouldDirty: false });
  }, [watchedVisibility, watchedInvited, connectionIds, setValue]);

  /* Profil yüklenince şartları forma uygula (bir kez); taslak varsa geri getir. */
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!defaultsQ.data || appliedRef.current) return;
    appliedRef.current = true;
    const d = defaultsQ.data.defaults ?? requestDefaultsFallbackFor(companyCountry);
    const draft = initialValues ? null : readSession<QuickDraft>(QUICK_DRAFT_KEY);
    const base = initialRequestFormValues(seedKind, initialValues, d);
    // Şartlar paneli formdaki şartları gösterir: düzenleme/kopya/şablonda
    // talebin kendisi, boş kartta profil.
    setTerms(seedKind === "blank" ? d : defaultsFromForm(base, d.closeDays));
    const { externalInvites: draftInvites, memberInvites: draftMembers, ...draftFields } = draft ?? {};
    reset(draft ? { ...base, ...draftFields, bidsCloseAt: base.bidsCloseAt } : base);
    if (draft) setRestoredDraft(true);
    // Bekleyen dış davetler: yeni kartta taslaktan, düzenlemede taslak
    // kaydında bırakılan listeden.
    // Eski taslak düz adres dizisi taşıyabilir — dil kuralla türetilir.
    const pending = normalizeExternalInvites(
      isEdit && listingId ? readSession<unknown>(pendingInvitesKey(listingId)) : draftInvites,
      locale,
    );
    if (pending.length) setExternalInvites(pending.slice(0, MAX_PENDING_EXTERNAL_INVITES));
    const pendingMembers = normalizeMemberInvites(
      isEdit && listingId ? readSession<unknown>(pendingMemberInvitesKey(listingId)) : draftMembers,
    );
    if (pendingMembers.length) setMemberInvites(pendingMembers.slice(0, MAX_PENDING_EXTERNAL_INVITES));
  }, [defaultsQ.data, initialValues, reset, isEdit, listingId, companyCountry, locale, seedKind]);

  /* Varsayılan teslimat adresi — şartlar uygulandıktan SONRA ve adresler
     yüklenince, formda adres YOKSA bir kez (düzenlenen talebin adresi ezilmez).
     Ayrı efekt: sorgular hangi sırayla dönerse dönsün seçilir (derin denetim
     S083; eskiden şartlar önce gelirse hiç seçilmiyordu). FATURA adresi
     teslimat seçicisinde görünmez → geri düşüşte de seçilmez. */
  const addressPickedRef = useRef(false);
  useEffect(() => {
    if (!appliedRef.current || addressPickedRef.current || !addresses.data) return;
    addressPickedRef.current = true;
    if (getValues("deliveryAddressId")) return;
    const pick = pickDeliveryAddress(addresses.data);
    if (pick) setValue("deliveryAddressId", pick.id);
  }, [defaultsQ.data, addresses.data, getValues, setValue]);

  const closeDays = terms?.closeDays ?? REQUEST_DEFAULTS_FALLBACK.closeDays;
  const updateTerms = (next: RequestDefaults) => {
    setTerms(next);
    const cur = getValues();
    reset(
      {
        ...applyRequestDefaults(cur, next),
        items: cur.items,
        title: cur.title,
        description: cur.description,
        categoryIds: cur.categoryIds,
        invitedSupplierIds: cur.invitedSupplierIds,
        deliveryAddressId: cur.deliveryAddressId || next.deliveryAddressId || "",
        visibility: cur.visibility,
        bidsCloseAt: cur.bidsCloseAt || closesAtFromDays(next.closeDays),
      },
      { keepDirty: true },
    );
  };

  /* Taslak otomatik saklama (niyet alanları). Düzenlemede YAZILMAZ: yeni
     talep taslağıdır; düzenlenen talebin içeriği sonraki boş "Yeni talep"
     formuna sızıyordu (bekleyen davetler düzenlemede kendi anahtarında). */
  const watched = watch();
  useEffect(() => {
    if (isEdit || !appliedRef.current || published) return;
    const { title, description, items, categoryIds, keywords, deliveryAddressId, visibility, invitedSupplierIds, bidsCloseAt } = watched;
    if (!title && items.every((i) => !i.name)) return;
    writeSession(QUICK_DRAFT_KEY, { title, description, items, categoryIds, keywords, deliveryAddressId, visibility, invitedSupplierIds, bidsCloseAt, externalInvites, memberInvites } satisfies QuickDraft);
  }, [watched, published, externalInvites, memberInvites, isEdit]);

  const items = watched.items ?? [];
  const namedItems = items.filter((i) => i.name.trim().length > 0);
  const hasItems = namedItems.length > 0;
  const quality = useMemo(
    () =>
      listingSeoReadiness({
        title: watched.title ?? "",
        description: watched.description ?? null,
        categoryIds: watched.categoryIds ?? [],
        items: items.map((i) => ({ name: i.name, description: i.description ?? null, quantity: i.quantity, unit: i.unit })),
      }),
    [watched.title, watched.description, watched.categoryIds, items],
  );
  const { data: catRows = [] } = useCategoriesByIds(watched.categoryIds ?? []);
  const selectedAddress = (addresses.data ?? []).find((a) => a.id === watched.deliveryAddressId) ?? null;
  // Hook'lar erken dönüşlerden (yayın sonrası / iskelet) ÖNCE — sıra değişmez.
  const publicCount = useCompanySearch({ category: (watched.categoryIds ?? []).join(",") || undefined }, watched.visibility === "PUBLIC");

  /* --- Belgeden doldur (AI-1): kalem satırlarına ekler; başlık boşsa türetir.
     Katalog ve Excel girişleri `Step2Items` içinde (sihirbazla aynı). */
  const appendItems = (next: TenderFormData["items"], titleFallback?: string) => {
    const cur = getValues();
    const merged = [...cur.items.filter((i) => i.name.trim()), ...next];
    setValue("items", merged.length ? merged : cur.items, { shouldDirty: true, shouldValidate: true });
    if (!cur.title.trim()) setValue("title", titleFallback || makeTitle(merged), { shouldDirty: true });
  };
  const applyDocument = (r: AiTenderExtractResult) => {
    const mapped = mapAiDraftToForm(r.draft, getValues());
    appendItems(mapped.items.filter((i) => i.name.trim()), mapped.title || undefined);
    const cur = getValues();
    if (!cur.description?.trim() && mapped.description) setValue("description", mapped.description, { shouldDirty: true });
    if (!cur.categoryIds.length && mapped.categoryIds.length) setValue("categoryIds", mapped.categoryIds, { shouldDirty: true, shouldValidate: true });
    if (r.missingRequired?.length) toast.warning(tr("belgedenOkunamayanAlanlar", { join: r.missingRequired.map(missingLabel).join(", ") }));
    else toast.success(tr("belgedenDoldurulduKalemleriKontrolEdin"));
  };

  /* --- Süre */
  const setCloseDays = (days: number) => {
    setValue("bidsCloseAt", closesAtFromDays(days), { shouldDirty: true, shouldValidate: true });
    if (terms) setTerms({ ...terms, closeDays: days });
  };
  const currentCloseDays = useMemo(() => {
    const v = watched.bidsCloseAt;
    if (!v) return closeDays;
    const d = Math.round(((parseAppWallClockInput(v)?.getTime() ?? NaN) - Date.now()) / 86_400_000);
    return d > 0 ? d : closeDays;
  }, [watched.bidsCloseAt, closeDays]);

  /* --- Yayın / taslak / detaylı */
  /**
   * Gövde TEK çağrıda tüm davet listesini taşır ("Bağlantılarım" kipinde tüm
   * bağlantılar; tavan `MAX_LISTING_INVITATIONS`, API ile ortak). Kayıt
   * sonrası ayrı davet çağrısı YAPILMAZ: sunucu düzenlemede davetleri gövdeden
   * yeniden yazar, ayrı çağrı taşan firmaları her kayıtta "yeni davetli"
   * sayıp yeniden e-posta attırıyordu (derin denetim MU-26 gözden geçirme).
   */
  const buildInput = (values: TenderFormData) => mapToInput(applyConnectionsScope(values, connectionIds));
  const submitLock = useRef(false);
  const publish = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      ensureTitle();
      const ok = await form.trigger();
      if (!ok) {
        const errs = form.formState.errors;
        const first = Object.keys(errs)[0];
        if (["deliveryTerm", "paymentCategory", "paymentDays", "advancePercent", "lcType", "paymentNote"].includes(first)) {
          toast.error(tr("sagdakiTicariSartlarPanelindeTeslim"));
          document.getElementById("sartlar-baslik")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        const section = ["items", "title", "categoryIds", "description"].includes(first) ? "talep-ne" : ["deliveryAddressId", "bidsCloseAt", "billingAddressId"].includes(first) ? "talep-nereye" : "talep-kime";
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
        const msg = (errs[first as keyof typeof errs] as { message?: string } | undefined)?.message;
        toast.error(msg ? tr("eksik", { msg }) : tr("eksikAlanlarVarIlgiliBolume"));
        return;
      }
      const values = getValues();
      if (isEdit && listingId) {
        // Düzenleme: önce içerik güncellenir; TASLAK ise sonra yayına alınır.
        // Yayındaki talep zaten açık — yayın ucu yalnız taslağı kabul eder.
        const input = buildInput(values);
        await update.mutateAsync(input);
        await uploadStaged(listingId);
        if (isLiveEdit) {
          toast.success(tr("degisikliklerKaydedildi"));
        } else {
          await publishExisting.mutateAsync({});
          toast.success(tr("talepYayimlandi"));
        }
        const memberResults = await sendPendingMembers(listingId);
        const inviteResults = await sendPendingInvites(listingId);
        clearSession(pendingInvitesKey(listingId));
        clearSession(pendingMemberInvitesKey(listingId));
        if (memberResults === "error") toast.warning(tr("uyeDavetleriGonderilemedi"));
        else if (memberResults) {
          const invited = memberResults.filter((r) => r.status === "INVITED").length;
          if (invited > 0) toast.success(tr("uyeDavetEdildi", { n: invited }));
        }
        if (inviteResults === "error") toast.warning(tr("disDavetlerGonderilemedi"));
        else if (inviteResults) {
          const sent = inviteResults.filter((r) => isInviteAccepted(r.status)).length;
          if (sent > 0) toast.success(tr("disDavetSirayaAlindi", { n: sent }));
          if (sent < inviteResults.length) toast.warning(tr("disDavetGonderilmedi", { n: inviteResults.length - sent }));
        }
        router.push(`/company/ilan/${listingId}`);
        return;
      }
      const input = buildInput(values);
      const listing = await create.mutateAsync(input);
      await uploadStaged(listing.id);
      const memberResults = await sendPendingMembers(listing.id);
      const inviteResults = await sendPendingInvites(listing.id);
      clearSession(QUICK_DRAFT_KEY);
      clearFormSupplierPanel();
      setPublished({
        id: listing.id,
        title: values.title,
        categoryIds: values.categoryIds,
        itemNames: values.items.map((i) => i.name),
        inviteResults,
        memberResults,
      });
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.error(extractErrorMessage(err, isLiveEdit ? tr("degisikliklerKaydedilemedi") : tr("talepYayimlanamadi")));
    } finally {
      submitLock.current = false;
    }
  };
  /**
   * Bekleyen dış davetler — talep YAYINLANDIKTAN sonra, talebe özel davet
   * ucuyla (kayıtlı talepteki akışla aynı gövde). Hata yayını geri almaz:
   * sonuç yayın panelinde (ya da toast'ta) gösterilir.
   */
  const sendPendingInvites = async (id: string): Promise<ExternalInviteResult[] | "error" | null> => {
    if (externalInvites.length === 0) return null;
    try {
      const results = await sendExternal.mutateAsync({
        listingId: id,
        invites: externalInvites.slice(0, MAX_PENDING_EXTERNAL_INVITES),
        source: "AI_FORM",
      });
      setExternalInvites([]);
      return results;
    } catch {
      return "error";
    }
  };
  /**
   * Seçilen Rothern üyeleri — talep YAYINLANDIKTAN sonra doğrudan talebe davet
   * (bağlantı şartı yok, günlük tavan e-posta davetleriyle ortak). Hata yayını
   * geri almaz.
   */
  const sendPendingMembers = async (id: string): Promise<NamedMemberResult[] | "error" | null> => {
    if (memberInvites.length === 0) return null;
    try {
      const results = await sendMembers.mutateAsync({ listingId: id, companyIds: memberInvites.map((m) => m.companyId) });
      const nameOf = new Map(memberInvites.map((m) => [m.companyId, m.name]));
      setMemberInvites([]);
      return results.map((r) => ({ ...r, name: nameOf.get(r.companyId) ?? "" }));
    } catch {
      return "error";
    }
  };
  /** Başlık boşsa kalemlerden türet — satırlar elle girildiğinde otomatik başlık yok. */
  const ensureTitle = () => {
    const v = getValues();
    if (!v.title.trim()) {
      const t = makeTitle(v.items.filter((i) => i.name.trim()));
      if (t) setValue("title", t, { shouldDirty: true });
    }
  };
  const saveDraft = async () => {
    ensureTitle();
    const values = getValues();
    if (values.title.trim().length < 3) {
      toast.error(tr("taslakIcinEnAzBir"));
      return;
    }
    try {
      if (isEdit && listingId) {
        // Taslak kaydı taslak kurallarıyla (kapanış/davetli yayında denetlenir;
        // yeni taslak yoluyla aynı). Yayındaki talepte bu düğme çizilmez.
        const input = buildInput(values);
        await update.mutateAsync({ ...input, asDraft: true });
        await uploadStaged(listingId);
        // Bekleyen dış davetler taslakla birlikte saklanır; yayında gider.
        if (externalInvites.length) writeSession(pendingInvitesKey(listingId), externalInvites);
        else clearSession(pendingInvitesKey(listingId));
        if (memberInvites.length) writeSession(pendingMemberInvitesKey(listingId), memberInvites);
        else clearSession(pendingMemberInvitesKey(listingId));
        toast.success(tr("taslakGuncellendi"));
        router.push(`/company/ilan/${listingId}`);
        return;
      }
      const input = buildInput(values);
      const listing = await create.mutateAsync({ ...input, asDraft: true });
      await uploadStaged(listing.id);
      if (externalInvites.length) writeSession(pendingInvitesKey(listing.id), externalInvites);
      if (memberInvites.length) writeSession(pendingMemberInvitesKey(listing.id), memberInvites);
      clearSession(QUICK_DRAFT_KEY);
      clearFormSupplierPanel();
      toast.success(tr("taslakKaydedildi"));
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("taslakKaydedilemedi")));
    }
  };
  /** Şartname/teknik resim: kayıt oluşunca sırayla yüklenir (sihirbazla aynı). */
  const uploadStaged = async (listingId: string) => {
    let failed = 0;
    for (const d of stagedDocs) {
      try {
        await uploadListingDocument(listingId, d.file, d.kind);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) toast.warning(tr("dosyaYuklenemediTalepSayfasindanTekrar", { failed: failed }));
  };

  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");
  const suggestTitleAndCategory = async () => {
    if (draftSuggest.isPending || namedItems.length === 0) return;
    try {
      const r = await draftSuggest.mutateAsync(
        namedItems.map((i) => ({
          name: i.name,
          quantity: typeof i.quantity === "number" ? i.quantity : Number(i.quantity) || undefined,
          unit: i.unit || undefined,
          description: i.description || undefined,
        })),
      );
      if (r.failed) {
        toast.error(tr("aiOnerisiAlinamadiTekrarDeneyin"));
        return;
      }
      if (r.title) setValue("title", r.title, { shouldDirty: true, shouldValidate: true });
      if (r.categoryIds.length > 0) setValue("categoryIds", r.categoryIds.slice(0, 3), { shouldDirty: true, shouldValidate: true });
      if (r.keywords.length > 0 && (getValues("keywords") ?? []).length === 0) {
        setValue("keywords", r.keywords.map((k) => k.trim().slice(0, 50)).filter(Boolean).slice(0, 10));
      }
      if (!r.title && r.categoryIds.length === 0) toast.info(tr("aiUygunBirOneriBulamadi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("aiOnerisiAlinamadi")));
    }
  };
  // Tedarikçi keşfi API kapısı GOLD (`company/ai/supplier-discovery`).
  const discoveryAvailable = !!company && tierAtLeast(company.tier, BUYING_TIER);
  const discoveryItemNames = (watched.items ?? []).map((i) => (i?.name ?? "").trim()).filter(Boolean);
  const writeDescription = async () => {
    const v = getValues();
    try {
      const r = await seoEnrich.mutateAsync({
        kind: "listing",
        name: v.title || makeTitle(v.items),
        description: v.description ?? null,
        categoryName: catRows[0]?.nameTr ?? null,
        facts: v.items.filter((i) => i.name.trim()).map((i) => `${i.name} — ${i.quantity} ${i.unit}${i.description ? `: ${i.description}` : ""}`),
        city: selectedAddress?.city ?? null,
      });
      setValue("description", r.description, { shouldDirty: true });
      toast.success(tr("aciklamaTaslagiYazildiKontrolEdin"));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("aiAciklamaYazamadi")));
    }
  };

  /** Şablon: kapanış/açılış tarihi ve davetliler her talepte yeniden seçilir — şablona YAZILMAZ. */
  const handleSaveTemplate = async (name: string) => {
    try {
      const payload: Partial<TenderFormData> = { ...getValues() };
      delete payload.bidsCloseAt;
      delete payload.bidsOpenAt;
      delete payload.invitedSupplierIds;
      await saveTemplate.mutateAsync({ name, payload });
      toast.success(tr("sablonuKaydedildi", { name: name }));
      setTemplateOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("sablonKaydedilemedi")));
    }
  };
  const persistDefaults = async (next: RequestDefaults) => {
    try {
      await saveDefaults.mutateAsync(next);
      toast.success(tr("talepSartlariKaydedildiSonrakiTaleplerde"));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("sartlarKaydedilemedi")));
    }
  };

  if (published) {
    return (
      <PublishedPanel
        listingId={published.id}
        title={published.title}
        categoryIds={published.categoryIds}
        itemNames={published.itemNames}
        inviteResults={published.inviteResults}
        memberResults={published.memberResults}
        onNew={() => {
          // Yeni boş talep: profil şartları + varsayılan adres yeniden uygulanır
          // (derin denetim S083 — eskiden çıplak varsayılanlarla açılıyor, şartsız
          // yayın hatası veriyor ve taslak saklama duruyordu).
          const d = defaultsQ.data?.defaults ?? requestDefaultsFallbackFor(companyCountry);
          const base = initialRequestFormValues("blank", undefined, d);
          const pick = base.deliveryAddressId ? null : pickDeliveryAddress(addresses.data ?? []);
          setTerms(d);
          setExternalInvites([]);
          setMemberInvites([]);
          setStagedDocs([]);
          setRestoredDraft(false);
          autoFilled.current = false;
          reset(pick ? { ...base, deliveryAddressId: pick.id } : base);
          setPublished(null);
        }}
      />
    );
  }

  if (defaultsQ.isLoading || !terms) return <Skeleton />;

  // Kurulum kartı yalnız boş kartta — düzenleme/kopya/şablon kendi şartlarını taşır.
  const showSetup = seedKind === "blank" && defaultsQ.data?.source === "none" && !setupDone;
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const visibility = watched.visibility;
  const invited = watched.invitedSupplierIds ?? [];
  // Form değeri ürün saat diliminin duvar saati → önce ana çevrilir.
  const closeLabel = watched.bidsCloseAt ? formatDate(parseAppWallClockInput(watched.bidsCloseAt), "datetime", locale) : null;
  const ready = hasItems && (watched.categoryIds?.length ?? 0) > 0 && (watched.title?.trim().length ?? 0) >= 3;

  const audience =
    visibility === "PUBLIC"
      ? publicCount.data
        ? catRows[0]
          ? tr("pazarYerindeListelenirBuKategoride", { total: publicCount.data.total })
          : tr("pazarYerindeListelenir", { total: publicCount.data.total })
        : null
      : visibility === "CONNECTIONS"
        ? (() => {
            const total = connectionIds.length;
            const on = invited.filter((id) => connectionIds.includes(id)).length;
            if (total === 0) return tr("baglantinizOlmadigiIcinBuTalebi");
            return on === total
              ? tr("baglantinizinTamamiGorecekVeDavet", { total: total })
              : tr("baglantinizdanFirmaGorecekCikardiginiz", { total, on, off: total - on });
          })()
        : invited.length
          ? tr("yalnizDavetEttiginizFirmaGorecek", { length: invited.length })
          : tr("henuzKimseDavetEdilmediEn");

  const paymentLabel =
    formatPaymentPlan({
      paymentCategory: terms.paymentCategory,
      advancePercent: terms.advancePercent,
      paymentDays: terms.paymentDays,
      lcType: terms.lcType,
      lcConfirmed: false,
    }) || paymentCategoryLabel(terms.paymentCategory);

  const summary = {
    what: hasItems ? [tr("kalemSayisi", { n: namedItems.length }), catRows[0]?.nameTr].filter(Boolean).join(" · ") : null,
    where: selectedAddress ? [selectedAddress.title, selectedAddress.city ? cityLabel(selectedAddress.city) : null].filter(Boolean).join(", ") : null,
    when: closeLabel ? tr("gun", { currentCloseDays: currentCloseDays, closeLabel: closeLabel }) : null,
    who: [visibilityLabels[visibility].label, visibility !== "PUBLIC" && invited.length ? tr("davetSayisi", { n: invited.length }) : null].filter(Boolean).join(" · "),
  };

  return (
    <FormProvider {...form}>
      <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_21rem] lg:pb-0">
        <div className="min-w-0 space-y-8">
          {showSetup ? (
            <SetupCard
              value={terms}
              onChange={updateTerms}
              saving={saveDefaults.isPending}
              onDone={() => {
                setSetupDone(true);
                void persistDefaults(terms);
              }}
            />
          ) : null}

          {/* 1 ── NE LAZIM */}
          <NumberedSection
            id="talep-ne"
            n={1}
            accent="blue"
            title={tr("neLazim")}
            lead={tr("kalemleriSatirSatirGirinKatalogunuzdan")}
            status={hasItems ? <Done>{tr("kalemSayisi", { n: namedItems.length })}</Done> : null}
          >
            <div className="space-y-6">
              {restoredDraft && !initialValues ? (
                <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900 ring-1 ring-blue-600/20">
                  {tr("kaldiginizTaslakGeriYuklendi")}
                  <button
                    type="button"
                    onClick={() => {
                      clearSession(QUICK_DRAFT_KEY);
                      clearFormSupplierPanel();
                      setExternalInvites([]);
                      setMemberInvites([]);
                      setRestoredDraft(false);
                      reset(applyRequestDefaults({ ...DEFAULT_FORM_VALUES }, terms));
                    }}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {tr("temizleSifirdanBasla")}
                  </button>
                </p>
              ) : null}
              {/* AI-1 — belgeden doldurma girişi (sihirbaz sayfasındaki kartın aynısı) */}
              {/* Dar ekranda düğme alta, tam genişlik (375 px'te metin ~50 px'lik
                  sütuna sıkışıyordu — yayın denetimi Bölüm 12). */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{tr("belgedenOtomatikDoldur")}</p>
                  <p className="text-xs text-zinc-500">{tr("sartnameTeklifTalebiVeyaFotograf")}</p>
                </div>
                <Button variant="primary" className="w-full sm:w-auto" onClick={() => setDocOpen(true)}>
                  <Sparkles className="h-4 w-4" />
                  {tr("belgedenDoldur")}
                </Button>
              </div>
              <AiImportDialog
                open={docOpen}
                onClose={() => setDocOpen(false)}
                onResult={(r) => {
                  setDocOpen(false);
                  applyDocument(r);
                }}
              />
              {!hasItems ? (
                <RecentRequests
                  onSeed={(f) => {
                    setValue("items", f.items, { shouldDirty: true, shouldValidate: true });
                    setValue("title", f.title, { shouldDirty: true });
                    setValue("description", f.description ?? "", { shouldDirty: true });
                    setValue("categoryIds", f.categoryIds, { shouldDirty: true, shouldValidate: true });
                    setValue("keywords", f.keywords);
                  }}
                />
              ) : null}

              {/* Kalem satırları — sihirbazın Kalemler adımıyla BİREBİR aynı bileşen. */}
              <Step2Items />

              {/* AI TEDARİKÇİ PANELİ (2026-09-27, Faz 1): kalemlerin hemen altında,
                  pencere açmadan; bulunanlar seçili gelir, davet YAYINDA gider. */}
              <FormSupplierPanel
                itemNames={discoveryItemNames}
                categoryIds={watched.categoryIds ?? []}
                targetCountries={watched.targetCountries ?? []}
                buyerCountry={companyCountry}
                available={discoveryAvailable}
                value={externalInvites}
                onChange={(next) => setExternalInvites(next.slice(0, MAX_PENDING_EXTERNAL_INVITES))}
                members={memberInvites}
                onMembersChange={(next) => setMemberInvites(next.slice(0, MAX_PENDING_EXTERNAL_INVITES))}
              />

              {/* BAŞLIK → AI → KATEGORİ tek sütun (2026-09-17, kullanıcı kararı:
                  "kategori seçimi talep başlığının altında olmalı; AI ile
                  kategori bul geri gelsin; AI başlığı da oluştursun"). */}
              <div className="space-y-5">
                    <div>
                      <label htmlFor="talep-baslik" className="mb-1.5 block text-sm font-medium text-zinc-950">
                        {tr("talepBasligi")} <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="talep-baslik"
                        {...form.register("title")}
                        placeholder={tr("orn34IncDikissiz")}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                      />
                      {form.formState.errors.title ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.title.message}</p> : <p className="mt-1 text-xs text-zinc-500">{tr("bosBirakirsanizKalemlerdenTuretilir")}</p>}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void suggestTitleAndCategory()}
                          disabled={!aiAvailable || draftSuggest.isPending || namedItems.length === 0}
                          title={
                            !aiAvailable
                              ? tr("aiOnerisiSilverVeUzeri")
                              : namedItems.length === 0
                                ? tr("onceEnAzBirKalem")
                                : undefined
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                        >
                          <SparklesIcon aria-hidden className="size-3.5" />
                          {draftSuggest.isPending ? tr("aiKalemleriAnalizEdiyor") : tr("aiIleBaslikVeKategori")}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-zinc-950">
                        {tr("kategori")} <span className="text-red-600">*</span>
                      </p>
                      <Controller
                        control={form.control}
                        name="categoryIds"
                        render={({ field }) => (
                          <CategorySelectorButton value={field.value} onChange={(ids) => field.onChange(ids.slice(0, 3))} mode="multi" maxSelection={3} catalog="discovery" placeholder={tr("kategoriSecinEnFazla3")} modalTitle={tr("talepKategorisi")} modalDescription={tr("talepKategorisiAciklama")} />
                        )}
                      />
                      {form.formState.errors.categoryIds ? (
                        <p className="mt-1 text-xs text-red-700">{form.formState.errors.categoryIds.message as string}</p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">{tr("eslestirmeVeTedarikciBildirimiKategoriden")}</p>
                      )}
                      {(watched.categoryIds?.length ?? 0) < 3 ? (
                        <CategorySuggest
                          seedText={namedItems[0]?.name ?? ""}
                          selected={watched.categoryIds ?? []}
                          onPick={(id) => setValue("categoryIds", [...(getValues("categoryIds") ?? []), id].slice(0, 3), { shouldDirty: true, shouldValidate: true })}
                        />
                      ) : null}
                      {/* İkinci eksen: kategori "ne", bu "kimden". */}
                      <div className="mt-3">
                        <span className="block text-xs font-medium text-zinc-700">{tr("arananTedarikciTipiIstegeBagli")}</span>
                        <div className="mt-1.5">
                          <PreferredActivitiesField
                            value={watched.preferredActivities ?? []}
                            onChange={(codes) => form.setValue("preferredActivities", codes, { shouldDirty: true })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="talep-aciklama" className="mb-1.5 block text-sm font-medium text-zinc-950">
                      {tr("aciklama")} <span className="text-xs font-normal text-zinc-500">{tr("istegeBagli")}</span>
                    </label>
                    <textarea
                      id="talep-aciklama"
                      {...form.register("description")}
                      rows={3}
                      maxLength={5000}
                      placeholder={tr("kullanimAmaciTeknikSartTeslim")}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void writeDescription()}
                        disabled={!aiAvailable || seoEnrich.isPending}
                        title={aiAvailable ? undefined : tr("aiIleAciklamaSilverVe")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <SparklesIcon aria-hidden className="size-3.5" />
                        {seoEnrich.isPending ? tr("yaziliyor") : tr("aiIleAciklamayiYaz")}
                      </button>
                    </div>
                  </div>
            </div>
          </NumberedSection>

          {/* 2 ── NEREYE, NE ZAMANA */}
          <NumberedSection
            id="talep-nereye"
            n={2}
            accent="blue"
            title={tr("nereyeNeZamanaNasilOdeme")}
            lead={tr("teslimatAdresiTeklifToplamaSuresi")}
            status={selectedAddress && closeLabel ? <Done>{tr("gun2", { title: selectedAddress.title, currentCloseDays: currentCloseDays, paymentLabel: paymentLabel })}</Done> : null}
          >
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">{tr("teslimatAdresi")}</p>
                {addresses.isLoading ? (
                  <p className="text-sm text-zinc-500">{tr("adreslerYukleniyor")}</p>
                ) : (
                  <AddressPicker addresses={addresses.data ?? []} value={watched.deliveryAddressId ?? ""} onChange={(id) => setValue("deliveryAddressId", id, { shouldDirty: true })} onAdd={() => setAddingAddress(true)} />
                )}
                {addingAddress ? (
                  <AddressInline
                    onCreated={(id) => {
                      setAddingAddress(false);
                      setValue("deliveryAddressId", id, { shouldDirty: true });
                    }}
                    onCancel={() => setAddingAddress(false)}
                  />
                ) : null}
                {(addresses.data ?? []).length === 0 && !addingAddress ? <p className="mt-2 text-xs text-zinc-500">{tr("adresYoksaHizmetLojistikTalebi")}</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">
                  {tr("teklifToplamaSuresi")} <span className="text-red-600">*</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {REQUEST_CLOSE_DAY_OPTIONS.map((d) => (
                    <button key={d} type="button" aria-pressed={currentCloseDays === d} onClick={() => setCloseDays(d)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition", currentCloseDays === d ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                      {tr("gun3", { d: d })}
                    </button>
                  ))}
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <input type="number" min={1} max={60} value={currentCloseDays} onChange={(e) => setCloseDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} aria-label={tr("ozelGun")} className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                    {tr("gun4")}
                  </label>
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {closeLabel ? (
                    tr.rich("kapanisTedarikcilerOAnaKadar", { date: closeLabel, strong: (c) => <span className="font-medium text-zinc-900">{c}</span> })
                  ) : (
                    tr("kapanisTarihiSecin")
                  )}
                </p>
                {form.formState.errors.bidsCloseAt ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.bidsCloseAt.message}</p> : null}
              </div>

              {/* ÖDEME ŞEKLİ — kullanıcı kararı 2026-09-09: teslim tarihi yerine.
                  Şartlar paneliyle AYNI değer (`terms`), iki yerde de düzenlenebilir. */}
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">
                  {tr("odemeSekli")} <span className="text-red-600">*</span>
                </p>
                <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
                  <RequestDefaultsForm value={terms} onChange={updateTerms} compact bare only={["payment"]} />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">{tr("tedarikciTeklifiniBuKosulaGore")}</p>
              </div>
            </div>
          </NumberedSection>

          {/* 3 ── KİME */}
          <NumberedSection
            id="talep-kime"
            n={3}
            accent="blue"
            title={tr("kimlerGorsun")}
            lead={tr("kapaliZarfHerDurumdaGecerli")}
            status={<Done>{summary.who}</Done>}
          >
            {/* AI AYARLARI (2026-09-27, Faz 1): tedarikçi arama 1. bölümdeki
                panelde (kalemlerin altında). Burada yalnız yayın sonrası otomatik
                arama ve davette firma adı — iki anahtar. */}
            <div className="mb-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <Controller
                control={form.control}
                name="aiDiscovery"
                render={({ field }) => (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                      checked={visibility !== "PRIVATE" && !!field.value}
                      disabled={visibility === "PRIVATE" || !discoveryAvailable}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                        <Sparkles className="h-4 w-4 text-blue-600" aria-hidden />
                        {tAi("aiDiscoveryToggle")}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-600">
                        {!discoveryAvailable
                          ? tAi("goldOnly")
                          : visibility === "PRIVATE"
                            ? tAi("aiDiscoveryPrivateOff")
                            : tAi("aiDiscoveryHint")}
                      </span>
                    </span>
                  </label>
                )}
              />
              <Controller
                control={form.control}
                name="inviteShowName"
                render={({ field }) => (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-900">{tAi("showNameToggle")}</span>
                      <span className="mt-0.5 block text-xs text-zinc-600">{tAi("showNameHint")}</span>
                    </span>
                  </label>
                )}
              />
              {externalInvites.length > 0 || memberInvites.length > 0 ? (
                <p className="text-xs text-zinc-700">
                  {tAi("summaryInSection1")}{" "}
                  <button
                    type="button"
                    onClick={() => document.getElementById("ai-tedarikci")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {tAi("goToList")}
                  </button>
                </p>
              ) : null}
            </div>
            {/* Yayında talebe DOĞRUDAN davet edilecek Rothern üyeleri (AI keşfinden). */}
            {memberInvites.length > 0 ? (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <p className="text-sm font-medium text-zinc-900">{tr("bekleyenUyeDavetleri", { n: memberInvites.length })}</p>
                <p className="mt-0.5 text-xs text-zinc-600">{tr("bekleyenUyeDavetleriAciklama")}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {memberInvites.map(({ companyId, name }) => (
                    <li key={companyId} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white py-1 pr-1 pl-2.5 text-xs text-zinc-800 ring-1 ring-zinc-200">
                      <span className="truncate">{name}</span>
                      <button
                        type="button"
                        aria-label={tr("uyeDavetiniKaldir", { name })}
                        onClick={() => setMemberInvites((cur) => cur.filter((m) => m.companyId !== companyId))}
                        className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <XMarkIcon aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {/* Yayında talebe özel davet gidecek adresler (AI keşfinden). */}
            {externalInvites.length > 0 ? (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <p className="text-sm font-medium text-zinc-900">{tr("bekleyenDisDavetler", { n: externalInvites.length })}</p>
                <p className="mt-0.5 text-xs text-zinc-600">{tr("bekleyenDisDavetlerAciklama")}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {externalInvites.map(({ email, locale: inviteLocale }) => (
                    <li key={email} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white py-1 pr-1 pl-2.5 text-xs text-zinc-800 ring-1 ring-zinc-200">
                      <span className="truncate">{email}</span>
                      {/* Davet e-postasının dili — yayında bu dilde gider. */}
                      <InviteLocaleSelect
                        value={inviteLocale}
                        onChange={(l) => setExternalInvites((cur) => cur.map((i) => (i.email === email ? { ...i, locale: l } : i)))}
                        label={tr("disDavetDili", { email })}
                        className="rounded-full py-0.5"
                      />
                      <button
                        type="button"
                        aria-label={tr("disDavetAdresiniKaldir", { email })}
                        onClick={() => setExternalInvites((cur) => cur.filter((i) => i.email !== email))}
                        className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <XMarkIcon aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { v: "PUBLIC", Icon: GlobeAltIcon },
                  { v: "CONNECTIONS", Icon: UserGroupIcon },
                  { v: "PRIVATE", Icon: UserPlusIcon },
                ] as const
              ).map(({ v, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setValue("visibility", v, { shouldDirty: true });
                    // Bağlantılarım'a geçişte liste her seferinde TAM açılır.
                    if (v === "CONNECTIONS") setValue("invitedSupplierIds", connectionIds, { shouldDirty: true });
                  }}
                  aria-pressed={visibility === v} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", visibility === v ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600" : "border-zinc-300 hover:bg-zinc-50")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", visibility === v ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600")}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-950">{visibilityLabels[v].label}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{visibilityLabels[v].hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {audience ? <p className="mt-3 text-xs text-zinc-600">{audience}</p> : null}
            {visibility === "PRIVATE" || visibility === "CONNECTIONS" ? (
              <div className="mt-4">
                {/* Başlık seçicinin kendi panelinde — tekrar edilmez. */}
                <Controller
                  control={form.control}
                  name="invitedSupplierIds"
                  render={({ field }) => (
                    <SupplierPicker
                      mode={visibility === "CONNECTIONS" ? "connections" : "private"}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      itemNames={discoveryItemNames}
                      categoryIds={watched.categoryIds ?? []}
                      // "N firmayı davet et" → davet yayınla anında gider; düğme yayın adımına götürür.
                      onInvite={() => document.getElementById("talep-yayinla")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    />
                  )}
                />
              </div>
            ) : null}
          </NumberedSection>

          {/* 4 ── BELGELER */}
          <NumberedSection
            id="talep-belgeler"
            n={4}
            accent="blue"
            title={tr("belgeler")}
            lead={tr("sartnameTeknikResimSozlesmeTaslagi")}
            status={stagedDocs.length ? <Done>{tr("dosyaSayisi", { n: stagedDocs.length })}</Done> : <span>{tr("istegeBagli")}</span>}
          >
            <StagedDocuments docs={stagedDocs} onChange={setStagedDocs} />
          </NumberedSection>
        </div>

        {/* SAĞ RAY */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TermsPanel value={terms} onChange={updateTerms} onSaveDefaults={() => void persistDefaults(terms)} saving={saveDefaults.isPending} canSave={canManage} source={seedKind === "edit" ? "listing" : seedKind === "seed" ? "seed" : (defaultsQ.data?.source ?? "none")} />

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-zinc-950">{tr("teklifKalitesi")}</p>
              <span className="text-sm font-semibold tabular-nums text-zinc-950">{tr("yuzde", { n: quality.score })}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${quality.score}%` }} />
            </div>
            {quality.missing.length ? (
              <ul className="mt-2 space-y-1 text-xs/5 text-zinc-600">
                {quality.missing.slice(0, 3).map((m) => (
                  <li key={m.key}>· {tr.has(`kaliteIpucu.${m.key}` as never) ? tr(`kaliteIpucu.${m.key}` as never) : m.hint}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">{tr("isabetliTeklifIcinYeterli")}</p>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">{tr("engelDegilIpucu")}</p>
          </div>
          {/* ÖZET + YAYINLA rayın EN ALTINDA (2026-09-19, kullanıcı: "bu kısım
              en aşağıda olmalı") — şartlar ve teklif kalitesi önce okunur,
              yayın kararı en son. */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <p className="text-sm font-semibold text-zinc-950">{tr("ozet")}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k={tr("ne")} v={summary.what} />
              <Row k={tr("nereye")} v={summary.where} />
              <Row k={tr("neZamana")} v={summary.when} />
              <Row k={tr("odeme")} v={paymentLabel} />
              <Row k={tr("kime")} v={summary.who} />
              <Row k={tr("belge")} v={stagedDocs.length ? tr("dosyaSayisi", { n: stagedDocs.length }) : null} />
            </dl>
            {!verified ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                <ExclamationTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {tr.rich("yayinIcinFirmaDogrulamasiGerekir", {
                    link: (c) => (
                      <Link href="/company/ayarlar/dogrulama" className="font-semibold underline">
                        {c}
                      </Link>
                    ),
                  })}
                </span>
              </p>
            ) : null}
            {canManage ? (
              <div className="mt-4 space-y-2">
                <button type="button" id="talep-yayinla" onClick={() => void publish()} disabled={busy || !hasItems || !verified} className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {busy ? tr("kaydediliyor") : isLiveEdit ? tr("degisiklikleriKaydet") : tr("talebiYayinla")}
                </button>
                {!ready && hasItems ? <p className="text-center text-[11px] text-zinc-500">{tr("yayinIcinBaslikVeKategori")}</p> : null}
                {isLiveEdit ? null : (
                  <button type="button" onClick={() => void saveDraft()} disabled={busy} className="w-full rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50">
                    {isEdit ? tr("taslagiKaydet") : tr("taslakKaydet")}
                  </button>
                )}
                <button type="button" onClick={() => setTemplateOpen(true)} className="w-full rounded-full px-4 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900">
                  {tr("sablonOlarakKaydet")}
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">{tr("talepAcmakIcinTalepYonetimi")}</p>
            )}
          </div>
        </aside>
      </div>

      {/* MOBİL YAPIŞKAN ÇUBUK */}
      {canManage ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-950/10 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">{[summary.what, summary.when].filter(Boolean).join(" · ") || tr("kalemEkleyin")}</p>
            <button type="button" onClick={() => void publish()} disabled={busy || !hasItems || !verified} aria-label={isLiveEdit ? tr("degisiklikleriKaydetMobil") : tr("talebiYayinlaMobil")} className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {isLiveEdit ? tr("kaydet") : tr("yayinla")}
            </button>
          </div>
        </div>
      ) : null}
      <SaveTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSave={(name) => void handleSaveTemplate(name)}
        isSaving={saveTemplate.isPending}
        defaultName={watched.title || undefined}
      />
    </FormProvider>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-600/20">
      <CheckIcon aria-hidden className="size-3 shrink-0" /> <span className="truncate">{children}</span>
    </span>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs font-medium tracking-wide text-zinc-500 uppercase">{k}</dt>
      <dd className={cn("text-right", v ? "text-zinc-900" : "text-zinc-400")}>{v ?? "—"}</dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy>
      <div className="space-y-8">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="mb-3 h-5 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    </div>
  );
}
