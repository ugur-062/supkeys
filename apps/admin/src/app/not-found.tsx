import Link from "next/link";

/** Admin 404. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-5xl font-semibold tracking-tight text-admin-text">
          404
        </p>
        <p className="text-sm text-admin-text-muted">
          Aradığınız sayfa bulunamadı.
        </p>
        <Link
          href="/admin/dashboard"
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Panele dön
        </Link>
      </div>
    </div>
  );
}
