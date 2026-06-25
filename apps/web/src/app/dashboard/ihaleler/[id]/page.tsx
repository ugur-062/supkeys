import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { TenderDetailView } from "./_components/tender-detail-view";

export const metadata = {
  title: "İhale Detayı — Rothern",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TenderDetailPage({ params }: Props) {
  const { id } = await params;
  // useSearchParams ihtiyacı için Suspense — Next 15 client-component contract.
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-16 flex flex-col items-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <TenderDetailView id={id} />
    </Suspense>
  );
}
