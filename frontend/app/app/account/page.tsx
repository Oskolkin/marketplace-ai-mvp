import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUserServer } from "@/lib/server-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8081";

type AccountResponse = {
  id: number;
  name: string;
  status: string;
};

export default async function AccountPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${API_BASE_URL}/api/v1/account`, {
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load account");
  }

  const account = (await res.json()) as AccountResponse;

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Seller account</h1>
      <p>ID: {account.id}</p>
      <p>Name: {account.name}</p>
      <p>Status: {account.status}</p>
    </main>
  );
}