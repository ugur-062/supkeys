"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import {
  useApprovalFlows,
  useCreateApprovalFlow,
  useDeleteApprovalFlow,
  useDuplicateApprovalFlow,
  useSetApprovalFlowStatus,
  useUpdateApprovalFlow,
  type ApprovalFlow,
  type ApprovalListingType,
  type ApprovalType,
} from "@/hooks/use-company-approvals";
import { useCompanyUsers } from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TYPE_LABEL: Record<ApprovalType, string> = {
  LISTING_PUBLISH: "İlan Yayını",
  LISTING_AWARD: "Kazandırma",
};

function listingTypeLabel(t: ApprovalListingType | null) {
  return t === "ALIM" ? "Alım" : t === "SATIS" ? "Satış" : "Tüm ilanlar";
}

interface StepRow {
  approverUserId: string;
  threshold: string;
}

export function ApprovalFlowsSection({ canManage }: { canManage: boolean }) {
  const { data: flows, isLoading } = useApprovalFlows();
  const { data: users } = useCompanyUsers();
  const setStatus = useSetApprovalFlowStatus();
  const remove = useDeleteApprovalFlow();
  const duplicate = useDuplicateApprovalFlow();
  const create = useCreateApprovalFlow();

  const [editing, setEditing] = useState<ApprovalFlow | "new" | null>(null);

  if (!canManage) return null;

  const handleToggle = async (f: ApprovalFlow) => {
    const next = f.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    try {
      await setStatus.mutateAsync({ id: f.id, status: next });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Durum güncellenemedi"));
    }
  };

  const handleDuplicate = async (f: ApprovalFlow) => {
    try {
      await duplicate.mutateAsync(f.id);
      toast.success("Akış kopyalandı (taslak)");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kopyalanamadı"));
    }
  };

  const handleDelete = async (f: ApprovalFlow) => {
    if (!confirm(`"${f.name}" akışı silinsin mi?`)) return;
    try {
      await remove.mutateAsync(f.id);
      toast.success("Akış silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>Onay Akışları</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            İlan yayını ve kazandırma için çok-adımlı onay zinciri tanımlayın.
          </Text>
        </div>
        <Button onClick={() => setEditing("new")} disabled={create.isPending}>
          Yeni Akış
        </Button>
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !flows || flows.length === 0 ? (
        <Text className="mt-3 text-sm text-zinc-500">
          Henüz onay akışı yok. Akış olmadan ilanlar doğrudan yayınlanır.
        </Text>
      ) : (
        <div className="mt-4 space-y-2">
          {flows.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">
                    {f.name}
                  </span>
                  <Badge
                    color={
                      f.status === "ACTIVE"
                        ? "green"
                        : f.status === "PASSIVE"
                          ? "zinc"
                          : "amber"
                    }
                  >
                    {f.status === "ACTIVE"
                      ? "Aktif"
                      : f.status === "PASSIVE"
                        ? "Pasif"
                        : "Taslak"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {TYPE_LABEL[f.type]} · {listingTypeLabel(f.listingType)} ·{" "}
                  {f.steps.length} adım
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button plain onClick={() => handleToggle(f)}>
                  {f.status === "ACTIVE" ? "Pasifleştir" : "Aktifleştir"}
                </Button>
                <Button plain onClick={() => setEditing(f)}>
                  Düzenle
                </Button>
                <Button
                  plain
                  onClick={() => handleDuplicate(f)}
                  disabled={duplicate.isPending}
                >
                  Kopyala
                </Button>
                <Button plain onClick={() => handleDelete(f)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <FlowDialog
          flow={editing === "new" ? null : editing}
          // Onaycı yalnızca AKTİF Yönetici/Onaylayıcı olabilir (backend de
          // zorlar) — operasyon rolleri listede görünmez.
          users={(users ?? [])
            .filter(
              (u) =>
                u.isActive &&
                (u.roles.includes("YONETICI") ||
                  u.roles.includes("ONAYLAYICI")),
            )
            .map((u) => ({
              id: u.id,
              name: `${u.firstName} ${u.lastName}`,
            }))}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function FlowDialog({
  flow,
  users,
  onClose,
}: {
  flow: ApprovalFlow | null;
  users: { id: string; name: string }[];
  onClose: () => void;
}) {
  const create = useCreateApprovalFlow();
  const update = useUpdateApprovalFlow(flow?.id ?? "");

  const [name, setName] = useState(flow?.name ?? "");
  const [type, setType] = useState<ApprovalType>(
    flow?.type ?? "LISTING_PUBLISH",
  );
  const [listingType, setListingType] = useState<ApprovalListingType | "">(
    flow?.listingType ?? "",
  );
  const [steps, setSteps] = useState<StepRow[]>(
    flow?.steps.map((s) => ({
      approverUserId: s.approverUserId,
      threshold: s.conditionMinAmount != null ? String(s.conditionMinAmount) : "",
    })) ?? [{ approverUserId: users[0]?.id ?? "", threshold: "" }],
  );
  const [initiatorRoles, setInitiatorRoles] = useState<CompanyRole[]>(
    flow?.initiatorRoles ?? [],
  );

  const toggleInitiator = (r: CompanyRole) =>
    setInitiatorRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );

  const busy = create.isPending || update.isPending;

  const addStep = () =>
    setSteps((s) => [...s, { approverUserId: users[0]?.id ?? "", threshold: "" }]);
  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i));
  const setStep = (i: number, patch: Partial<StepRow>) =>
    setSteps((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error("Akış adı en az 2 karakter");
      return;
    }
    const validSteps = steps.filter((s) => s.approverUserId);
    if (validSteps.length === 0) {
      toast.error("En az bir onay adımı (onaycı) ekleyin");
      return;
    }
    const input = {
      name: name.trim(),
      type,
      listingType: listingType || undefined,
      initiatorRoles: initiatorRoles.length ? initiatorRoles : undefined,
      steps: validSteps.map((s) => ({
        approverUserId: s.approverUserId,
        conditionMinAmount: s.threshold ? Number(s.threshold) : undefined,
      })),
    };
    try {
      if (flow) {
        await update.mutateAsync(input);
        toast.success("Akış güncellendi");
      } else {
        await create.mutateAsync(input);
        toast.success("Akış oluşturuldu (taslak) — aktifleştirmeyi unutmayın");
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>{flow ? "Akışı Düzenle" : "Yeni Onay Akışı"}</DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Akış adı</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>Onay tipi</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as ApprovalType)}
            >
              <option value="LISTING_PUBLISH">İlan Yayını</option>
              <option value="LISTING_AWARD">Kazandırma</option>
            </Select>
          </Field>
          <Field>
            <Label>Uygulanacak ilan tipi</Label>
            <Select
              value={listingType}
              onChange={(e) =>
                setListingType(e.target.value as ApprovalListingType | "")
              }
            >
              <option value="">Tüm ilanlar</option>
              <option value="ALIM">Alım</option>
              <option value="SATIS">Satış</option>
            </Select>
          </Field>
        </div>

        {/* Başlatıcı roller — boş = herkes başlatabilir */}
        <div>
          <span className="block text-sm font-medium text-zinc-950">
            Bu akışı başlatabilen roller
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["SATIN_ALMACI", "Satın Almacı"],
                ["SATISCI", "Satışçı"],
                ["YONETICI", "Yönetici"],
                ["ONAYLAYICI", "Onaylayıcı"],
              ] as [CompanyRole, string][]
            ).map(([role, label]) => {
              const on = initiatorRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleInitiator(role)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Text className="mt-1.5 text-xs text-zinc-400">
            Boş bırakılırsa herkes bu onayı tetikleyebilir.
          </Text>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-950">
              Onay adımları (sıralı)
              <span className="ml-1.5 text-xs font-normal text-zinc-400">
                — onaycı yalnızca Yönetici/Onaylayıcı rolündeki aktif
                kullanıcılar olabilir
              </span>
            </span>
            <Button plain onClick={addStep}>
              <Plus className="h-4 w-4" />
              Adım Ekle
            </Button>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-zinc-400">
                  {i + 1}
                </span>
                <Select
                  value={s.approverUserId}
                  onChange={(e) =>
                    setStep(i, { approverUserId: e.target.value })
                  }
                  className="flex-1"
                >
                  <option value="">— onaycı seç —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="Eşik (₺) — ops."
                  value={s.threshold}
                  onChange={(e) => setStep(i, { threshold: e.target.value })}
                  className="w-40"
                />
                {steps.length > 1 ? (
                  <Button plain onClick={() => removeStep(i)}>
                    <Trash2 className="h-4 w-4 text-zinc-400" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <Text className="mt-2 text-xs text-zinc-400">
            Eşik girilirse, tahmini tutar o eşiğin altındaysa adım atlanır.
          </Text>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={save} disabled={busy}>
          {flow ? "Kaydet" : "Oluştur"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
