"use client";

import { Button } from "@/components/catalyst/button";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useConnections,
  useIncomingInvites,
  useInviteConnection,
  useRespondInvite,
} from "@/hooks/use-company-connections";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

export default function BaglantilarPage() {
  const { company } = useCompanyAuth();
  const connections = useConnections();
  const incoming = useIncomingInvites();
  const invite = useInviteConnection();
  const respond = useRespondInvite();
  const [code, setCode] = useState("");

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
        <Subheading>Bağlantıların</Subheading>
        {connections.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !connections.data || connections.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
            <Text className="text-sm text-zinc-500">
              Henüz bağlantın yok. Yukarıdan bir firma kodu ile davet gönder.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.data.map((c) => (
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
    </div>
  );
}
