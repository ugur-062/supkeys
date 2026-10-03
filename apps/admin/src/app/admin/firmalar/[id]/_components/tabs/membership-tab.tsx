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
import { parseAdminInteger } from "@/lib/number-input";
import {
  useExtendMembership,
  useMembershipHistory,
  useSetCompanyTier,
  type AdminCompanyDetail,
  type MembershipEvent,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { membershipEventActor, membershipEventReason } from "@/lib/membership-event";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  PAID_TIER_OPTIONS,
  TIER_COLOR,
  TIER_LABEL,
} from "@/lib/terms";
import { canAdminDo } from "@/lib/admin-permissions";
import {
  remainingSentence,
  revokeNotice,
  tierGrantWarnings,
} from "../tier-warnings";
import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

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

/** Ay alanı doğrulaması — backend @Min(1) @Max(60) ile birebir. */
function monthsError(raw: string): string | null {
  // Türkçe kesin ayrıştırma (arayüz testi kapanış NUM): `type="number"` "0,5"i
  // 05 = 5 ay okuyordu ve tam sayı denetimi geçiyordu.
  return parseAdminInteger(raw, 1, 60) == null ? "Ay 1-60 arası bir tam sayı olmalı" : null;
}

function MonthsReasonDialog({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  withTierSelect = false,
  initialTier = "GOLD",
  warningsFor,
}: {
  title: string;
  confirmLabel: string;
  /** Promise dönerse diyalog başarıya dek açık kalır (çağıran kapatır). */
  onConfirm: (months: number, reason: string, tier: PaidTier) => unknown;
  onClose: () => void;
  /** Faz T: paket tanımlarken kademe seçimi (Silver/Gold). */
  withTierSelect?: boolean;
  initialTier?: PaidTier;
  /** Seçili kademeye göre onay öncesi uyarılar (D-191). */
  warningsFor?: (tier: PaidTier) => string[];
}) {
  const [months, setMonths] = useState("12");
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<PaidTier>(initialTier);
  const warnings = warningsFor ? warningsFor(tier) : [];
  const mErr = monthsError(months);

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
        {warnings.length > 0 ? (
          <div
            role="note"
            className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}
        <Field error={mErr ?? undefined}>
          <Label htmlFor="membership-months">Ay sayısı</Label>
          <Input
            id="membership-months"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={months}
            hasError={!!mErr}
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
          disabled={!!mErr}
          onClick={() => {
            if (mErr) return;
            // Promise döner → Button iş bitene dek kilitli (FX-00).
            return onConfirm(parseAdminInteger(months, 1, 60)!, reason.trim(), tier);
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

  const err = (e: unknown) => toastApiError(e);
  // KVKK ile anonimleştirilmiş firmada paket işlemi yok (D-208; API 409).
  const anonymized = !!data.anonymized;
  // Süresiz paket uzatılamaz (API reddeder) — düğme yalnız bitiş varken (D-203).
  const canExtend =
    canAdminDo(role, "extendMembership") && !!data.membershipEndAt;
  const remaining = remainingSentence(data.tier, data.membershipEndAt, (iso) =>
    safeFormat(iso, "d MMMM yyyy"),
  );

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
            {anonymized ? (
              <span className="text-admin-text-muted text-xs">
                KVKK ile anonimleştirildi — paket işlemi yapılamaz.
              </span>
            ) : data.tier !== "STANDART" ? (
              <>
                {canExtend ? (
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
          {data.tier !== "STANDART" && !data.membershipEndAt && !anonymized ? (
            <>
              {" "}
              Bu paket <strong>süresiz</strong> — uzatılamaz; süre tanımlamak
              için Yeni Dönem Başlat ile bitiş tarihli olarak yeniden verin.
            </>
          ) : null}
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
                error={history.isError}
                onRetry={() => void history.refetch()}
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
                    {membershipEventActor(e)}
                  </TableCell>
                  <TableCell className="text-admin-text-muted max-w-[240px] truncate text-xs">
                    {membershipEventReason(e.reason) ?? "—"}
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
          warningsFor={(t) =>
            tierGrantWarnings(
              { tier: data.tier, verification: data.companyVerificationStatus },
              t,
            )
          }
          onConfirm={(months, reason, tier) =>
            // Başarıda kapanır; hata dalında girilen değerler kaybolmaz.
            tierAct
              .mutateAsync({ id: companyId, tier, months, reason: reason || undefined })
              .then(() => {
                toast.success(`${TIER_LABEL[tier]} paketi tanımlandı`);
                setDialog(null);
              }, err)
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "extend" ? (
        <MonthsReasonDialog
          title="Süre Uzat (mevcut bitişe ekler)"
          confirmLabel="Uzat"
          onConfirm={(months, reason) =>
            extend
              .mutateAsync({ id: companyId, months, reason: reason || undefined })
              .then((r) => {
                toast.success(
                  `Uzatıldı — yeni bitiş ${safeFormat(r.membershipEndAt, "d MMMM yyyy")}`,
                );
                setDialog(null);
              }, err)
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      <PromptDialog
        open={dialog === "revoke"}
        title="Paketi Kaldır"
        notice={revokeNotice(remaining)}
        label="Gerekçe (opsiyonel — geçmişte görünür)"
        placeholder="Örn. iade talebi"
        // Backend `reason` @MaxLength(500) — fazlası diyaloğu kapatıp metni
        // siliyordu (arayüz testi D-202).
        maxLength={500}
        confirmLabel="Kaldır"
        onConfirm={(v) =>
          // Başarıda kapanır; hata dalında gerekçe kaybolmaz.
          tierAct
            .mutateAsync({
              id: companyId,
              tier: "STANDART",
              reason: (v || "").trim() || undefined,
            })
            .then(() => {
              toast.success("Paket kaldırıldı (Standart)");
              setDialog(null);
            }, err)
        }
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
