import { NewRoundView } from "./_components/new-round-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

// V2-7 — Yeni Tur Oluştur sayfası. Önceki tender'dan türetilen yeni round.
export default async function YeniTurPage({ params }: PageProps) {
  const { id } = await params;
  return <NewRoundView previousTenderId={id} />;
}
