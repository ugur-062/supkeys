import { Suspense } from "react";
import { OnayDetayLoader } from "./_components/onay-detay-loader";

export const metadata = {
  title: "Onay Süreci — Rothern",
};

export default async function OnayDetayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <OnayDetayLoader id={id} />
    </Suspense>
  );
}
