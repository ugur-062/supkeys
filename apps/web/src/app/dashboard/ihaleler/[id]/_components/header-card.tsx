"use client";

import {
  CountdownFull,
  TenderLiveStatusPill,
} from "@/components/tenders/countdown-full";
import { TenderTypeBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { ReadOnlyBanner } from "@/components/tenders/read-only-banner";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTenderOwnership } from "@/hooks/use-tender-ownership";
import {
  useCancelTender,
  useCloseBiddingEarly,
  useDeleteTender,
  usePublishTender,
} from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { TenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Award,
  Ban,
  ChevronDown,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Send,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PublishConfirmDialog } from "../../yeni/_components/publish-confirm-dialog";
// Performans audit P-4 — 650 satırlık wizard; kazandırma yapılana kadar
// route bundle'ına girmesin.
const AwardWizardModal = dynamic(
  () => import("./award-wizard-modal").then((m) => m.AwardWizardModal),
  { ssr: false },
);
import { CancelTenderDialog } from "./cancel-tender-dialog";
import { ChangeClosingTimeDialog } from "./change-closing-time-dialog";
import { CloseBiddingEarlyDialog } from "./close-bidding-early-dialog";
import { CloseNoAwardDialog } from "./close-no-award-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

const MORE_TRIGGER_CLASSES = cn(
  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium",
  "bg-white border border-surface-border text-slate-700",
  "hover:bg-slate-50 hover:text-slate-900 transition-colors",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
  "disabled:opacity-40 disabled:cursor-not-allowed",
);

const MORE_ITEM_CLASSES = cn(
  "flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-md cursor-pointer outline-none",
  "data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900",
);

const MORE_ITEM_DANGER = cn(
  "flex items-center gap-2 w-full px-3 py-2 text-sm text-danger-600 rounded-md cursor-pointer outline-none",
  "data-[highlighted]:bg-danger-50 data-[highlighted]:text-danger-700",
);

const MORE_ITEM_WARNING = cn(
  "flex items-center gap-2 w-full px-3 py-2 text-sm text-purple-700 rounded-md cursor-pointer outline-none",
  "data-[highlighted]:bg-purple-50 data-[highlighted]:text-purple-800",
);

export function TenderHeaderCard({ tender }: { tender: TenderDetail }) {
  const router = useRouter();
  const { user } = useAuth();
  // V2-6.5 RBAC — aksiyon butonları permission tabanlı
  const { has } = usePermissions();
  // Creator-gate — bir BUYER ekibin diğer BUYER'ının ihalesine karışamaz.
  const ownership = useTenderOwnership(tender.createdBy);
  const canEdit = has("tender:edit") && ownership.canAct;
  const canPublish = has("tender:publish") && ownership.canAct;
  const canDelete = has("tender:delete") && ownership.canAct;
  const canCancel = has("tender:cancel") && ownership.canAct;
  const canAward = has("tender:award") && ownership.canAct;
  // "Onayı İptal Et" — initiator kendi süreci için iptal eder; COMPANY_ADMIN'a
  // admin override hakkı kalır (role check).
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [closeNoAwardOpen, setCloseNoAwardOpen] = useState(false);
  const [closeBiddingOpen, setCloseBiddingOpen] = useState(false);
  const [changeTimeOpen, setChangeTimeOpen] = useState(false);

  const publishMutation = usePublishTender();
  const deleteMutation = useDeleteTender();
  const cancelMutation = useCancelTender();
  const closeBiddingMutation = useCloseBiddingEarly(tender.id);

  const isBusy =
    publishMutation.isPending ||
    deleteMutation.isPending ||
    cancelMutation.isPending ||
    closeBiddingMutation.isPending;

  const submittedBidCount = tender.bidStats?.submitted ?? 0;

  const handleCloseBidding = async () => {
    try {
      await closeBiddingMutation.mutateAsync();
      toast.success("İhale erken kapatıldı, kazandırmaya başlayabilirsiniz");
      setCloseBiddingOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İhale kapatılamadı"));
    }
  };

  const invitedCount = tender.invitations.length;

  const handlePublish = async () => {
    try {
      const result = await publishMutation.mutateAsync(tender.id);
      const status = (result as { status?: string } | undefined)?.status;
      if (status === "IN_APPROVAL") {
        const apr = (result as { approvalNumber?: string }).approvalNumber;
        toast.success(
          `Onay sürecine alındı${apr ? ` — ${apr}` : ""}. Onaylandıktan sonra yayınlanacak.`,
        );
      } else {
        toast.success(
          `İhale yayınlandı: ${tender.tenderNumber} — tedarikçilere e-posta gönderiliyor`,
        );
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yayınlama başarısız"));
    } finally {
      setPublishOpen(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(tender.id);
      toast.success("Taslak silindi");
      router.push("/dashboard/ihaleler");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silme başarısız"));
      setDeleteOpen(false);
    }
  };

  const handleCancel = async (reason: string) => {
    try {
      await cancelMutation.mutateAsync({ id: tender.id, reason });
      toast.success("İhale iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal başarısız"));
    } finally {
      setCancelOpen(false);
    }
  };

  return (
    <>
      {!ownership.canAct && ownership.owner ? (
        <ReadOnlyBanner
          ownerName={`${ownership.owner.firstName} ${ownership.owner.lastName}`}
          context="tender"
        />
      ) : null}

      <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm text-brand-700 font-mono font-semibold">
                {tender.tenderNumber}
              </code>
              <TenderTypeBadge type={tender.type} />
              <TenderLiveStatusPill status={tender.status} />
              {tender.roundNumber > 1 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
                  Tur #{tender.roundNumber}
                </span>
              ) : null}
            </div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900 leading-tight">
              {tender.title}
            </h1>
            {tender.description ? (
              <p className="text-slate-600 leading-relaxed max-w-3xl">
                {tender.description}
              </p>
            ) : null}
            {tender.keywords && tender.keywords.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-slate-500 font-semibold">
                  Anahtar Kelimeler:
                </span>
                {tender.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex-shrink-0 md:text-right space-y-3">
            {tender.status === "OPEN_FOR_BIDS" ? (
              <div className="md:text-right space-y-2">
                <p className="text-xs text-slate-500">
                  Kalan Süre:{" "}
                  <CountdownFull deadline={tender.bidsCloseAt} />
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Kapanış:{" "}
                  {format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                </p>
                <div className="flex md:justify-end items-center gap-2 flex-wrap pt-1">
                  <EditTenderButton tender={tender} canEdit={canEdit} />
                  {canEdit ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setChangeTimeOpen(true)}
                      disabled={isBusy}
                      title="Kapanış zamanını değiştir veya ihaleyi hemen kapat"
                    >
                      <Clock className="w-4 h-4" />
                      Kapanış Zamanını Değiştir
                    </Button>
                  ) : null}
                  <SupplierActionsButton tenderId={tender.id} />
                  {canAward || canCancel ? (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger
                        className={MORE_TRIGGER_CLASSES}
                        disabled={isBusy}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                        Diğer İşlemler
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          className="w-64 bg-white rounded-xl border border-surface-border shadow-lg p-1.5 z-50"
                        >
                          {canAward ? (
                            <DropdownMenu.Item
                              className={MORE_ITEM_WARNING}
                              onSelect={() => setCloseBiddingOpen(true)}
                            >
                              <Timer className="w-4 h-4" />
                              Erken Kapat & Kazandırmaya Geç
                            </DropdownMenu.Item>
                          ) : null}
                          {canCancel ? (
                            <>
                              {canAward ? (
                                <DropdownMenu.Separator className="h-px bg-surface-border my-1" />
                              ) : null}
                              <DropdownMenu.Item
                                className={MORE_ITEM_DANGER}
                                onSelect={() => setCancelOpen(true)}
                              >
                                <Ban className="w-4 h-4" />
                                İhaleyi İptal Et
                              </DropdownMenu.Item>
                            </>
                          ) : null}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  ) : null}
                </div>
              </div>
            ) : tender.status === "IN_AWARD" ? (
              <div className="md:text-right space-y-2">
                <p className="text-[11px] text-slate-500">
                  Kapandı:{" "}
                  {format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                </p>
                {canAward || canCancel || canEdit ? (
                  <div className="flex md:justify-end items-center gap-2 flex-wrap">
                    <EditTenderButton tender={tender} canEdit={canEdit} />
                    {canEdit ? (
                      <Link
                        href={`/dashboard/ihaleler/${tender.id}/yeni-tur`}
                      >
                        <Button
                          variant="primary"
                          size="sm"
                          title="Aynı kalemler + tedarikçilerle yeni tur aç"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Yeni Tur Oluştur
                        </Button>
                      </Link>
                    ) : null}
                    {canAward ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAwardOpen(true)}
                        className="!text-purple-700 !border-purple-200 hover:!bg-purple-50"
                        title="Kalemlere/Tedarikçilere kazanan ata ve siparişleri oluştur"
                      >
                        <Award className="h-4 w-4" />
                        Kazananı Belirle
                      </Button>
                    ) : null}
                    <SupplierActionsButton tenderId={tender.id} />
                    {canCancel ? (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger
                          className={MORE_TRIGGER_CLASSES}
                          disabled={isBusy}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                          Diğer İşlemler
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={6}
                            className="w-64 bg-white rounded-xl border border-surface-border shadow-lg p-1.5 z-50"
                          >
                            <DropdownMenu.Item
                              className={cn(
                                MORE_ITEM_CLASSES,
                                "!text-warning-700 data-[highlighted]:!bg-warning-50",
                              )}
                              onSelect={() => setCloseNoAwardOpen(true)}
                            >
                              <Ban className="w-4 h-4" />
                              Kazanan Yok Kapat
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Kazandırma için gerekli yetkiniz yok.
                  </p>
                )}
              </div>
            ) : null}

            {/* DRAFT için aksiyonlar */}
            {tender.status === "DRAFT" && (canEdit || canPublish || canDelete) ? (
              <div className="flex md:justify-end items-center gap-2 flex-wrap">
                {canEdit ? (
                  <Link href={`/dashboard/ihaleler/${tender.id}/duzenle`}>
                    <Button variant="secondary" size="sm" disabled={isBusy}>
                      <Pencil className="w-4 h-4" />
                      Düzenle
                    </Button>
                  </Link>
                ) : null}
                {canPublish ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setPublishOpen(true)}
                    disabled={isBusy || invitedCount === 0}
                    className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
                    title={
                      invitedCount === 0
                        ? "Yayınlamak için en az 1 tedarikçi davet edilmelidir"
                        : undefined
                    }
                  >
                    <Send className="w-4 h-4" />
                    Yayınla
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    disabled={isBusy}
                    className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* E.7.D — IN_APPROVAL / IN_AWARD_APPROVAL banner */}
        {(tender.status === "IN_APPROVAL" ||
          tender.status === "IN_AWARD_APPROVAL") &&
        tender.activeApprovalRequest ? (
          <div className="mt-4 p-4 rounded-lg bg-warning-50 border border-warning-200">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-warning-600 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-warning-800 text-sm">
                  {tender.status === "IN_APPROVAL"
                    ? "Onay Bekliyor — yayın askıda"
                    : "Kazandırma Onayı Bekliyor"}
                </p>
                <p className="text-xs text-warning-700/90 mt-1 leading-relaxed">
                  {tender.status === "IN_APPROVAL"
                    ? "Bu ihale, onay süreci tamamlanana kadar yayınlanmayacak. Tüm onaycılar kararını verince davet e-postaları otomatik gönderilir."
                    : "Kazandırma kararlarınız onay sürecindedir. Tüm onaycılar kararını verince siparişler otomatik oluşturulur."}{" "}
                  Onay no:{" "}
                  <code className="font-mono font-semibold">
                    {tender.activeApprovalRequest.approvalNumber}
                  </code>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/onay-bekleyenler/${tender.activeApprovalRequest.id}`}
                  >
                    <Button variant="secondary" size="sm">
                      <ExternalLink className="w-4 h-4" />
                      Onay Sürecini Görüntüle
                    </Button>
                  </Link>
                  {isAdmin ||
                  tender.activeApprovalRequest.initiatedById === user?.id ? (
                    <Link
                      href={`/dashboard/onay-bekleyenler/${tender.activeApprovalRequest.id}`}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="!text-warning-700 hover:!bg-warning-100"
                      >
                        <Ban className="w-4 h-4" />
                        Onayı İptal Et
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* CANCELLED açıklaması */}
        {tender.status === "CANCELLED" && tender.cancelReason ? (
          <div className="mt-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-sm">
            <p className="text-danger-800 font-semibold mb-1">
              İptal Sebebi
            </p>
            <p className="text-danger-700">{tender.cancelReason}</p>
            {tender.cancelledAt ? (
              <p className="text-xs text-danger-600 mt-1">
                {format(new Date(tender.cancelledAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        invitedCount={invitedCount}
        isSubmitting={publishMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        isSubmitting={deleteMutation.isPending}
        tenderTitle={tender.title}
      />

      <CancelTenderDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        isSubmitting={cancelMutation.isPending}
        tenderTitle={tender.title}
      />

      <AwardWizardModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        tender={tender}
      />

      <CloseNoAwardDialog
        open={closeNoAwardOpen}
        onClose={() => setCloseNoAwardOpen(false)}
        tenderId={tender.id}
      />

      <CloseBiddingEarlyDialog
        open={closeBiddingOpen}
        onClose={() => setCloseBiddingOpen(false)}
        onConfirm={handleCloseBidding}
        isSubmitting={closeBiddingMutation.isPending}
        tenderTitle={tender.title}
        submittedBidCount={submittedBidCount}
      />

      <ChangeClosingTimeDialog
        open={changeTimeOpen}
        onClose={() => setChangeTimeOpen(false)}
        tenderId={tender.id}
        currentCloseAt={tender.bidsCloseAt}
      />
    </>
  );
}

function EditTenderButton({
  tender,
  canEdit,
}: {
  tender: TenderDetail;
  canEdit: boolean;
}) {
  if (!canEdit) return null;
  const editable = tender.status === "DRAFT";
  if (editable) {
    return (
      <Link href={`/dashboard/ihaleler/${tender.id}/duzenle`}>
        <Button variant="secondary" size="sm">
          <Pencil className="w-4 h-4" />
          İhaleyi Düzenle
        </Button>
      </Link>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled
      title="Sadece taslak ihaleler düzenlenebilir"
    >
      <Pencil className="w-4 h-4" />
      İhaleyi Düzenle
    </Button>
  );
}

function SupplierActionsButton({ tenderId }: { tenderId: string }) {
  return (
    <Link href={`/dashboard/ihaleler/${tenderId}?tab=invitations`} scroll={false}>
      <Button
        variant="secondary"
        size="sm"
        title="Davetli tedarikçileri görüntüle ve yönet"
      >
        <Users className="w-4 h-4" />
        Tedarikçi İşlemleri
      </Button>
    </Link>
  );
}
