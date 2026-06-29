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
import { toast } from "sonner";

export default function CompanyProfilePage() {
  const params = useParams<{ id: string }>();
  const supkeysId = params.id;
  const { data, isLoading } = useCompanyProfile(supkeysId);
  const invite = useInviteConnection();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const disconnect = useDisconnect();

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
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
    if (!p.supkeysId) return;
    try {
      await invite.mutateAsync(p.supkeysId);
      toast.success("Bağlantı isteği gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İstek gönderilemedi"));
    }
  };

  const handleBlock = async () => {
    if (!p.supkeysId) return;
    if (!confirm(`"${p.name}" engellensin mi?`)) return;
    try {
      await block.mutateAsync(p.supkeysId);
      toast.success("Firma engellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    if (!confirm(`"${p.name}" ile bağlantınızı kaldırmak istiyor musunuz?`))
      return;
    try {
      await disconnect.mutateAsync(connectionId);
      toast.success("Bağlantı kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Bağlantı kaldırılamadı"));
    }
  };

  const handleComplaint = async () => {
    if (!p.supkeysId) return;
    const reason = window.prompt("Şikayet konusu:");
    if (!reason || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({
        supkeysId: p.supkeysId,
        reason: reason.trim(),
      });
      toast.success("Şikayet gönderildi");
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
            <DropdownItem onClick={handleBlock}>
              <Ban data-slot="icon" />
              Engelle
            </DropdownItem>
            <DropdownItem onClick={handleComplaint}>
              <Flag data-slot="icon" />
              Şikayet Et
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      ) : null}
    </>
  );

  const tenders = (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Açık İhaleleri</h2>
        {!connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
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
                `/company/firma/${supkeysId}`,
              )}&fromLabel=${encodeURIComponent(p.name)}`}
              className="block rounded-xl border border-zinc-950/10 p-3 transition hover:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-zinc-400">
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
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink />
      <CompanyProfileView profile={p} actions={actions}>
        {tenders}
      </CompanyProfileView>
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
