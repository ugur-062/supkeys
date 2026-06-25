"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";

const ROLE_LABEL: Record<string, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

export default function IslerimPage() {
  const { user, company } = useCompanyAuth();

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

      {/* Aksiyon akışı — placeholder */}
      <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
        <Text className="text-sm text-zinc-500">
          Henüz işin yok. İlan, teklif ve siparişler eklendikçe burada{" "}
          <span className="text-blue-600">🔵 aldığın</span> ve{" "}
          <span className="text-emerald-600">🟢 sattığın</span> işler tek
          listede, etiketli olarak görünecek.
        </Text>
      </section>
    </div>
  );
}
