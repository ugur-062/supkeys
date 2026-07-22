"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useExtendMembership,
  useMembershipHistory,
  useSetCompanyTier,
  type AdminCompanyDetail,
  type MembershipEvent,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  PAID_TIER_OPTIONS,
  TIER_COLOR,
  TIER_LABEL,
} from "@/lib/terms";
import { canAdminDo } from "@/lib/admin-permissions";
import { useState } from "react";
import { toast } from "sonner";

const ACTION_META: Record<
  MembershipEvent["action"],
  { label: string; color: "green" | "blue" | "red" | "zinc" }
> = {
  GRANT: { label: "Tanımlandı", color: "green" },
  EXTEND: { label: "Uzatıldı", color: "blue" },
  REVOKE: { label: "Kaldırıldı", color: "red" },
  EXPIRE: { label: "Süre doldu", color: "zinc" },
};

/** Ay + gerekçe isteyen küçük aksiyon dialog'u (tanımla/uzat). */
type PaidTier = (typeof PAID_TIER_OPTIONS)[number];

function MonthsReasonDialog({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  withTierSelect = false,
  initialTier = "GOLD",
}: {
  title: string;
  confirmLabel: string;
  onConfirm: (months: number, reason: string, tier: PaidTier) => void;
  onClose: () => void;
  /** Faz T: paket tanımlarken kademe seçimi (Bronz/Silver/Gold). */
  withTierSelect?: boolean;
  initialTier?: PaidTier;
}) {
  const [months, setMonths] = useState("12");
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<PaidTier>(initialTier);

  return (
    <Dialog open onClose={onClose} size="sm" aria-label={title}>
      <DialogTitle>{title}</DialogTitle>
      <DialogBody className="space-y-4">
        {withTierSelect ? (
          <Field>
            <Label htmlFor="membership-tier">Paket</Label>
            <select
              id="membership-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as PaidTier)}
              className="border-admin-border w-full rounded-lg border px-2.5 py-1.5 text-sm"
            >
              {PAID_TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field>
          <Label htmlFor="membership-months">Ay sayısı</Label>
          <Input
            id="membership-months"
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </Field>
        <Field hint="Geçmiş kayıtlarında görünür.">
          <Label htmlFor="membership-reason">Gerekçe (opsiyonel)</Label>
          <Input
            id="membership-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. yıllık yenileme satışı"
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          onClick={() => {
            const n = Math.floor(Number(months));
            if (!Number.isFinite(n) || n < 1 || n > 60) {
              toast.error("Ay 1-60 arası olmalı");
              return;
            }
            onConfirm(n, reason.trim(), tier);
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Üyelik — durum + ver/UZAT/kaldır + geçmiş. Uzat mevcut bitişe ay EKLER
 * (kalan süre yanmaz); "Yeni Dönem Başlat" bitişi bugünden yeniden başlatır.
 */
export function MembershipTab({
  companyId,
  data,
}: {
  companyId: string;
  data: AdminCompanyDetail;
}) {
  const tierAct = useSetCompanyTier();
  // F7: setTier (ver/kaldır) SUPER_ADMIN-only; Süre Uzat SALES+SUPER (backend
  // @RequireAdminRole birebir). SALES premium ver/kaldır GÖRMEZ.
  const { admin } = useAdminAuth();
  const role = admin?.role;
  const extend = useExtendMembership();
  const history = useMembershipHistory(companyId);
  const [dialog, setDialog] = useState<"grant" | "extend" | "revoke" | null>(
    null,
  );
  const daysLeft = data.membershipEndAt
    ? Math.ceil(
        (new Date(data.membershipEndAt).getTime() - Date.now()) / 86_400_000,
      )
    : null;

  const err = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Hata");

  return (
    <div className="space-y-4">
      <section className="admin-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-admin-text text-sm font-semibold">
              Mevcut Üyelik
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <Badge color={TIER_COLOR[data.tier] ?? "zinc"}>
                {TIER_LABEL[data.tier] ?? data.tier}
              </Badge>
              {data.tier !== "STANDART" && data.membershipEndAt ? (
                <span className="text-admin-text-muted text-sm">
                  Bitiş: {safeFormat(data.membershipEndAt, "d MMMM yyyy")}
                  {daysLeft != null ? (
                    <span
                      className={
                        daysLeft <= 30
                          ? "ml-1 font-semibold text-red-600"
                          : "ml-1"
                      }
                    >
                      {daysLeft <= 0 ? "(Süresi doldu)" : `(${daysLeft} gün)`}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.tier !== "STANDART" ? (
              <>
                {canAdminDo(role, "extendMembership") ? (
                  <Button size="sm" onClick={() => setDialog("extend")}>
                    Süre Uzat
                  </Button>
                ) : null}
                {canAdminDo(role, "setTier") ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDialog("grant")}
                    >
                      Yeni Dönem Başlat
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={tierAct.isPending}
                      onClick={() => setDialog("revoke")}
                    >
                      Paketi Kaldır
                    </Button>
                  </>
                ) : null}
              </>
            ) : canAdminDo(role, "setTier") ? (
              <Button size="sm" onClick={() => setDialog("grant")}>
                Paket Tanımla
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-admin-text-muted mt-3 text-xs">
          <strong>Süre Uzat</strong> mevcut bitişe ay ekler (kalan süre yanmaz).
          <strong> Yeni Dönem Başlat</strong> bitişi bugünden yeniden hesaplar.
        </p>
      </section>

      {/* Geçmiş */}
      <section className="admin-card overflow-hidden">
        <div className="border-admin-border border-b px-5 py-3.5">
          <h3 className="text-admin-text text-sm font-semibold">
            Üyelik Geçmişi
          </h3>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Tarih</TableHeader>
              <TableHeader>İşlem</TableHeader>
              <TableHeader>Ay</TableHeader>
              <TableHeader>Yeni bitiş</TableHeader>
              <TableHeader>Yapan</TableHeader>
              <TableHeader>Gerekçe</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(history.data ?? []).length === 0 ? (
              <TableStateRow
                colSpan={6}
                loading={history.isLoading}
                empty="Üyelik hareketi yok"
              />
            ) : (
              (history.data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(e.createdAt, "d MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge color={ACTION_META[e.action].color}>
                      {ACTION_META[e.action].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-admin-text text-sm tabular-nums">
                    {e.months ?? "—"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {e.endAfter ? safeFormat(e.endAfter, "d MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs">
                    {e.adminEmail ?? "sistem"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted max-w-[240px] truncate text-xs">
                    {e.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {dialog === "grant" ? (
        <MonthsReasonDialog
          title={
            data.tier !== "STANDART"
              ? "Yeni Üyelik Dönemi Başlat"
              : "Paket Tanımla"
          }
          confirmLabel="Tanımla"
          withTierSelect
          initialTier={
            data.tier !== "STANDART" ? (data.tier as PaidTier) : "GOLD"
          }
          onConfirm={(months, reason, tier) => {
            tierAct.mutate(
              { id: companyId, tier, months, reason: reason || undefined },
              {
                onSuccess: () =>
                  toast.success(`${TIER_LABEL[tier]} paketi tanımlandı`),
                onError: err,
              },
            );
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "extend" ? (
        <MonthsReasonDialog
          title="Süre Uzat (mevcut bitişe ekler)"
          confirmLabel="Uzat"
          onConfirm={(months, reason) => {
            extend.mutate(
              { id: companyId, months, reason: reason || undefined },
              {
                onSuccess: (r) =>
                  toast.success(
                    `Uzatıldı — yeni bitiş ${safeFormat(r.membershipEndAt, "d MMMM yyyy")}`,
                  ),
                onError: err,
              },
            );
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <PromptDialog
        open={dialog === "revoke"}
        title="Paketi Kaldır"
        label="Gerekçe (opsiyonel — geçmişte görünür)"
        placeholder="Örn. iade talebi"
        confirmLabel="Kaldır"
        onConfirm={(v) => {
          tierAct.mutate(
            {
              id: companyId,
              tier: "STANDART",
              reason: (v || "").trim() || undefined,
            },
            {
              onSuccess: () => toast.success("Paket kaldırıldı (Standart)"),
              onError: err,
            },
          );
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
