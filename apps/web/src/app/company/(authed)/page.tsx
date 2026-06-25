"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useMyListings } from "@/hooks/use-company-listings";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";

const ROLE_LABEL: Record<string, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

export default function IslerimPage() {
  const { user, company } = useCompanyAuth();
  const { data: listings } = useMyListings();
  const recent = (listings ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Heading>İşlerim</Heading>
        <Text className="mt-1">
          Hoş geldin{user ? `, ${user.firstName}` : ""}. Dikkat bekleyen tüm
          işlerin burada toplanacak — alım ve satım, tek akışta.
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

      {/* Son ilanlar */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Subheading>Son ilanların</Subheading>
          <Link
            href="/company/ilanlar"
            className="text-sm text-blue-600 hover:underline"
          >
            Tümü →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
            <Text className="text-sm text-zinc-500">
              Henüz işin yok.{" "}
              <Link href="/company/ilanlar" className="text-blue-600 hover:underline">
                İlanlar
              </Link>{" "}
              sayfasından bir <span className="text-blue-600">🔵 alım</span> veya{" "}
              <span className="text-emerald-600">🟢 satış</span> ilanı aç.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
              >
                <Badge color={l.type === "ALIM" ? "blue" : "emerald"}>
                  {l.type === "ALIM" ? "🔵 Alım" : "🟢 Satış"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {l.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {format(new Date(l.createdAt), "dd MMM yyyy HH:mm", {
                      locale: tr,
                    })}
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
