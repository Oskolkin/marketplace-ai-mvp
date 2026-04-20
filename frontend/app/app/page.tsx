import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AppPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="mb-4 text-2xl font-semibold">App</h1>
        <p className="mb-2">You are authenticated.</p>
        <p>Email: {auth.user.email}</p>
        <p>Seller account: {auth.seller_account.name}</p>
      </div>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Technical screens</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/app/sync-status"
            className="rounded border px-4 py-2 hover:bg-gray-50"
          >
            Open sync status
          </Link>

          <Link
            href="/app/account"
            className="rounded border px-4 py-2 hover:bg-gray-50"
          >
            Open account
          </Link>
        </div>
      </section>
    </main>
  );
}