"use client";

import { Heading } from "@/components/catalyst/heading";
import { PublicProfileForm } from "@/components/company/public-profile-form";

export default function SatinalmaProfilimPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Heading>Profilim</Heading>
      <PublicProfileForm />
    </div>
  );
}
