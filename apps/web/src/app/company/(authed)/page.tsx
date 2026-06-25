"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useInbox } from "@/hooks/use-company-inbox";
import Link from "next/link";

const ROLE_LABEL: Record<string, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

export default function IslerimPage() {
  const { user, company } = useCompanyAuth();
  const { data: items, isLoading } = useInbox();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Heading>İşlerim</Heading>
        <Text className="mt-1">
          Hoş geldin{user ? `, ${user.firstName}` : ""}. Dikkat bekleyen tüm
          işlerin burada — alım ve satım, tek akışta.
        </Text>
      </div>

      {/* Firma özeti */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Subheading>{company?.name ?? "—"}</Subheading>
            <Text className="mt-1 text-sm">
              {company?.companyVerificationStatus === "VERIFIED"
                ? "Doğrulanmış firma"
                : "Doğrulama bekliyor"}
            </Text>
          </div>
          <Badge color={company?.tier === "PAKET" ? "amber" : "zinc"}>
            {company?.tier === "PAKET" ? "Tek Paket" : "Standart"}
          </Badge>
        </div>
        {user ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {user.roles.map((r) => (
              <Badge key={r} color="blue">
                {ROLE_LABEL[r] ?? r}
              </Badge>
            ))}
            {user.isOwner ? <Badge color="amber">Firma Sahibi</Badge> : null}
          </div>
        ) : null}
      </section>

      {/* Aksiyon akışı */}
      <section className="space-y-3">
        <Subheading>Dikkat bekleyenler</Subheading>
        {isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !items || items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
            <Text className="text-sm text-zinc-500">
              Şu an bekleyen işin yok. 🎉 İlan açabilir, firmalarla bağlanabilir
              veya gelen teklifleri bekleyebilirsin.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div
                key={`${it.kind}-${i}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-lg">{it.emoji}</span>
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {it.title}
                  </span>
                </div>
                <Link href={it.href}>
                  <Button outline>{it.actionLabel}</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
