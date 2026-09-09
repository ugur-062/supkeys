"use client";

import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { NumberedSection } from "@/components/ui/numbered-section";
import { AddressInline } from "./address-inline";
import { RecentRequests } from "./recent-requests";
import { StagedDocuments, type StagedListingDoc } from "@/components/tenders/wizard/staged-documents";
import { uploadListingDocument } from "@/hooks/use-listing-documents";
import { useConnections } from "@/hooks/use-company-connections";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { useAiSeoEnrich } from "@/hooks/use-ai-seo-enrich";
import { tierAtLeast } from "@rothern/shared";
import Link from "next/link";
import { CategorySuggest } from "./category-suggest";
import { AddressPicker } from "./address-picker";
import { Step2Items } from "@/components/tenders/wizard/step-2-items";
import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { Button } from "@/components/ui/button";
import { PublishedPanel } from "./published-panel";
import { SetupCard } from "./setup-card";
import { SupplierPicker } from "./supplier-picker";
import { TermsPanel } from "./terms-panel";
import { RequestDefaultsForm, VISIBILITY_LABELS } from "@/components/tenders/request-defaults-form";
import { PAYMENT_CATEGORY_LABELS, formatPaymentPlan } from "@/lib/tenders/labels";
import type { PaymentCategory } from "@/lib/tenders/types";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useAddresses } from "@/hooks/use-company-addresses";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCreateListing } from "@/hooks/use-company-listings";
import { useRequestDefaults, useSaveRequestDefaults } from "@/hooks/use-request-defaults";
import { formatDate } from "@/lib/format-date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { DEFAULT_FORM_VALUES, tenderFormSchema, type TenderFormData } from "@/lib/tenders/form-schema";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapToInput } from "@/lib/tenders/map-to-input";
import { QUICK_DRAFT_KEY, QUICK_TO_WIZARD_KEY, clearSession, readSession, writeSession, type QuickDraft } from "@/lib/tenders/quick-draft";
import { titleFromItems } from "@/lib/tenders/quick-parse";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm } from "@/lib/tenders/request-defaults";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { REQUEST_CLOSE_DAY_OPTIONS, REQUEST_DEFAULTS_FALLBACK, listingSeoReadiness, type AiTenderExtractResult, type RequestDefaults } from "@rothern/shared";
import { CheckIcon, ExclamationTriangleIcon, GlobeAltIcon, SparklesIcon, UserGroupIcon, UserPlusIcon } from "@heroicons/react/20/solid";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

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
export function QuickRequest({ initialValues }: { initialValues?: Partial<TenderFormData> }) {
  const router = useRouter();
  const { company } = useCompanyAuth();
  const canManage = useHasCompanyPermission("buy:listing:manage");
  const defaultsQ = useRequestDefaults();
  const saveDefaults = useSaveRequestDefaults();
  const addresses = useAddresses();
  const create = useCreateListing();

  const [terms, setTerms] = useState<RequestDefaults | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [published, setPublished] = useState<{ id: string; title: string; categoryIds: string[]; itemNames: string[] } | null>(null);
  const [stagedDocs, setStagedDocs] = useState<StagedListingDoc[]>([]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const connections = useConnections();
  const seoEnrich = useAiSeoEnrich();

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: { ...DEFAULT_FORM_VALUES, ...initialValues },
    mode: "onTouched",
  });
  const { watch, setValue, getValues, reset } = form;

  /* Profil yüklenince şartları forma uygula (bir kez); taslak varsa geri getir. */
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!defaultsQ.data || appliedRef.current) return;
    appliedRef.current = true;
    const d = defaultsQ.data.defaults ?? REQUEST_DEFAULTS_FALLBACK;
    setTerms(d);
    const draft = initialValues ? null : readSession<QuickDraft>(QUICK_DRAFT_KEY);
    const base = applyRequestDefaults({ ...DEFAULT_FORM_VALUES, ...initialValues }, d);
    reset(draft ? { ...base, ...draft, bidsCloseAt: base.bidsCloseAt } : base);
    if (draft) setRestoredDraft(true);
    if (!d.deliveryAddressId && addresses.data?.length) {
      const pick = addresses.data.find((a) => a.isDefault && a.type === "TESLIMAT") ?? addresses.data.find((a) => a.type === "TESLIMAT") ?? addresses.data[0];
      if (pick) setValue("deliveryAddressId", pick.id);
    }
  }, [defaultsQ.data, addresses.data, initialValues, reset, setValue]);

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

  /* Taslak otomatik saklama (niyet alanları). */
  const watched = watch();
  useEffect(() => {
    if (!appliedRef.current || published) return;
    const { title, description, items, categoryIds, keywords, deliveryAddressId, visibility, invitedSupplierIds, bidsCloseAt } = watched;
    if (!title && items.every((i) => !i.name)) return;
    writeSession(QUICK_DRAFT_KEY, { title, description, items, categoryIds, keywords, deliveryAddressId, visibility, invitedSupplierIds, bidsCloseAt } satisfies QuickDraft);
  }, [watched, published]);

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
    if (!cur.title.trim()) setValue("title", titleFallback || titleFromItems(merged), { shouldDirty: true });
  };
  const applyDocument = (r: AiTenderExtractResult) => {
    const mapped = mapAiDraftToForm(r.draft, getValues());
    appendItems(mapped.items.filter((i) => i.name.trim()), mapped.title || undefined);
    const cur = getValues();
    if (!cur.description?.trim() && mapped.description) setValue("description", mapped.description, { shouldDirty: true });
    if (!cur.categoryIds.length && mapped.categoryIds.length) setValue("categoryIds", mapped.categoryIds, { shouldDirty: true, shouldValidate: true });
    if (r.missingRequired?.length) toast.warning(`Belgeden okunamayan alanlar: ${r.missingRequired.join(", ")}`);
    else toast.success("Belgeden dolduruldu — kalemleri kontrol edin");
  };

  /* --- Süre */
  const setCloseDays = (days: number) => {
    setValue("bidsCloseAt", closesAtFromDays(days), { shouldDirty: true, shouldValidate: true });
    if (terms) setTerms({ ...terms, closeDays: days });
  };
  const currentCloseDays = useMemo(() => {
    const v = watched.bidsCloseAt;
    if (!v) return closeDays;
    const d = Math.round((new Date(v).getTime() - Date.now()) / 86_400_000);
    return d > 0 ? d : closeDays;
  }, [watched.bidsCloseAt, closeDays]);

  /* --- Yayın / taslak / detaylı */
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
        if (first === "deliveryTerm" || first === "paymentCategory" || first === "paymentDays") {
          toast.error("Sağdaki Ticari şartlar panelinde teslim şekli / ödeme eksik — 'seç' ile tamamlayın");
          document.getElementById("sartlar-baslik")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        const section = ["items", "title", "categoryIds", "description"].includes(first) ? "talep-ne" : ["deliveryAddressId", "bidsCloseAt", "billingAddressId"].includes(first) ? "talep-nereye" : "talep-kime";
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
        const msg = (errs[first as keyof typeof errs] as { message?: string } | undefined)?.message;
        toast.error(msg ? `Eksik: ${msg}` : "Eksik alanlar var — ilgili bölüme kaydırıldı");
        return;
      }
      const values = getValues();
      const listing = await create.mutateAsync(mapToInput(values));
      await uploadStaged(listing.id);
      clearSession(QUICK_DRAFT_KEY);
      setPublished({ id: listing.id, title: values.title, categoryIds: values.categoryIds, itemNames: values.items.map((i) => i.name) });
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Talep yayımlanamadı"));
    } finally {
      submitLock.current = false;
    }
  };
  /** Başlık boşsa kalemlerden türet — satırlar elle girildiğinde otomatik başlık yok. */
  const ensureTitle = () => {
    const v = getValues();
    if (!v.title.trim()) {
      const t = titleFromItems(v.items.filter((i) => i.name.trim()));
      if (t) setValue("title", t, { shouldDirty: true });
    }
  };
  const saveDraft = async () => {
    ensureTitle();
    const values = getValues();
    if (values.title.trim().length < 3) {
      toast.error("Taslak için en az bir başlık gerekli");
      return;
    }
    try {
      const listing = await create.mutateAsync({ ...mapToInput(values), asDraft: true });
      await uploadStaged(listing.id);
      clearSession(QUICK_DRAFT_KEY);
      toast.success("Taslak kaydedildi");
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
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
    if (failed > 0) toast.warning(`${failed} dosya yüklenemedi — talep sayfasından tekrar ekleyebilirsiniz`);
  };

  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");
  const writeDescription = async () => {
    const v = getValues();
    try {
      const r = await seoEnrich.mutateAsync({
        kind: "listing",
        name: v.title || titleFromItems(v.items),
        description: v.description ?? null,
        categoryName: catRows[0]?.nameTr ?? null,
        facts: v.items.filter((i) => i.name.trim()).map((i) => `${i.name} — ${i.quantity} ${i.unit}${i.description ? `: ${i.description}` : ""}`),
        city: selectedAddress?.city ?? null,
      });
      setValue("description", r.description, { shouldDirty: true });
      toast.success("Açıklama taslağı yazıldı — kontrol edin");
    } catch (err) {
      toast.error(extractErrorMessage(err, "AI açıklama yazamadı"));
    }
  };

  const goDetailed = () => {
    writeSession(QUICK_TO_WIZARD_KEY, getValues());
    router.push("/company/satinalma/taleplerim/yeni/detayli?kaynak=hizli");
  };
  const persistDefaults = async (next: RequestDefaults) => {
    try {
      await saveDefaults.mutateAsync(next);
      toast.success("Talep şartları kaydedildi — sonraki taleplerde sorulmaz");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şartlar kaydedilemedi"));
    }
  };

  if (published) {
    return (
      <PublishedPanel
        listingId={published.id}
        title={published.title}
        categoryIds={published.categoryIds}
        itemNames={published.itemNames}
        onNew={() => {
          setPublished(null);
          appliedRef.current = false;
          reset({ ...DEFAULT_FORM_VALUES });
        }}
      />
    );
  }

  if (defaultsQ.isLoading || !terms) return <Skeleton />;

  const showSetup = defaultsQ.data?.source === "none" && !setupDone;
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const visibility = watched.visibility;
  const invited = watched.invitedSupplierIds ?? [];
  const closeLabel = watched.bidsCloseAt ? formatDate(watched.bidsCloseAt, "datetime") : null;
  const ready = hasItems && (watched.categoryIds?.length ?? 0) > 0 && (watched.title?.trim().length ?? 0) >= 3;

  const audience =
    visibility === "PUBLIC"
      ? publicCount.data
        ? `Pazar yerinde listelenir; ${catRows[0] ? `bu kategoride ${publicCount.data.total} firma` : `${publicCount.data.total} firma`} dizinde, kayıtlı her tedarikçi teklif verebilir.`
        : null
      : visibility === "CONNECTIONS"
        ? `${connections.data?.length ?? 0} bağlantınız görecek${invited.length ? ` + ${invited.length} davet` : ""}.`
        : invited.length
          ? `Yalnız davet ettiğiniz ${invited.length} firma görecek.`
          : "Henüz kimse davet edilmedi — en az bir firma seçin ya da görünürlüğü genişletin.";

  const paymentLabel =
    formatPaymentPlan({
      paymentCategory: terms.paymentCategory as PaymentCategory,
      advancePercent: terms.advancePercent,
      paymentDays: terms.paymentDays,
      lcType: terms.lcType as "SIGHT" | "USANCE" | null,
      lcConfirmed: false,
    }) || PAYMENT_CATEGORY_LABELS[terms.paymentCategory as PaymentCategory];

  const summary = {
    what: hasItems ? `${namedItems.length} kalem${catRows[0] ? ` · ${catRows[0].nameTr}` : ""}` : null,
    where: selectedAddress ? `${selectedAddress.title}${selectedAddress.city ? `, ${selectedAddress.city}` : ""}` : null,
    when: closeLabel ? `${currentCloseDays} gün · ${closeLabel}` : null,
    who: `${VISIBILITY_LABELS[visibility]?.label ?? visibility}${visibility !== "PUBLIC" && invited.length ? ` · ${invited.length} davet` : ""}`,
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
            title="Ne lazım?"
            lead="Kalemleri satır satır girin; kataloğunuzdan, Excel'den ya da belgeden ekleyin."
            status={hasItems ? <Done>{namedItems.length} kalem</Done> : null}
          >
            <div className="space-y-6">
              {restoredDraft && !initialValues ? (
                <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900 ring-1 ring-blue-600/20">
                  Kaldığınız taslak geri yüklendi.
                  <button
                    type="button"
                    onClick={() => {
                      clearSession(QUICK_DRAFT_KEY);
                      setRestoredDraft(false);
                      reset(applyRequestDefaults({ ...DEFAULT_FORM_VALUES }, terms));
                    }}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Temizle, sıfırdan başla
                  </button>
                </p>
              ) : null}
              {/* AI-1 — belgeden doldurma girişi (sihirbaz sayfasındaki kartın aynısı) */}
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">Belgeden otomatik doldur</p>
                  <p className="text-xs text-zinc-500">Şartname, teklif talebi veya fotoğraf yükleyin — AI kalemleri sizin için doldursun.</p>
                </div>
                <Button variant="primary" onClick={() => setDocOpen(true)}>
                  <Sparkles className="h-4 w-4" />
                  Belgeden Doldur
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

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                      <label htmlFor="talep-baslik" className="mb-1.5 block text-sm font-medium text-zinc-950">
                        Talep başlığı <span className="text-red-600">*</span>
                      </label>
                      <input
                        id="talep-baslik"
                        {...form.register("title")}
                        placeholder="Örn. 3/4 inç dikişsiz çelik boru alımı — 1.200 m"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                      />
                      {form.formState.errors.title ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.title.message}</p> : <p className="mt-1 text-xs text-zinc-500">Boş bırakırsanız kalemlerden türetilir.</p>}
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-zinc-950">
                        Kategori <span className="text-red-600">*</span>
                      </p>
                      <Controller
                        control={form.control}
                        name="categoryIds"
                        render={({ field }) => (
                          <CategorySelectorButton value={field.value} onChange={(ids) => field.onChange(ids.slice(0, 3))} mode="multi" maxSelection={3} catalog="discovery" placeholder="Kategori seçin (en fazla 3)" modalTitle="Talep kategorisi" />
                        )}
                      />
                      {form.formState.errors.categoryIds ? (
                        <p className="mt-1 text-xs text-red-700">{form.formState.errors.categoryIds.message as string}</p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.</p>
                      )}
                      {(watched.categoryIds?.length ?? 0) < 3 ? (
                        <CategorySuggest
                          seedText={namedItems[0]?.name ?? ""}
                          selected={watched.categoryIds ?? []}
                          onPick={(id) => setValue("categoryIds", [...(getValues("categoryIds") ?? []), id].slice(0, 3), { shouldDirty: true, shouldValidate: true })}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="talep-aciklama" className="mb-1.5 block text-sm font-medium text-zinc-950">
                      Açıklama <span className="text-xs font-normal text-zinc-500">isteğe bağlı</span>
                    </label>
                    <textarea
                      id="talep-aciklama"
                      {...form.register("description")}
                      rows={3}
                      maxLength={5000}
                      placeholder="Kullanım amacı, teknik şart, teslim beklentisi — tedarikçi daha isabetli teklif verir."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void writeDescription()}
                        disabled={!aiAvailable || seoEnrich.isPending}
                        title={aiAvailable ? undefined : "AI ile açıklama Silver ve üzeri paketlerde"}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <SparklesIcon aria-hidden className="size-3.5" />
                        {seoEnrich.isPending ? "Yazılıyor…" : "AI ile açıklamayı yaz"}
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
            title="Nereye, ne zamana, nasıl ödeme?"
            lead="Teslimat adresi, teklif toplama süresi ve ödeme şekli."
            status={selectedAddress && closeLabel ? <Done>{selectedAddress.title} · {currentCloseDays} gün · {paymentLabel}</Done> : null}
          >
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">Teslimat adresi</p>
                {addresses.isLoading ? (
                  <p className="text-sm text-zinc-500">Adresler yükleniyor…</p>
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
                {(addresses.data ?? []).length === 0 && !addingAddress ? <p className="mt-2 text-xs text-zinc-500">Adres yoksa hizmet/lojistik talebi için boş bırakabilirsiniz.</p> : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">
                  Teklif toplama süresi <span className="text-red-600">*</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {REQUEST_CLOSE_DAY_OPTIONS.map((d) => (
                    <button key={d} type="button" aria-pressed={currentCloseDays === d} onClick={() => setCloseDays(d)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition", currentCloseDays === d ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                      {d} gün
                    </button>
                  ))}
                  <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                    <input type="number" min={1} max={60} value={currentCloseDays} onChange={(e) => setCloseDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} aria-label="Özel gün" className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
                    gün
                  </label>
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  {closeLabel ? (
                    <>
                      Kapanış: <span className="font-medium text-zinc-900">{closeLabel}</span> — tedarikçiler o ana kadar teklif verir; sonra değerlendirme başlar.
                    </>
                  ) : (
                    "Kapanış tarihi seçin."
                  )}
                </p>
                {form.formState.errors.bidsCloseAt ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.bidsCloseAt.message}</p> : null}
              </div>

              {/* ÖDEME ŞEKLİ — kullanıcı kararı 2026-09-09: teslim tarihi yerine.
                  Şartlar paneliyle AYNI değer (`terms`), iki yerde de düzenlenebilir. */}
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-950">
                  Ödeme şekli <span className="text-red-600">*</span>
                </p>
                <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
                  <RequestDefaultsForm value={terms} onChange={updateTerms} compact bare only={["payment"]} />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">Tedarikçi teklifini bu koşula göre verir; sağdaki Ticari şartlar panelinde de görünür. Kalıcı yapmak için orada “Şartları kaydet”.</p>
              </div>
            </div>
          </NumberedSection>

          {/* 3 ── KİME */}
          <NumberedSection
            id="talep-kime"
            n={3}
            accent="blue"
            title="Kimler görsün?"
            lead="Kapalı zarf her durumda geçerli — tedarikçiler birbirinin teklifini görmez."
            status={<Done>{summary.who}</Done>}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { v: "PUBLIC", Icon: GlobeAltIcon },
                  { v: "CONNECTIONS", Icon: UserGroupIcon },
                  { v: "PRIVATE", Icon: UserPlusIcon },
                ] as const
              ).map(({ v, Icon }) => (
                <button key={v} type="button" onClick={() => setValue("visibility", v, { shouldDirty: true })} aria-pressed={visibility === v} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", visibility === v ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600" : "border-zinc-300 hover:bg-zinc-50")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", visibility === v ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600")}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-950">{VISIBILITY_LABELS[v].label}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{VISIBILITY_LABELS[v].hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {audience ? <p className="mt-3 text-xs text-zinc-600">{audience}</p> : null}
            {visibility === "PRIVATE" || visibility === "CONNECTIONS" ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-zinc-950">{visibility === "PRIVATE" ? "Davet edilecek firmalar" : "Ayrıca davet et (isteğe bağlı)"}</p>
                <Controller control={form.control} name="invitedSupplierIds" render={({ field }) => <SupplierPicker value={field.value ?? []} onChange={field.onChange} />} />
              </div>
            ) : null}
          </NumberedSection>

          {/* 4 ── BELGELER */}
          <NumberedSection
            id="talep-belgeler"
            n={4}
            accent="blue"
            title="Belgeler"
            lead="Şartname, teknik resim, sözleşme taslağı — tedarikçi teklif verirken görür. İsteğe bağlı."
            status={stagedDocs.length ? <Done>{stagedDocs.length} dosya</Done> : <span>isteğe bağlı</span>}
          >
            <StagedDocuments docs={stagedDocs} onChange={setStagedDocs} />
          </NumberedSection>
        </div>

        {/* SAĞ RAY */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <p className="text-sm font-semibold text-zinc-950">Özet</p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Ne" v={summary.what} />
              <Row k="Nereye" v={summary.where} />
              <Row k="Ne zamana" v={summary.when} />
              <Row k="Ödeme" v={paymentLabel} />
              <Row k="Kime" v={summary.who} />
              <Row k="Belge" v={stagedDocs.length ? `${stagedDocs.length} dosya` : null} />
            </dl>
            {!verified ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                <ExclamationTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Yayın için firma doğrulaması gerekir —{" "}
                  <Link href="/company/ayarlar/dogrulama" className="font-semibold underline">
                    belgeleri yükleyin
                  </Link>
                  . Şimdilik taslak kaydedebilirsiniz.
                </span>
              </p>
            ) : null}
            {canManage ? (
              <div className="mt-4 space-y-2">
                <button type="button" onClick={() => void publish()} disabled={create.isPending || !hasItems || !verified} className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {create.isPending ? "Yayımlanıyor…" : "Talebi yayınla"}
                </button>
                {!ready && hasItems ? <p className="text-center text-[11px] text-zinc-500">Yayın için başlık ve kategori gerekli.</p> : null}
                <button type="button" onClick={() => void saveDraft()} disabled={create.isPending} className="w-full rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50">
                  Taslak kaydet
                </button>
                <button type="button" onClick={goDetailed} className="w-full rounded-full px-4 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900">
                  Detaylı sihirbaza geç →
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">Talep açmak için talep yönetimi yetkisi gerekir.</p>
            )}
          </div>

          <TermsPanel value={terms} onChange={updateTerms} onSaveDefaults={() => void persistDefaults(terms)} saving={saveDefaults.isPending} canSave={canManage} source={defaultsQ.data?.source ?? "none"} />

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-zinc-950">Teklif kalitesi</p>
              <span className="text-sm font-semibold tabular-nums text-zinc-950">%{quality.score}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${quality.score}%` }} />
            </div>
            {quality.missing.length ? (
              <ul className="mt-2 space-y-1 text-xs/5 text-zinc-600">
                {quality.missing.slice(0, 3).map((m) => (
                  <li key={m.key}>· {m.hint}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">İsabetli teklif için yeterli.</p>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">Engel değil, ipucu.</p>
          </div>
        </aside>
      </div>

      {/* MOBİL YAPIŞKAN ÇUBUK */}
      {canManage ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-950/10 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">{[summary.what, summary.when].filter(Boolean).join(" · ") || "Kalem ekleyin"}</p>
            <button type="button" onClick={() => void publish()} disabled={create.isPending || !hasItems || !verified} aria-label="Talebi yayınla (mobil)" className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Yayınla
            </button>
          </div>
        </div>
      ) : null}
    </FormProvider>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-600/20">
      <CheckIcon aria-hidden className="size-3" /> {children}
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
