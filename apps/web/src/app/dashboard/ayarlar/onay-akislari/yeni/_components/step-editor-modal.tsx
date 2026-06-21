"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountTR } from "@/lib/approval-flows/labels";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { FlowStepDraft } from "../../_components/wizard-types";

interface Props {
  open: boolean;
  onClose: () => void;
  users: TenantUserListItem[];
  existingSteps: FlowStepDraft[];
  /** edit modu için adım indeksi; null ise yeni adım */
  editingIndex: number | null;
  initialData: FlowStepDraft | null;
  onSave: (data: Omit<FlowStepDraft, "orderIndex">) => void;
}

export function StepEditorModal({
  open,
  onClose,
  users,
  existingSteps,
  editingIndex,
  initialData,
  onSave,
}: Props) {
  const [approverUserId, setApproverUserId] = useState("");
  const [conditionMinAmount, setConditionMinAmount] = useState<string>("");
  const [conditionCurrency, setConditionCurrency] = useState("TRY");
  const [displayLabel, setDisplayLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setApproverUserId(initialData.approverUserId);
      setConditionMinAmount(
        initialData.conditionMinAmount !== undefined &&
          initialData.conditionMinAmount !== null
          ? String(initialData.conditionMinAmount)
          : "",
      );
      setConditionCurrency(initialData.conditionCurrency ?? "TRY");
      setDisplayLabel(initialData.displayLabel ?? "");
    } else {
      setApproverUserId("");
      setConditionMinAmount("");
      setConditionCurrency("TRY");
      setDisplayLabel("");
    }
  }, [open, initialData]);

  // Önceki adımın eşiğini bul (monoton kontrolü için)
  const previousMaxAmount = existingSteps
    .filter((_, i) => editingIndex === null || i < editingIndex)
    .reduce(
      (max, s) =>
        s.conditionMinAmount !== undefined &&
        s.conditionMinAmount !== null &&
        s.conditionMinAmount > max
          ? s.conditionMinAmount
          : max,
      0,
    );

  const handleSave = () => {
    if (!approverUserId) {
      toast.error("Onaylayıcı seçin");
      return;
    }
    let amount: number | undefined;
    if (conditionMinAmount.trim() !== "") {
      const parsed = Number(conditionMinAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Geçerli bir tutar girin");
        return;
      }
      amount = parsed;
      if (previousMaxAmount > 0 && amount <= previousMaxAmount) {
        toast.error(
          `Eşik önceki adımdan büyük olmalı (önceki: ${formatAmountTR(
            previousMaxAmount,
            conditionCurrency,
          )})`,
        );
        return;
      }
    }

    onSave({
      approverUserId,
      conditionMinAmount: amount,
      conditionCurrency: conditionCurrency || "TRY",
      displayLabel: displayLabel.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Layers className="h-5 w-5 text-zinc-700" />
        </div>
        <div>
          <DialogTitle>
            {initialData ? "Adımı Düzenle" : "Yeni Adım Ekle"}
          </DialogTitle>
          <DialogDescription>
            Onaylayıcı + bütçe eşiği + isteğe bağlı etiket.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <Field hint="Sadece Yönetici ve Onaylayıcı roller listede.">
          <Label htmlFor="step-approver">
            Onaylayıcı <span className="text-danger-500">*</span>
          </Label>
          <Select
            id="step-approver"
            value={approverUserId}
            onChange={(e) => setApproverUserId(e.target.value)}
          >
            <option value="">— Kullanıcı seçin —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} · {roleLabel(u.role)}
              </option>
            ))}
          </Select>
        </Field>

        <Field hint={"Diagram’da görünen soft etiket — örn “Satınalma Müdürü”"}>
          <Label htmlFor="step-label">Etiket (opsiyonel)</Label>
          <Input
            id="step-label"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            placeholder="Satınalma Müdürü"
            maxLength={100}
          />
        </Field>

        <div className="rounded-xl border border-warning-200 bg-warning-50/40 p-4 space-y-3">
          <div>
            <p className="font-bold text-warning-900 text-sm">
              Bütçe Eşiği (Opsiyonel)
            </p>
            <p className="text-xs text-warning-700 mt-0.5">
              Bu adım, ihale tutarı bu eşiğin <strong>üstünde</strong> olduğunda
              devreye girer. Boş bırakılırsa her tutarda aktif.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field>
              <Label htmlFor="step-currency">Para Birimi</Label>
              <Select
                id="step-currency"
                value={conditionCurrency}
                onChange={(e) => setConditionCurrency(e.target.value)}
              >
                <option value="TRY">TRY</option>
                <option value="USD" disabled>
                  USD (V2)
                </option>
                <option value="EUR" disabled>
                  EUR (V2)
                </option>
              </Select>
            </Field>

            <Field className="col-span-2">
              <Label htmlFor="step-amount">Minimum Tutar</Label>
              <Input
                id="step-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={conditionMinAmount}
                onChange={(e) => setConditionMinAmount(e.target.value)}
                placeholder={
                  previousMaxAmount > 0
                    ? `${previousMaxAmount.toLocaleString("tr-TR")} üstü`
                    : "0 = her tutarda aktif"
                }
              />
            </Field>
          </div>

          {previousMaxAmount > 0 ? (
            <p className="text-[11px] text-warning-700">
              Önceki adımın eşiği:{" "}
              <strong>
                {formatAmountTR(previousMaxAmount, conditionCurrency)}
              </strong>
              . Yeni eşik bundan büyük olmalı.
            </p>
          ) : null}
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={handleSave}>
          {initialData ? "Güncelle" : "Adım Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
