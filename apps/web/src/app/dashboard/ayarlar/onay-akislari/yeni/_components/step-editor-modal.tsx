"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountTR } from "@/lib/approval-flows/labels";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Layers, X } from "lucide-react";
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
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[90vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  {initialData ? "Adımı Düzenle" : "Yeni Adım Ekle"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Onaylayıcı + bütçe eşiği + isteğe bağlı etiket.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
            <Field hint="Sadece Firma Yöneticisi ve Onaylayıcı roller listede.">
              <Label htmlFor="step-approver">
                Onaylayıcı <span className="text-danger-500">*</span>
              </Label>
              <select
                id="step-approver"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm",
                  "text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
                  "border-surface-border",
                )}
                value={approverUserId}
                onChange={(e) => setApproverUserId(e.target.value)}
              >
                <option value="">— Kullanıcı seçin —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {roleLabel(u.role)}
                  </option>
                ))}
              </select>
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
                  Bu adım, ihale tutarı bu eşiğin <strong>üstünde</strong>{" "}
                  olduğunda devreye girer. Boş bırakılırsa her tutarda aktif.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field>
                  <Label htmlFor="step-currency">Para Birimi</Label>
                  <select
                    id="step-currency"
                    className={cn(
                      "w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm",
                      "border-surface-border",
                    )}
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
                  </select>
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
                  💡 Önceki adımın eşiği:{" "}
                  <strong>
                    {formatAmountTR(previousMaxAmount, conditionCurrency)}
                  </strong>
                  . Yeni eşik bundan büyük olmalı.
                </p>
              ) : null}
            </div>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              className="flex-1"
            >
              {initialData ? "Güncelle" : "Adım Ekle"}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
