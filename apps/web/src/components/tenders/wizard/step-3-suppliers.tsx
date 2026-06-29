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
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  CheckSquare,
  Info,
  Search,
  UserPlus2,
  Users2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

const TIER_LABEL = { STANDARD: "Standart", PAKET: "Premium" } as const;
const TIER_BADGE = {
  STANDARD: "bg-zinc-100 text-zinc-700",
  PAKET: "bg-amber-100 text-amber-800",
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
    } catch {
      toast.error("Davet gönderilemedi");
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Yeni Tedarikçi Davet Et</DialogTitle>
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

/**
 * Adım 4 (sihirbazda) — Davet edilecek firmalar. Eski tedarikçi-daveti
 * adımının özellikleri: zengin firma kartı, tümünü seç, seçim özeti + temizle,
 * yeni firma davet modalı, bilgi notu. Veri kaynağı: bağlantılı firmalar.
 */
export function Step3Suppliers() {
  const { control } = useFormContext<TenderFormData>();
  const connections = useConnections();
  const visibility = useWatch({ control, name: "visibility" });
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);

  const companies = useMemo(() => {
    const rows = (connections.data ?? [])
      .map((c) => c.company)
      .filter((c) => Boolean(c.supkeysId));
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLocaleLowerCase("tr").includes(q) ||
        (c.supkeysId ?? "").toLocaleLowerCase("tr").includes(q) ||
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
          .map((c) => c.supkeysId!)
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
          .filter((c) => c.supkeysId && selected.has(c.supkeysId));

        return (
          <div className="space-y-6">
            {/* Başlık */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <Users2 className="h-5 w-5 text-zinc-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  Tedarikçi Daveti
                </h2>
                <p className="text-sm text-zinc-500">
                  Bu ihaleye kimler teklif verebilir?
                </p>
              </div>
            </div>

            {/* Görünürlük bağlamı (Adım 2'de seçilir) */}
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
                    Bu ihale <strong>Herkese Açık</strong>: davetlilere ek olarak
                    kategorinize uygun premium tedarikçiler de teklif verebilir.
                    Görünürlüğü Adım 2'den değiştirebilirsin.
                  </>
                ) : (
                  <>
                    Bu ihale <strong>Davetli (Kapalı)</strong>: yalnızca aşağıdan
                    seçtiğin firmalar görüp teklif verebilir. Görünürlüğü Adım
                    2'den değiştirebilirsin.
                  </>
                )}
              </p>
            </div>

            {/* Arama + Tümünü Seç + Yeni Davet */}
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Firma adı, VKN veya e-posta ara…"
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
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus2 data-slot="icon" />
                Yeni Tedarikçi Davet Et
              </Button>
            </div>

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
                    Yeni Tedarikçi Davet Et
                  </Button>
                  <Link
                    href="/company/satinalma/tedarikcilerim"
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
                    const code = c.supkeysId!;
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
                                  "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
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
                  Seçilen Tedarikçiler ({selected.size})
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
                  Henüz tedarikçi seçmedin
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedCompanies.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700"
                    >
                      <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="max-w-[14rem] truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => toggle(c.supkeysId!)}
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

            <InviteByEmailModal
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              onInvited={(email) =>
                setPendingInvites((prev) =>
                  prev.includes(email) ? prev : [...prev, email],
                )
              }
            />
          </div>
        );
      }}
    />
  );
}
