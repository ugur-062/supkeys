"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { useRoots } from "@/hooks/use-categories";
import {
  useCompanyMe,
  useCompleteOnboarding,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { COUNTRIES, TURKEY_LOCATIONS } from "@supkeys/shared";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const COMPANY_TYPES = [
  { value: "LIMITED", label: "Limited Şirket" },
  { value: "JOINT_STOCK", label: "Anonim Şirket" },
  { value: "SOLE_PROPRIETOR", label: "Şahıs Firması" },
];
const ROLES = [
  { value: "YONETICI", label: "Yönetici" },
  { value: "SATIN_ALMACI", label: "Satın Almacı" },
  { value: "SATISCI", label: "Satışçı" },
  { value: "ONAYLAYICI", label: "Onaylayıcı" },
];
const STEPS = ["Şirket Bilgileri", "Kişisel Bilgiler", "Özet & Beyan"];

export function OnboardingClient() {
  const token = useCompanyAuthStore((s) => s.token);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const me = useCompanyMe(!!token);
  const complete = useCompleteOnboarding();
  const roots = useRoots();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    country: "TR",
    legalName: "",
    companyType: "LIMITED",
    taxNumber: "",
    taxOffice: "",
    city: "",
    district: "",
    stateRegion: "",
    neighborhood: "",
    postalCode: "",
    addressLine: "",
    deliverySameAsBilling: true,
    authorizedTckn: "",
    role: "YONETICI",
    mainCategoryIds: [] as string[],
    declarationAccepted: false,
  });
  const isTR = f.country === "TR";
  const set = (k: keyof typeof f) => (v: unknown) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (isHydrated && !token && typeof window !== "undefined") {
      window.location.href = "/company/login";
    }
  }, [isHydrated, token]);
  // Zaten tamamlanmışsa panele dön.
  useEffect(() => {
    if (me.data?.company.onboardingCompletedAt) {
      window.location.href = "/company";
    }
  }, [me.data]);

  const ilceler = useMemo(
    () => TURKEY_LOCATIONS.find((l) => l.il === f.city)?.ilceler ?? [],
    [f.city],
  );

  const step1Valid =
    f.legalName.trim().length >= 2 &&
    f.taxNumber.trim().length >= 4 &&
    f.city.trim().length >= 2 &&
    (isTR ? !!f.district : true) &&
    f.addressLine.trim().length >= 5;
  const step2Valid =
    (isTR ? f.authorizedTckn.trim().length === 11 : true) &&
    f.mainCategoryIds.length >= 1 &&
    f.mainCategoryIds.length <= 3;

  const toggleCat = (id: string) =>
    setF((s) => {
      const has = s.mainCategoryIds.includes(id);
      if (has)
        return { ...s, mainCategoryIds: s.mainCategoryIds.filter((c) => c !== id) };
      if (s.mainCategoryIds.length >= 3) return s;
      return { ...s, mainCategoryIds: [...s.mainCategoryIds, id] };
    });

  const submit = async () => {
    setError(null);
    try {
      await complete.mutateAsync({
        legalName: f.legalName.trim(),
        companyType: f.companyType,
        country: f.country,
        taxNumber: f.taxNumber.trim(),
        taxOffice: f.taxOffice.trim() || undefined,
        city: f.city.trim(),
        district: f.district.trim() || undefined,
        stateRegion: f.stateRegion.trim() || undefined,
        neighborhood: f.neighborhood.trim() || undefined,
        postalCode: f.postalCode.trim() || undefined,
        addressLine: f.addressLine.trim(),
        deliverySameAsBilling: f.deliverySameAsBilling,
        authorizedTckn: f.authorizedTckn.trim() || undefined,
        role: f.role,
        mainCategoryIds: f.mainCategoryIds,
        declarationAccepted: f.declarationAccepted,
      });
      toast.success("Firma doğrulaması tamamlandı");
      window.location.href = "/company";
    } catch (err) {
      setError(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  if (!isHydrated || !token || me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Yükleniyor…
      </div>
    );
  }

  const user = me.data?.user;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">Firma Doğrulama</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Panelini kullanmaya başlamak için firma bilgilerini tamamla. Kayıtta
        verdiğin bilgiler tekrar sorulmaz.
      </p>

      {/* Adım göstergesi */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < step
                  ? "bg-zinc-900 text-white"
                  : i === step
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>
              {s}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-zinc-200" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
        {step === 0 ? (
          <div className="space-y-3">
            <Field>
              <Label>Firma Ünvanı *</Label>
              <Input value={f.legalName} onChange={(e) => set("legalName")(e.target.value)} />
            </Field>
            <Field>
              <Label>Ülke *</Label>
              <Select
                value={f.country}
                onChange={(e) => {
                  set("country")(e.target.value);
                  set("city")("");
                  set("district")("");
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Firma Türü *</Label>
                <Select value={f.companyType} onChange={(e) => set("companyType")(e.target.value)}>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>{isTR ? "Vergi No / TCKN *" : "Vergi / Sicil No *"}</Label>
                <Input
                  value={f.taxNumber}
                  onChange={(e) =>
                    set("taxNumber")(
                      isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                    )
                  }
                />
              </Field>
            </div>
            {isTR ? (
              <Field>
                <Label>Vergi Dairesi *</Label>
                <Input value={f.taxOffice} onChange={(e) => set("taxOffice")(e.target.value)} />
              </Field>
            ) : null}
            {isTR ? (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>İl *</Label>
                  <Select value={f.city} onChange={(e) => { set("city")(e.target.value); set("district")(""); }}>
                    <option value="">Seçin…</option>
                    {TURKEY_LOCATIONS.map((l) => (
                      <option key={l.il} value={l.il}>{l.il}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>İlçe *</Label>
                  <Select value={f.district} disabled={!f.city} onChange={(e) => set("district")(e.target.value)}>
                    <option value="">Seçin…</option>
                    {ilceler.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>Şehir *</Label>
                  <Input value={f.city} onChange={(e) => set("city")(e.target.value)} />
                </Field>
                <Field>
                  <Label>Eyalet / Bölge</Label>
                  <Input value={f.stateRegion} onChange={(e) => set("stateRegion")(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Mahalle</Label>
                <Input value={f.neighborhood} onChange={(e) => set("neighborhood")(e.target.value)} />
              </Field>
              <Field>
                <Label>Posta Kodu</Label>
                <Input value={f.postalCode} onChange={(e) => set("postalCode")(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <Field>
              <Label>Açık Adres *</Label>
              <Input value={f.addressLine} onChange={(e) => set("addressLine")(e.target.value)} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <Checkbox checked={f.deliverySameAsBilling} onChange={(v) => set("deliverySameAsBilling")(v)} />
              Fatura adresini teslimat adresi olarak kullan
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Ad</Label>
                <Input value={user?.firstName ?? ""} readOnly disabled />
              </Field>
              <Field>
                <Label>Soyad</Label>
                <Input value={user?.lastName ?? ""} readOnly disabled />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>{isTR ? "T.C. Kimlik No *" : "Yetkili Kimlik No"}</Label>
                <Input
                  value={f.authorizedTckn}
                  maxLength={isTR ? 11 : 30}
                  onChange={(e) =>
                    set("authorizedTckn")(
                      isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                    )
                  }
                />
              </Field>
              <Field>
                <Label>Ünvan / Rol *</Label>
                <Select value={f.role} onChange={(e) => set("role")(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <Label>Faaliyet Sektörü * (1-3 seçin)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(roots.data ?? []).map((c) => {
                  const on = f.mainCategoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCat(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        on
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      {c.nameTr}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-zinc-400">{f.mainCategoryIds.length}/3 seçildi</p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Summary label="Firma Ünvanı" value={f.legalName} />
              <Summary label="Firma Türü" value={COMPANY_TYPES.find((t) => t.value === f.companyType)?.label} />
              <Summary label="Vergi No / TCKN" value={f.taxNumber} />
              <Summary label="Vergi Dairesi" value={f.taxOffice} />
              <Summary
                label="Adres"
                value={`${f.addressLine}, ${[f.district, f.stateRegion, f.city]
                  .filter(Boolean)
                  .join(" / ")}`}
              />
              <Summary
                label="Ülke"
                value={COUNTRIES.find((c) => c.code === f.country)?.name}
              />
              <Summary label="Yetkili" value={`${user?.firstName} ${user?.lastName}`} />
              <Summary label="Rol" value={ROLES.find((r) => r.value === f.role)?.label} />
              <Summary
                label="Sektörler"
                value={(roots.data ?? [])
                  .filter((c) => f.mainCategoryIds.includes(c.id))
                  .map((c) => c.nameTr)
                  .join(", ")}
              />
            </dl>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm text-zinc-700">
              <Checkbox checked={f.declarationAccepted} onChange={(v) => set("declarationAccepted")(v)} className="mt-0.5" />
              Verdiğim bilgilerin doğru ve güncel olduğunu beyan ederim.
            </label>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-between">
          <Button plain disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Geri
          </Button>
          {step < 2 ? (
            <Button
              disabled={(step === 0 && !step1Valid) || (step === 1 && !step2Valid)}
              onClick={() => setStep((s) => s + 1)}
            >
              Devam
            </Button>
          ) : (
            <Button disabled={!f.declarationAccepted || complete.isPending} onClick={submit}>
              {complete.isPending ? "Kaydediliyor…" : "Tamamla"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value || "—"}</dd>
    </div>
  );
}
