import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";
import SyncStatusScreen from "@/components/sync-status-screen";

export default async function SyncStatusPage() {
  const auth = await getCurrentUserServer();

  if (!auth) {
    redirect("/login");
  }

  return <SyncStatusScreen />;
}