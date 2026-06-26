"use client";

import { Button } from "@/components/catalyst/button";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useFileComplaint,
  useMyComplaints,
} from "@/hooks/use-company-complaints";
import {
  useBlockCompany,
  useBlocks,
  useConnections,
  useIncomingInvites,
  useInviteConnection,
  useRespondInvite,
  useUnblockCompany,
} from "@/hooks/use-company-connections";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

export function ConnectionsView() {
  const { company } = useCompanyAuth();
  const connections = useConnections();
  const incoming = useIncomingInvites();
  const invite = useInviteConnection();
  const respond = useRespondInvite();
  const blocks = useBlocks();
  const blockCompany = useBlockCompany();
  const unblockCompany = useUnblockCompany();
  const myComplaints = useMyComplaints();
  const fileComplaint = useFileComplaint();
  const [code, setCode] = useState("");
  const [blockCode, setBlockCode] = useState("");
  const [cmpCode, setCmpCode] = useState("");
  const [cmpReason, setCmpReason] = useState("");
  const [cmpDetail, setCmpDetail] = useState("");
  const [connSearch, setConnSearch] = useState("");

  const filteredConnections = (connections.data ?? []).filter((c) => {
    const q = connSearch.trim().toLocaleLowerCase("tr");
    if (!q) return true;
    return (
      c.company.name.toLocaleLowerCase("tr").includes(q) ||
      (c.company.supkeysId ?? "").toLocaleLowerCase("tr").includes(q)
    );
  });

  const handleComplaint = async () => {
    if (cmpCode.trim().length < 4 || cmpReason.trim().length < 3) return;
    try {
      await fileComplaint.mutateAsync({
        supkeysId: cmpCode.trim(),
        reason: cmpReason.trim(),
        detail: cmpDetail.trim() || undefined,
      });
      toast.success("Şikayet gönderildi — admin inceleyecek");
      setCmpCode("");
      setCmpReason("");
      setCmpDetail("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  const handleBlock = async () => {
    if (blockCode.trim().length < 4) return;
    try {
      const res = await blockCompany.mutateAsync(blockCode.trim());
      toast.success(`"${res.name}" engellendi`);
      setBlockCode("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const handleUnblock = async (companyId: string) => {
    try {
      await unblockCompany.mutateAsync(companyId);
      toast.success("Engel kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleInvite = async () => {
    if (code.trim().length < 4) return;
    try {
      const res = await invite.mutateAsync(code.trim());
      toast.success(`"${res.targetName}" firmasına davet gönderildi`);
      setCode("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  const handleRespond = async (
    connectionId: string,
    action: "accept" | "reject",
  ) => {
    try {
      await respond.mutateAsync({ connectionId, action });
      toast.success(action === "accept" ? "Bağlantı kuruldu" : "Davet reddedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Heading>Bağlantılar</Heading>

      {/* Firma kodu */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Firma kodun</Subheading>
        <Text className="mt-1 text-sm">
          Bu kodu paylaş; karşı firma seni bu kodla davet edebilir.
        </Text>
        <div className="mt-3 inline-flex items-center rounded-lg bg-zinc-100 px-4 py-2 font-mono text-lg font-semibold tracking-wider text-zinc-900">
          {company?.supkeysId ?? "—"}
        </div>
      </section>

      {/* Davet gönder */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Bağlantı daveti gönder</Subheading>
        <Text className="mt-1 text-sm">
          Karşı firmanın kodunu gir (XXXX-XXXX). Kabul ederlerse bağlanırsınız.
        </Text>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ör. K7X9-3M2P"
            className="max-w-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInvite();
            }}
          />
          <Button onClick={handleInvite} disabled={invite.isPending}>
            Davet Gönder
          </Button>
        </div>
      </section>

      {/* Gelen davetler */}
      {incoming.data && incoming.data.length > 0 ? (
        <section className="space-y-3">
          <Subheading>Gelen davetler</Subheading>
          {incoming.data.map((inv) => (
            <div
              key={inv.connectionId}
              className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">
                  {inv.company.name}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {inv.company.supkeysId}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleRespond(inv.connectionId, "accept")}
                  disabled={respond.isPending}
                >
                  Kabul Et
                </Button>
                <Button
                  plain
                  onClick={() => handleRespond(inv.connectionId, "reject")}
                  disabled={respond.isPending}
                >
                  Reddet
                </Button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Aktif bağlantılar */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Subheading>Bağlantıların</Subheading>
          {connections.data && connections.data.length > 0 ? (
            <Input
              value={connSearch}
              onChange={(e) => setConnSearch(e.target.value)}
              placeholder="Bağlantı ara…"
              className="max-w-xs"
            />
          ) : null}
        </div>
        {connections.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !connections.data || connections.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
            <Text className="text-sm text-zinc-500">
              Henüz bağlantın yok. Yukarıdan bir firma kodu ile davet gönder.
            </Text>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
            <Text className="text-sm text-zinc-500">
              "{connSearch}" ile eşleşen bağlantı yok.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConnections.map((c) => (
              <div
                key={c.connectionId}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {c.company.name}
                  </div>
                  <div className="font-mono text-xs text-zinc-500">
                    {c.company.supkeysId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Engelleme */}
      <section className="space-y-3 border-t border-zinc-100 pt-6">
        <Subheading>Engelleme</Subheading>
        <Text className="text-sm">
          Engellediğin firma seni hiçbir aramada/keşfette bulamaz; sen de onu
          göremezsin. İstediğinde kaldırabilirsin.
        </Text>
        <div className="flex gap-2">
          <Input
            value={blockCode}
            onChange={(e) => setBlockCode(e.target.value)}
            placeholder="Firma kodu (XXXX-XXXX)"
            className="max-w-xs font-mono"
          />
          <Button
            outline
            onClick={handleBlock}
            disabled={blockCompany.isPending}
          >
            Engelle
          </Button>
        </div>

        {blocks.data && blocks.data.length > 0 ? (
          <div className="space-y-2 pt-2">
            {blocks.data.map((b) => (
              <div
                key={b.company.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {b.company.name}
                  </div>
                  <div className="font-mono text-xs text-zinc-500">
                    {b.company.supkeysId}
                  </div>
                </div>
                <Button
                  plain
                  onClick={() => handleUnblock(b.company.id)}
                  disabled={unblockCompany.isPending}
                >
                  Engeli Kaldır
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Şikayet */}
      <section className="space-y-3 border-t border-zinc-100 pt-6">
        <Subheading>Şikayet</Subheading>
        <Text className="text-sm">
          Bir firmayı kurallara aykırı davranış için şikayet et. Şikayetler
          admin tarafından incelenir; çok şikayet alan firma askıya alınabilir.
        </Text>
        <div className="space-y-2">
          <Input
            value={cmpCode}
            onChange={(e) => setCmpCode(e.target.value)}
            placeholder="Firma kodu (XXXX-XXXX)"
            className="max-w-xs font-mono"
          />
          <Input
            value={cmpReason}
            onChange={(e) => setCmpReason(e.target.value)}
            placeholder="Konu (örn. Teslimat yapmadı)"
            className="max-w-md"
          />
          <Input
            value={cmpDetail}
            onChange={(e) => setCmpDetail(e.target.value)}
            placeholder="Açıklama (opsiyonel)"
            className="max-w-md"
          />
          <Button
            outline
            onClick={handleComplaint}
            disabled={
              fileComplaint.isPending ||
              cmpCode.trim().length < 4 ||
              cmpReason.trim().length < 3
            }
          >
            Şikayet Gönder
          </Button>
        </div>

        {myComplaints.data && myComplaints.data.length > 0 ? (
          <div className="space-y-2 pt-2">
            {myComplaints.data.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900">
                    {c.against.name}
                  </div>
                  <div className="text-xs text-zinc-500">{c.reason}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.status === "OPEN"
                      ? "bg-amber-100 text-amber-700"
                      : c.status === "RESOLVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {c.status === "OPEN"
                    ? "İnceleniyor"
                    : c.status === "RESOLVED"
                      ? "Çözüldü"
                      : "Reddedildi"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
