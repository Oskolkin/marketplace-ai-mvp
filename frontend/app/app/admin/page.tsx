import { redirect } from "next/navigation";
import AdminScreen from "@/components/admin-screen";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AdminPage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  return <AdminScreen />;
}
