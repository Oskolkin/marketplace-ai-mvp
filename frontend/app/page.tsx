import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUserServer } from "@/lib/server-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8081";

type OzonConnectionResponse = {
  connection: {
    id: number;
    seller_account_id: number;
    status: string;
    last_check_at: string | null;
    last_check_result: string | null;
    last_error: string | null;
    has_credentials: boolean;
    client_id_masked: string;
  } | null;
};

export default async function OzonIntegrationPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${API_BASE_URL}/api/v1/integrations/ozon/`, {
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load ozon connection");
  }

  const data = (await res.json()) as OzonConnectionResponse;

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Ozon integration</h1>

      {!data.connection ? (
        <p>No Ozon connection yet.</p>
      ) : (
        <div className="space-y-2">
          <p>Connection ID: {data.connection.id}</p>
          <p>Status: {data.connection.status}</p>
          <p>Client ID: {data.connection.client_id_masked}</p>
          <p>
            Last check result: {data.connection.last_check_result ?? "—"}
          </p>
          <p>Last error: {data.connection.last_error ?? "—"}</p>
        </div>
      )}
    </main>
  );
}