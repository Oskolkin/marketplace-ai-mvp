import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";
import OzonOnboarding from "@/components/ozon-onboarding";

export default async function OzonIntegrationPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  return (
    <main className="p-6">
      <h1 className="mb-6 text-2xl font-semibold">Ozon onboarding</h1>
      <OzonOnboarding />
    </main>
  );
}