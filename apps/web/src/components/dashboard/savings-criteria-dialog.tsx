"use client";

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
  DialogActions,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/catalyst/button";
import { DASH, PARAM_LABELS } from "@/lib/dashboard/strings";
import type { TimeSavingsData } from "@/hooks/use-company-dashboard";

/**
 * "Nasıl hesaplanıyor?" — formül + parametrelerin ŞEFFAF dökümü.
 * Hem üst şeritten hem Tasarruf sekmesindeki "Hesaplama Kriterlerini
 * İncele"den açılır (tek desen).
 */
export function SavingsCriteriaDialog({
  open,
  onClose,
  params,
}: {
  open: boolean;
  onClose: () => void;
  params?: TimeSavingsData["params"];
}) {
  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{DASH.criteriaTitle}</DialogTitle>
      <DialogDescription>{DASH.criteriaIntro}</DialogDescription>
      <DialogBody className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">
          {DASH.criteriaParamsTitle}
        </p>
        <ul className="space-y-1 text-sm text-slate-600">
          {Object.entries(PARAM_LABELS).map(([key, label]) => {
            const v = params?.[key];
            return (
              <li key={key} className="flex items-baseline justify-between gap-3">
                <span>{label}</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {v == null ? "—" : v}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-5 text-slate-500">
          {DASH.criteriaParamNote}
        </p>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Kapat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
