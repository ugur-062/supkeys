"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import {
  useConnections,
  useInviteByEmail,
} from "@/hooks/use-company-connections";
import {
  fetchSupplierTemplate,
  useCreateSupplierTemplate,
  useDeleteSupplierTemplate,
  useSupplierTemplates,
} from "@/hooks/use-supplier-templates";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  CheckSquare,
  Info,
  LayoutTemplate,
  Sparkles,
  Save,
  Search,
  Trash2,
  UserPlus2,
  Users2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SupplierDiscoveryModal } from "@/components/tenders/supplier-discovery-modal";
import { extractErrorMessage } from "@/lib/tenders/error";
import { toast } from "sonner";

const TIER_LABEL = {
  STANDART: "Standart",
  BRONZ: "Bronz",
  SILVER: "Silver",
  GOLD: "Gold",
} as const;
const TIER_BADGE = {
  STANDART: "bg-zinc-100 text-zinc-700",
  BRONZ: "bg-orange-100 text-orange-800",
  SILVER: "bg-slate-200 text-slate-700",
  GOLD: "bg-amber-100 text-amber-800",
} as const;

/** Wizard içinden yeni firma davet modalı (e-posta ile bağlantı isteği). */
function InviteByEmailModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const invite = useInviteByEmail();

  const submit = async () => {
    const v = email.trim();
    if (!v) return;
    try {
      const res = await invite.mutateAsync(v);
      toast.success(
        res.kind === "invited"
          ? "Davet e-postası gönderildi"
          : "Bağlantı isteği gönderildi",
      );
      onInvited(v);
      setEmail("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Yeni Firma Davet Et</DialogTitle>
      <DialogDescription>
        Firmanın e-posta adresini girin; Rothern'e davet / bağlantı isteği
        gönderilir. Kabul edince bağlantılarınıza eklenir ve ihaleye davet
        edebilirsiniz.
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>E-posta</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@firma.com"
            autoFocus
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={invite.isPending || !email.trim()}>
          Davet Gönder
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Seçili firmaları tedarikçi şablonu olarak kaydet. */
function SaveTemplateModal({
  open,
  onClose,
  memberCompanyIds,
}: {
  open: boolean;
  onClose: () => void;
  memberCompanyIds: string[];
}) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const create = useCreateSupplierTemplate();

  const submit = async () => {
    if (name.trim().length < 2) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        isPublic,
        memberCompanyIds,
      });
      toast.success("Grup şablonu kaydedildi");
      setName("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şablon kaydedilemedi"));
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Şablon Olarak Kaydet</DialogTitle>
      <DialogDescription>
        Seçili {memberCompanyIds.length} firmayı bir grup şablonu olarak
        kaydet; sonraki ihalelerde tek tıkla davet et.
      </DialogDescription>
      <DialogBody className="space-y-3">
        <Field>
          <Label>Şablon Adı</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Ambalaj tedarikçileri"
            autoFocus
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Firmadaki herkes bu şablonu kullanabilsin
        </label>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          onClick={submit}
          disabled={create.isPending || name.trim().length < 2}
        >
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Adım 4 (sihirbazda) — Davet edilecek firmalar. Eski tedarikçi-daveti
 * adımının özellikleri: zengin firma kartı, tümünü seç, seçim özeti + temizle,
 * yeni firma davet modalı, bilgi notu. Veri kaynağı: bağlantılı firmalar.
 */
export function Step3Suppliers() {
  const { control, getValues, setValue } = useFormContext<TenderFormData>();
  const confirm = useConfirm();
  const connections = useConnections();
  const templates = useSupplierTemplates();
  const deleteTemplate = useDeleteSupplierTemplate();
  const visibility = useWatch({ control, name: "visibility" });
  const isPublic = visibility === "PUBLIC";
  // SATIS ihalede davet edilenler ALICI firmalardır (satın almacılar teklif verir).
  const isSatis = useWatch({ control, name: "listingType" }) === "SATIS";
  const roleWord = isSatis ? "alıcı" : "tedarikçi";
  const RoleWord = isSatis ? "Alıcı" : "Tedarikçi";
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const wizCategoryIds = useWatch({ control, name: "categoryIds" }) ?? [];
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);
  // PUBLIC'te bağlı-firma seçim listesi varsayılan gizli (opsiyonel ek davet).
  const [showConnections, setShowConnections] = useState(false);

  const applyTemplate = async (id: string) => {
    setApplyingId(id);
    try {
      const tpl = await fetchSupplierTemplate(id);
      const connectedRothern = new Set(
        (connections.data ?? [])
          .map((c) => c.company.rothernId)
          .filter(Boolean) as string[],
      );
      const current = new Set<string>(getValues("invitedSupplierIds") ?? []);
      let added = 0;
      // Atlama gerekçeleri AYRI raporlanır — "kodu yok" (veri sorunu,
      // backfill-rothern-ids ile onarılır) ile "bağlantında yok" farklı şeyler;
      // ikisini tek mesajda toplamak 2026-07-28 "0 davet" vakasında kullanıcıyı
      // yanlış yönlendirmişti.
      let noCode = 0;
      let notConnected = 0;
      for (const m of tpl.members) {
        if (!m.rothernId) {
          noCode++;
          continue;
        }
        if (!connectedRothern.has(m.rothernId)) {
          notConnected++;
          continue;
        }
        if (!current.has(m.rothernId)) {
          current.add(m.rothernId);
          added++;
        }
      }
      setValue("invitedSupplierIds", [...current], { shouldDirty: true });
      const parts = [
        `${added} firma eklendi`,
        ...(notConnected > 0 ? [`${notConnected} bağlantında yok, atlandı`] : []),
        ...(noCode > 0
          ? [`${noCode} firmanın Rothern kodu eksik — destek ile iletişime geçin`]
          : []),
      ];
      if (added === 0 && (noCode > 0 || notConnected > 0)) {
        toast.error(parts.join(" · "));
      } else {
        toast.success(parts.join(" · "));
      }
      setTplOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şablon uygulanamadı"));
    } finally {
      setApplyingId(null);
    }
  };

  const companies = useMemo(() => {
    const rows = (connections.data ?? [])
      .map((c) => c.company)
      .filter((c) => Boolean(c.rothernId));
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLocaleLowerCase("tr").includes(q) ||
        (c.rothernId ?? "").toLocaleLowerCase("tr").includes(q) ||
        (c.taxNumber ?? "").toLocaleLowerCase("tr").includes(q) ||
        (c.contactEmail ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [connections.data, search]);

  return (
    <Controller
      control={control}
      name="invitedSupplierIds"
      render={({ field }) => {
        const selected = new Set(field.value ?? []);
        const visibleCodes = companies
          .map((c) => c.rothernId!)
          .filter(Boolean);
        const allVisibleSelected =
          visibleCodes.length > 0 && visibleCodes.every((c) => selected.has(c));

        const toggle = (code: string) => {
          const next = new Set(selected);
          if (next.has(code)) next.delete(code);
          else next.add(code);
          field.onChange([...next]);
        };
        const selectAllVisible = () => {
          const next = new Set(selected);
          visibleCodes.forEach((c) => next.add(c));
          field.onChange([...next]);
        };
        const clearAll = () => field.onChange([]);

        const selectedCompanies = (connections.data ?? [])
          .map((c) => c.company)
          .filter((c) => c.rothernId && selected.has(c.rothernId));

        // PUBLIC'te bağlı-firma listesi varsayılan gizli; PRIVATE'te hep açık.
        const connListVisible = !isPublic || showConnections;

        return (
          <div className="space-y-6">
            {/* AI keşif banner'ı — "Belgeden Doldur" kartıyla aynı dil
                (kullanıcı isteği 2026-08-04): Davetliler adımının AI girişi
                belirgin olsun. */}
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">
                  AI ile daha fazla {isSatis ? "alıcıya" : "tedarikçiye"} eriş
                </p>
                <p className="text-xs text-zinc-500">
                  Kategorine uygun bağlantısız firmaları ve web&apos;deki
                  adayları AI ile bul, tek tıkla davet et.
                </p>
              </div>
              <Button onClick={() => setDiscoveryOpen(true)}>
                <Sparkles data-slot="icon" />
                Keşfet
              </Button>
            </div>

            {/* Başlık */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <Users2 className="h-5 w-5 text-zinc-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  {RoleWord} Daveti
                </h2>
                <p className="text-sm text-zinc-500">
                  {isPublic
                    ? "Opsiyonel — Rothern'de olmayan bir firmayı e-posta ile davet edebilirsin."
                    : "Bu ihaleye kimler teklif verebilir?"}
                </p>
              </div>
            </div>

            {/* Görünürlük bağlamı (Genel Bilgi adımında seçilir) */}
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4",
                visibility === "PUBLIC"
                  ? "border-blue-200 bg-blue-50"
                  : "border-zinc-200 bg-zinc-50",
              )}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <p className="text-sm text-zinc-600">
                {visibility === "PUBLIC" ? (
                  <>
                    Bu ihale <strong>Herkese Açık</strong>: kategorinize uygun
                    premium {roleWord === "alıcı" ? "alıcılar" : "tedarikçiler"} davet beklemeden görüp teklif verebilir.
                    Bu adım <strong>opsiyonel</strong> — çalışmak istediğin
                    firma henüz Rothern&apos;de değilse buradan e-posta ile
                    davet edebilirsin; kayıt olup davetini kabul ettiğinde
                    ihaleni görür ve teklif verebilir.
                  </>
                ) : (
                  <>
                    Bu ihale <strong>Davetli (Kapalı)</strong>: yalnızca aşağıdan
                    seçtiğin firmalar görüp teklif verebilir. Görünürlüğü Genel Bilgi
                    adımından değiştirebilirsin.
                  </>
                )}
              </p>
            </div>

            {/* Arama + Tümünü Seç + Yeni Davet */}
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              {connListVisible ? (
                <>
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Firma adı, VKN veya e-posta ara…"
                      aria-label="Davet edilecek firma ara"
                      className="w-full rounded-lg border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                  <Button
                    outline
                    onClick={selectAllVisible}
                    disabled={companies.length === 0 || allVisibleSelected}
                  >
                    <CheckSquare data-slot="icon" />
                    Tümünü Seç ({companies.length})
                  </Button>
                  <Button outline onClick={() => setTplOpen((o) => !o)}>
                    <LayoutTemplate data-slot="icon" />
                    Şablondan Yükle
                  </Button>
                  <Button
                    outline
                    onClick={() => setSaveOpen(true)}
                    disabled={selected.size === 0}
                  >
                    <Save data-slot="icon" />
                    Şablon Kaydet
                  </Button>
                </>
              ) : null}
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus2 data-slot="icon" />
                {`Yeni ${RoleWord} Davet Et`}
              </Button>
              {isPublic && !showConnections ? (
                <Button outline onClick={() => setShowConnections(true)}>
                  Bağlı firmalardan da davet et
                </Button>
              ) : null}
            </div>

            {/* Bağlı-firma seçimi (PUBLIC'te gizlenebilir) */}
            {connListVisible ? (
            <>
            {/* Tedarikçi şablonları paneli */}
            {tplOpen ? (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {RoleWord} Grupları
                  </h4>
                  <button
                    type="button"
                    onClick={() => setTplOpen(false)}
                    aria-label="Kapat"
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {templates.isLoading ? (
                  <p className="text-xs text-zinc-500">Yükleniyor…</p>
                ) : (templates.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Kayıtlı şablonun yok. Firma seçip &ldquo;Şablon
                    Kaydet&rdquo; ile oluşturabilirsin.
                  </p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                    {templates.data?.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => applyTemplate(t.id)}
                          disabled={applyingId !== null}
                          className="flex-1 truncate text-left text-sm font-medium text-zinc-900 hover:text-zinc-600 disabled:opacity-50"
                        >
                          {t.name}
                          <span className="ml-2 text-xs text-zinc-400">
                            {applyingId === t.id
                              ? "Ekleniyor…"
                              : `${t.memberCount} firma`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Şablonu sil",
                                description: `"${t.name}" şablonu silinsin mi?`,
                                confirmLabel: "Sil",
                                destructive: true,
                              })
                            )
                              deleteTemplate.mutate(t.id);
                          }}
                          aria-label="Sil"
                          className="shrink-0 text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {/* Liste */}
            {connections.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-zinc-100"
                  />
                ))}
              </div>
            ) : companies.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-950/10 p-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                  <Users2 className="h-6 w-6 text-zinc-400" />
                </div>
                <p className="text-sm text-zinc-500">
                  {search
                    ? `"${search}" için sonuç yok`
                    : "Henüz bağlantın yok — ihaleye davet için önce firma ekle."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={() => setInviteOpen(true)}>
                    <UserPlus2 data-slot="icon" />
                    {`Yeni ${RoleWord} Davet Et`}
                  </Button>
                  <Link
                    href={
                      isSatis
                        ? "/company/satis/musterilerim"
                        : "/company/satinalma/tedarikcilerim"
                    }
                    className="text-sm font-semibold text-zinc-900 hover:text-zinc-600"
                  >
                    Bağlantılar →
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500">
                  {companies.length} firma gösteriliyor ·{" "}
                  <strong className="text-zinc-800">{selected.size}</strong>{" "}
                  seçili
                </p>
                <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                  {companies.map((c) => {
                    const code = c.rothernId!;
                    const checked = selected.has(code);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => toggle(code)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl p-4 text-left ring-1 transition-all",
                          checked
                            ? "bg-zinc-50 ring-zinc-950/15"
                            : "bg-white ring-zinc-950/10 hover:bg-zinc-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-300",
                          )}
                        >
                          {checked ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="truncate font-semibold text-zinc-900">
                              {c.name}
                            </p>
                            {c.tier ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                                  TIER_BADGE[c.tier],
                                )}
                              >
                                {TIER_LABEL[c.tier]}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {c.taxNumber ? (
                              <>
                                VKN:{" "}
                                <span className="font-mono">{c.taxNumber}</span>
                              </>
                            ) : (
                              <span className="font-mono">{code}</span>
                            )}
                            {c.city ? ` · ${c.city}` : ""}
                            {c.industry ? ` · ${c.industry}` : ""}
                          </p>
                          {c.contactName ? (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              İletişim: {c.contactName}
                              {c.contactEmail ? ` · ${c.contactEmail}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Seçim özeti */}
            <div
              className={cn(
                "rounded-xl border-2 p-4",
                selected.size > 0
                  ? "border-zinc-200 bg-zinc-50"
                  : "border-dashed border-zinc-300 bg-zinc-50/50",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-900">
                  Seçilen {RoleWord === "Alıcı" ? "Alıcılar" : "Tedarikçiler"} ({selected.size})
                </p>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Temizle
                  </button>
                ) : null}
              </div>
              {selectedCompanies.length === 0 ? (
                <p className="text-sm italic text-zinc-500">
                  Henüz {roleWord} seçmedin
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedCompanies.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700"
                    >
                      <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="max-w-[14rem] truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => toggle(c.rothernId!)}
                        aria-label={`${c.name} kaldır`}
                        className="ml-0.5 text-zinc-400 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            </>
            ) : null}

            {/* Davet bekleyenler (bu oturumda) */}
            {pendingInvites.length > 0 ? (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">
                  Davet Bekleyen Firmalar ({pendingInvites.length})
                </p>
                <ul className="space-y-1.5">
                  {pendingInvites.map((email) => (
                    <li
                      key={email}
                      className="flex items-center gap-2 text-sm text-amber-800"
                    >
                      <UserPlus2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span className="font-mono">{email}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-700">
                  Davet kabul edilince bağlantılarına eklenir; sonra ihaleye
                  davet edebilirsin.
                </p>
              </div>
            ) : null}

            {/* Bilgi notu */}
            <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <p>
                Yayınlayınca seçili firmalara &ldquo;Yeni İhale Daveti&rdquo;
                e-postası gönderilir. Davet etmeden de ihaleyi oluşturabilir,
                sonra davet gönderebilirsin.
              </p>
            </div>

            <SupplierDiscoveryModal
              isOpen={discoveryOpen}
              onClose={() => setDiscoveryOpen(false)}
              type={isSatis ? "SATIS" : "ALIM"}
              categoryIds={wizCategoryIds}
            />
            <InviteByEmailModal
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              onInvited={(email) =>
                setPendingInvites((prev) =>
                  prev.includes(email) ? prev : [...prev, email],
                )
              }
            />
            <SaveTemplateModal
              open={saveOpen}
              onClose={() => setSaveOpen(false)}
              memberCompanyIds={selectedCompanies.map((c) => c.id)}
            />
          </div>
        );
      }}
    />
  );
}
