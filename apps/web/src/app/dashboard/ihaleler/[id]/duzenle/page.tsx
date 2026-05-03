import { EditLoader } from "./_components/edit-loader";

export const metadata = {
  title: "İhaleyi Düzenle — Supkeys",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TenderEditPage({ params }: Props) {
  const { id } = await params;
  return <EditLoader id={id} />;
}
