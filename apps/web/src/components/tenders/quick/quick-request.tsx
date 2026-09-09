"use client";

import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { AddressInline } from "./address-inline";
import { ItemsTable } from "./items-table";
import { NeedInput } from "./need-input";
import { PublishedPanel } from "./published-panel";
import { SetupCard } from "./setup-card";
import { SupplierPicker } from "./supplier-picker";
import { TermsPanel } from "./terms-panel";
import { VISIBILITY_LABELS } from "@/components/tenders/request-defaults-form";
import { useAddresses } from "@/hooks/use-company-addresses";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCreateListing } from "@/hooks/use-company-listings";
import { useRequestDefaults, useSaveRequestDefaults } from "@/hooks/use-request-defaults";
import { extractErrorMessage } from "@/lib/tenders/error";
import { DEFAULT_FORM_VALUES, tenderFormSchema, type TenderFormData } from "@/lib/tenders/form-schema";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { mapToInput } from "@/lib/tenders/map-to-input";
import { QUICK_DRAFT_KEY, QUICK_TO_WIZARD_KEY, clearSession, readSession, writeSession, type QuickDraft } from "@/lib/tenders/quick-draft";
import { parseNeed, titleFromItems } from "@/lib/tenders/quick-parse";
import { applyRequestDefaults, closesAtFromDays, defaultsFromForm } from "@/lib/tenders/request-defaults";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { REQUEST_CLOSE_DAY_OPTIONS, REQUEST_DEFAULTS_FALLBACK, listingSeoReadiness, type AiSearchIntentResult, type RequestDefaults } from "@rothern/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

/**
 * HIZLI TALEP — tek ekran, dört soru (2026-09-09).
 *
 * Talep = niyet + ticari şartlar. Niyet burada sorulur (ne · nereye · ne
 * zamana · kime), şartlar profilden gelir ve sağda özetlenir (satır satır
 * değiştirilebilir). Form modeli ve doğrulama SİHİRBAZLA AYNI
 * (`tenderFormSchema`, `mapToInput`): yeni bir backend akışı yok, ürettiği
 * gövde birebir sihirbazınki. "Detaylı ayarlar" mevcut sihirbaza girilenlerle
 * geçer (sessionStorage köprüsü).
 *
 * Renk satınalma: mavi (portal kuralı).
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
  const [published, setPublished] = useState<{ id: string; title: string; categoryIds: string[]; itemNames: string[] } | null>(null);
  const [needsCategoryHint, setNeedsCategoryHint] = useState<string | null>(null);

  const form = useForm<TenderFormData>({
    resolver: zodResolver(tenderFormSchema),
    defaultValues: { ...DEFAULT_FORM_VALUES, ...initialValues },
    mode: "onTouched",
  });
  const { watch, setValue, getValues, reset } = form;

  /* Profil yüklenince şartları forma uygula (bir kez); taslak varsa niyet
     alanlarını geri getir. */
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!defaultsQ.data || appliedRef.current) return;
    appliedRef.current = true;
    const d = defaultsQ.data.defaults ?? REQUEST_DEFAULTS_FALLBACK;
    setTerms(d);
    const draft = initialValues ? null : readSession<QuickDraft>(QUICK_DRAFT_KEY);
    const base = applyRequestDefaults({ ...DEFAULT_FORM_VALUES, ...initialValues }, d);
    reset(draft ? { ...base, ...draft, bidsCloseAt: base.bidsCloseAt } : base);
    // Adres: profilde yoksa varsayılan/ilk teslimat adresi.
    if (!d.deliveryAddressId && addresses.data?.length) {
      const pick = addresses.data.find((a) => a.isDefault && a.type === "TESLIMAT") ?? addresses.data.find((a) => a.type === "TESLIMAT") ?? addresses.data[0];
      if (pick) setValue("deliveryAddressId", pick.id);
    }
  }, [defaultsQ.data, addresses.data, initialValues, reset, setValue]);

  /* Şartlar değişince forma yansır; kapanış süresi çiplerden. */
  const closeDays = terms?.closeDays ?? REQUEST_DEFAULTS_FALLBACK.closeDays;
  const updateTerms = (next: RequestDefaults) => {
    setTerms(next);
    const cur = getValues();
    reset({ ...applyRequestDefaults(cur, next), items: cur.items, title: cur.title, description: cur.description, categoryIds: cur.categoryIds, invitedSupplierIds: cur.invitedSupplierIds, deliveryAddressId: cur.deliveryAddressId || next.deliveryAddressId || "", visibility: cur.visibility }, { keepDirty: true });
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
  const hasItems = items.some((i) => i.name.trim().length > 0);
  const quality = useMemo(
    () => listingSeoReadiness({ title: watched.title ?? "", description: watched.description ?? null, categoryIds: watched.categoryIds ?? [], items: items.map((i) => ({ name: i.name, description: i.description ?? null, quantity: i.quantity, unit: i.unit })) }),
    [watched.title, watched.description, watched.categoryIds, items],
  );

  /* "Ne lazım?" → kalemler (+ AI ise başlık/kategori). */
  const applyParsed = (text: string) => {
    const parsed = parseNeed(text);
    if (!parsed.length) {
      toast.error("Kalem çıkarılamadı — her satıra bir ürün yazın");
      return;
    }
    const cur = getValues();
    const existing = cur.items.filter((i) => i.name.trim());
    const next = [...existing, ...parsed.map((p) => ({ ...DEFAULT_FORM_VALUES.items[0], name: p.name, quantity: p.quantity, unit: p.unit, unitCode: p.unitCode }))];
    setValue("items", next, { shouldDirty: true, shouldValidate: true });
    if (!cur.title.trim()) setValue("title", titleFromItems(next), { shouldDirty: true });
    toast.success(`${parsed.length} kalem eklendi — miktar ve birimi kontrol edin`);
  };
  const applyAi = (r: AiSearchIntentResult, text: string) => {
    const cur = getValues();
    if (r.draft) {
      const mapped = mapAiDraftToForm(r.draft.draft, cur);
      // Yalnız NİYET alanları alınır; şartlar profilden gelir, AI ezmez.
      const aiItems = mapped.items.filter((i) => i.name.trim());
      const parsedFallback = aiItems.length ? [] : parseNeed(text).map((p) => ({ ...DEFAULT_FORM_VALUES.items[0], name: p.name, quantity: p.quantity, unit: p.unit, unitCode: p.unitCode }));
      const next = [...cur.items.filter((i) => i.name.trim()), ...aiItems, ...parsedFallback];
      setValue("items", next.length ? next : cur.items, { shouldDirty: true, shouldValidate: true });
      if (!cur.title.trim()) setValue("title", mapped.title || titleFromItems(next), { shouldDirty: true });
      if (!cur.description?.trim() && mapped.description) setValue("description", mapped.description, { shouldDirty: true });
      if (!cur.categoryIds.length && mapped.categoryIds.length) setValue("categoryIds", mapped.categoryIds, { shouldDirty: true, shouldValidate: true });
      if (mapped.keywords.length) setValue("keywords", mapped.keywords.slice(0, 10));
    } else {
      applyParsed(text);
    }
    if (!getValues("categoryIds").length && r.categoryHint) setNeedsCategoryHint(r.categoryHint);
    if (r.city && !getValues("deliveryAddressId")) {
      const match = addresses.data?.find((a) => (a.city ?? "").toLocaleLowerCase("tr") === r.city!.toLocaleLowerCase("tr"));
      if (match) setValue("deliveryAddressId", match.id);
    }
    toast.success("Taslak hazır — kalemleri ve kategoriyi kontrol edin");
  };

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

  const submitLock = useRef(false);
  const publish = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      const ok = await form.trigger();
      if (!ok) {
        const errs = form.formState.errors;
        const first = Object.entries(errs)[0];
        toast.error(first ? `Eksik: ${(first[1] as { message?: string })?.message ?? first[0]}` : "Eksik alanlar var");
        return;
      }
      const values = getValues();
      const listing = await create.mutateAsync(mapToInput(values));
      clearSession(QUICK_DRAFT_KEY);
      setPublished({ id: listing.id, title: values.title, categoryIds: values.categoryIds, itemNames: values.items.map((i) => i.name) });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Talep yayımlanamadı"));
    } finally {
      submitLock.current = false;
    }
  };

  const saveDraft = async () => {
    const values = getValues();
    if (values.title.trim().length < 3) {
      toast.error("Taslak için en az bir başlık gerekli");
      return;
    }
    try {
      const listing = await create.mutateAsync({ ...mapToInput(values), asDraft: true });
      clearSession(QUICK_DRAFT_KEY);
      toast.success("Taslak kaydedildi");
      router.push(`/company/ilan/${listing.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
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

  if (defaultsQ.isLoading || !terms) return <p className="text-sm text-zinc-500">Yükleniyor…</p>;

  const showSetup = defaultsQ.data?.source === "none" && !setupDone;
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const visibility = watched.visibility;

  return (
    <FormProvider {...form}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
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

          {/* 1 · NE LAZIM */}
          <NeedInput onParse={applyParsed} onAi={applyAi} compact={hasItems} />

          {hasItems || watched.title ? (
            <section className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <Field>
                <Label required>Talep başlığı</Label>
                <input
                  {...form.register("title")}
                  placeholder="Örn. 3/4 inç dikişsiz çelik boru alımı — 1.200 m"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                />
                {form.formState.errors.title ? <p className="text-xs text-red-700">{form.formState.errors.title.message}</p> : null}
              </Field>

              <div>
                <Label required>Kalemler</Label>
                <ItemsTable />
              </div>

              <Field hint={needsCategoryHint ? `AI önerisi: “${needsCategoryHint}” — katalogda bulunamadı, seçin.` : "Eşleştirme ve tedarikçi bildirimi kategoriden çalışır."}>
                <Label required>Kategori</Label>
                <Controller
                  control={form.control}
                  name="categoryIds"
                  render={({ field }) => (
                    <CategorySelectorButton value={field.value} onChange={(ids) => field.onChange(ids.slice(0, 3))} mode="multi" maxSelection={3} catalog="discovery" placeholder="Kategori seçin (en fazla 3)" modalTitle="Talep kategorisi" />
                  )}
                />
                {form.formState.errors.categoryIds ? <p className="text-xs text-red-700">{form.formState.errors.categoryIds.message as string}</p> : null}
              </Field>

              <Field hint="İsteğe bağlı ama teklif kalitesini belirler: kullanım amacı, teknik şart, teslim beklentisi.">
                <Label>Açıklama</Label>
                <textarea {...form.register("description")} rows={3} maxLength={5000} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15" />
              </Field>

              {/* 2 · NEREYE */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field>
                  <Label>Teslimat adresi</Label>
                  <select {...form.register("deliveryAddressId")} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600">
                    <option value="">— Adres seçin —</option>
                    {(addresses.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}{a.city ? ` · ${a.city}` : ""}
                      </option>
                    ))}
                  </select>
                  {!addingAddress ? (
                    <button type="button" onClick={() => setAddingAddress(true)} className="mt-1 text-xs font-medium text-blue-700 hover:underline">
                      + Yeni adres
                    </button>
                  ) : (
                    <AddressInline
                      onCreated={(id) => {
                        setAddingAddress(false);
                        setValue("deliveryAddressId", id, { shouldDirty: true });
                      }}
                      onCancel={() => setAddingAddress(false)}
                    />
                  )}
                </Field>

                {/* 3 · NE ZAMANA */}
                <Field hint="Kapanış tarihi; ileri tarih için özel gün girin.">
                  <Label required>Teklif toplama süresi</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {REQUEST_CLOSE_DAY_OPTIONS.map((d) => (
                      <button key={d} type="button" aria-pressed={currentCloseDays === d} onClick={() => setCloseDays(d)} className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition", currentCloseDays === d ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                        {d} gün
                      </button>
                    ))}
                    <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                      <input type="number" min={1} max={60} value={currentCloseDays} onChange={(e) => setCloseDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} aria-label="Özel gün" className="w-16 rounded-lg border border-zinc-300 px-2 py-1 text-sm" />
                      gün
                    </label>
                  </div>
                  {form.formState.errors.bidsCloseAt ? <p className="text-xs text-red-700">{form.formState.errors.bidsCloseAt.message}</p> : null}
                </Field>
              </div>

              {/* 4 · KİME */}
              <div>
                <Label required>Kimler görsün</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["PUBLIC", "CONNECTIONS", "PRIVATE"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setValue("visibility", v, { shouldDirty: true })} aria-pressed={visibility === v} className={cn("rounded-xl border p-3 text-left transition", visibility === v ? "border-blue-600 ring-1 ring-blue-600" : "border-zinc-300 hover:bg-zinc-50")}>
                      <p className="text-sm font-semibold text-zinc-950">{VISIBILITY_LABELS[v].label}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{VISIBILITY_LABELS[v].hint}</p>
                    </button>
                  ))}
                </div>
                {visibility === "PRIVATE" || visibility === "CONNECTIONS" ? (
                  <div className="mt-3">
                    <Controller control={form.control} name="invitedSupplierIds" render={({ field }) => <SupplierPicker value={field.value ?? []} onChange={field.onChange} />} />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {/* SAĞ PANEL: şartlar + kalite + yayın */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <TermsPanel value={terms} onChange={updateTerms} onSaveDefaults={() => void persistDefaults(terms)} saving={saveDefaults.isPending} canSave={canManage} source={defaultsQ.data?.source ?? "none"} />

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-zinc-950">Teklif kalitesi</p>
              <span className="text-sm font-semibold text-zinc-950">%{quality.score}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${quality.score}%` }} />
            </div>
            {quality.missing.length ? (
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                {quality.missing.slice(0, 3).map((m) => (
                  <li key={m.key}>· {m.hint}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">İsabetli teklif için yeterli.</p>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">Engel değil, ipucu — yayın sonrası da düzenleyebilirsiniz.</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            {!verified ? (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                Yayın için firma doğrulaması gerekir; taslak olarak kaydedebilirsiniz.
              </p>
            ) : null}
            {canManage ? (
              <div className="space-y-2">
                <button type="button" onClick={() => void publish()} disabled={create.isPending || !hasItems} className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {create.isPending ? "Yayımlanıyor…" : "Talebi yayınla"}
                </button>
                <button type="button" onClick={() => void saveDraft()} disabled={create.isPending} className="w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50">
                  Taslak kaydet
                </button>
                <button type="button" onClick={goDetailed} className="w-full rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
                  Detaylı ayarlar (kalem soruları, lojistik, şablonlar) →
                </button>
              </div>
            ) : (
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">Talep açmak için talep yönetimi yetkisi gerekir.</p>
            )}
            <p className="mt-3 text-[11px]/4 text-zinc-500">Kapalı zarf: tedarikçiler birbirinin teklifini görmez. Yayınlandıktan sonra kalem ve şartlar teklif gelmeden düzenlenebilir.</p>
          </div>
        </aside>
      </div>
    </FormProvider>
  );
}
