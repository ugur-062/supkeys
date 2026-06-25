import { Suspense } from "react";
import { IhalelerView } from "./_components/ihaleler-view";

export const metadata = {
  title: "İhaleler — Rothern",
};

export default function IhalelerPage() {
  return (
    <Suspense fallback={null}>
      <IhalelerView />
    </Suspense>
  );
}
