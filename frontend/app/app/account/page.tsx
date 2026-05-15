import { cookies } from "next/headers";
import { PUBLIC_API_BASE_URL } from "@/lib/env/api-base-url";
import { statusLabelRu } from "@/lib/status-labels";

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
    throw new Error("Не удалось загрузить аккаунт");
  }

  const account = (await res.json()) as AccountResponse;

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Аккаунт продавца</h1>
      <p>ID: {account.id}</p>
      <p>Название: {account.name}</p>
      <p>Статус: {statusLabelRu(account.status)}</p>
    </main>
  );
}
