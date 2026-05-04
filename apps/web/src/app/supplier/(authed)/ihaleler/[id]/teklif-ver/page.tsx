import { TeklifLoader } from "./_components/teklif-loader";

export const metadata = {
  title: "Teklif Ver — Supkeys",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeklifVerPage({ params }: Props) {
  const { id } = await params;
  return <TeklifLoader id={id} />;
}
