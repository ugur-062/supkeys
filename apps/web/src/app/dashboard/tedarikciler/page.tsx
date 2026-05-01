import { Suspense } from "react";
import { TedarikcilerView } from "./_components/tedarikciler-view";

export const metadata = {
  title: "Tedarikçiler — Supkeys",
};

export default function TedarikcilerPage() {
  return (
    <Suspense fallback={null}>
      <TedarikcilerView />
    </Suspense>
  );
}
