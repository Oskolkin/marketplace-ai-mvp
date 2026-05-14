import { cookies } from "next/headers";
import { PUBLIC_API_BASE_URL } from "@/lib/env/api-base-url";

type AccountResponse = {
  id: number;
  name: string;
  status: string;
};

export default async function AccountPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/account`, {
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