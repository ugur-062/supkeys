"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useDiscover,
  useInviteConnection,
} from "@/hooks/use-company-connections";
import { extractErrorMessage } from "@/lib/tenders/error";
import Link from "next/link";
import { toast } from "sonner";

export default function KesfetPage() {
  const { data, isLoading } = useDiscover();
  const invite = useInviteConnection();

  const handleConnect = async (supkeysId: string | null, name: string) => {
    if (!supkeysId) return;
    try {
      await invite.mutateAsync(supkeysId);
      toast.success(`"${name}" firmasına davet gönderildi`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading>Keşfet</Heading>

      {isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : data?.locked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <Text className="text-sm text-amber-800">
            Firma keşfi <strong>Tek Paket (premium)</strong> üyeliğe özeldir.
            Yükselterek tüm firmaları kategori-eşleşmesine göre keşfet, bağlantı
            kur, herkese açık ilanlara teklif ver.
          </Text>
        </div>
      ) : !data || data.companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">
            Şu an keşfedilecek (bağlı olmadığın) firma yok. Firmalar arttıkça
            kategorine uygun olanlar burada çıkar.
          </Text>
        </div>
      ) : (
        <div className="space-y-2">
          {data.companies.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-900">
                    {c.name}
                  </span>
                  {c.matchScore > 0 ? (
                    <Badge color="green">{c.matchScore} eşleşme</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-zinc-500">
                  {c.industry ?? "—"} ·{" "}
                  <span className="font-mono">{c.supkeysId}</span>
                </div>
              </div>
              <Button
                outline
                onClick={() => handleConnect(c.supkeysId, c.name)}
                disabled={invite.isPending}
              >
                Bağlan
              </Button>
            </div>
          ))}
        </div>
      )}

      <Text className="text-xs text-zinc-400">
        Bağlandığın firmaları{" "}
        <Link
          href="/company/baglantilar"
          className="text-blue-600 hover:underline"
        >
          Bağlantılar
        </Link>{" "}
        sayfasında yönetebilirsin.
      </Text>
    </div>
  );
}
