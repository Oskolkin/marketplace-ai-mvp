import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AppPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">App</h1>
      <p className="mb-2">You are authenticated.</p>
      <p>Email: {auth.user.email}</p>
      <p>Seller account: {auth.seller_account.name}</p>
    </main>
  );
}