import { Suspense } from "react";
import { YeniIhaleRouter } from "./_components/yeni-router";

export const metadata = {
  title: "Yeni İhale — Supkeys",
};

export default function YeniIhalePage() {
  return (
    <Suspense fallback={null}>
      <YeniIhaleRouter />
    </Suspense>
  );
}
