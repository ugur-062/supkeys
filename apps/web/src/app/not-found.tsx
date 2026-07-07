import Link from "next/link";

/** Global 404 — eşleşmeyen rota veya notFound() çağrısı. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-5xl font-semibold tracking-tight text-zinc-900">
          404
        </p>
        <p className="text-sm text-zinc-500">
          Aradığınız sayfa bulunamadı ya da taşınmış olabilir.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
