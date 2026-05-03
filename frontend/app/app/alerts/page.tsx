import { redirect } from "next/navigation";
import AlertsScreen from "@/components/alerts-screen";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AlertsPage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  return <AlertsScreen />;
}
