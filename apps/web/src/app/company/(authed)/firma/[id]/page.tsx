"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Text } from "@/components/catalyst/text";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import {
  useBlockCompany,
  useDisconnect,
  useInviteConnection,
} from "@/hooks/use-company-connections";
import { useFileComplaint } from "@/hooks/use-company-complaints";
import { useCompanyProfile } from "@/hooks/use-company-directory";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowLeft, Ban, Flag, Lock, MoreVertical, Unlink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function CompanyProfilePage() {
  const params = useParams<{ id: string }>();
  const rothernId = params.id;
  const { data, isLoading } = useCompanyProfile(rothernId);
  const invite = useInviteConnection();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const disconnect = useDisconnect();
  const confirmDialog = useConfirm();
  const [blockOpen, setBlockOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <Text className="mt-6 text-sm text-zinc-500">
          Firma profili bulunamadı.
        </Text>
      </div>
    );
  }

  const { profile: p, connectionStatus, connectionId, connected, listings } =
    data;

  const handleConnect = async () => {
    if (!p.rothernId) return;
    try {
      await invite.mutateAsync(p.rothernId);
      toast.success("Bağlantı isteği gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İstek gönderilemedi"));
    }
  };

  const submitBlock = async (reason: string) => {
    if (!p.rothernId) return;
    try {
      await block.mutateAsync({
        rothernId: p.rothernId,
        reason: reason.trim() || undefined,
      });
      toast.success("Firma engellendi");
      setBlockOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    const ok = await confirmDialog({
      title: "Bağlantı kaldırılsın mı?",
      description: `"${p.name}" ile bağlantınız kaldırılacak; davetli ihalelerini artık göremezsiniz.`,
      confirmLabel: "Kaldır",
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync(connectionId);
      toast.success("Bağlantı kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Bağlantı kaldırılamadı"));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!p.rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({
        rothernId: p.rothernId,
        reason: reason.trim(),
      });
      toast.success("Şikayet gönderildi");
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  const actions = (
    <>
      {connectionStatus === "active" ? (
        <Badge color="green">Bağlısınız</Badge>
      ) : connectionStatus === "pending" ? (
        <Badge color="amber">İstek gönderildi</Badge>
      ) : connectionStatus === "incoming" ? (
        <Button href="/company/satinalma/tedarikcilerim" outline>
          Sana istek gönderdi — Yanıtla
        </Button>
      ) : connectionStatus === "none" ? (
        <Button onClick={handleConnect} disabled={invite.isPending}>
          Bağlantı İsteği Gönder
        </Button>
      ) : null}

      {connectionStatus !== "self" ? (
        <Dropdown>
          <DropdownButton plain aria-label="Daha fazla">
            <MoreVertical className="h-5 w-5" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {connectionStatus === "active" ? (
              <DropdownItem
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                <Unlink data-slot="icon" />
                Bağlantıyı Kaldır
              </DropdownItem>
            ) : null}
            <DropdownItem
              onClick={() => setBlockOpen(true)}
              disabled={block.isPending}
            >
              <Ban data-slot="icon" />
              Engelle
            </DropdownItem>
            <DropdownItem
              onClick={() => setComplaintOpen(true)}
              disabled={complaint.isPending}
            >
              <Flag data-slot="icon" />
              Şikayet Et
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      ) : null}
    </>
  );

  const tenders = (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Açık İhaleleri</h2>
        {!connected ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <Lock className="h-3.5 w-3.5" />
            Sadece herkese açık
          </span>
        ) : null}
      </div>

      {!connected ? (
        <Text className="mt-1 text-xs text-zinc-500">
          Bağlanırsanız bu firmanın davetli ihalelerini de görürsünüz.
        </Text>
      ) : null}

      {listings.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
          Şu an açık ihale yok.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/company/ilan/${l.id}?from=${encodeURIComponent(
                `/company/firma/${rothernId}`,
              )}&fromLabel=${encodeURIComponent(p.name)}`}
              className="block rounded-xl border border-zinc-950/10 p-3 transition hover:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="tabular-nums text-xs text-zinc-400">
                    {l.number ?? "—"}
                  </div>
                  <div className="mt-0.5 truncate font-medium text-zinc-950">
                    {l.title}
                  </div>
                </div>
                <TenderTypeBadge format={l.format} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {format(new Date(l.createdAt), "d MMM yyyy", { locale: tr })}
                </span>
                <TenderStatusBadge status={l.status as "OPEN"} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <BackLink />
      <CompanyProfileView profile={p} actions={actions}>
        {tenders}
      </CompanyProfileView>

      <ReasonDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onSubmit={submitBlock}
        title="Firmayı Engelle"
        description={`"${p.name}" sizi göremez ve sizinle işlem yapamaz; mevcut bağlantı kaldırılır. Gerekçe kayda geçer.`}
        confirmLabel="Engelle"
        destructive
        pending={block.isPending}
      />
      <ReasonDialog
        open={complaintOpen}
        onClose={() => setComplaintOpen(false)}
        onSubmit={submitComplaint}
        title="Şikayet Et"
        description={`"${p.name}" hakkındaki şikayetiniz platform yönetimine iletilir.`}
        confirmLabel="Şikayeti Gönder"
        minLength={3}
        destructive
        pending={complaint.isPending}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/company/satinalma/tedarikcilerim"
      className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
    >
      <ArrowLeft className="h-4 w-4" />
      Bağlantılar
    </Link>
  );
}
