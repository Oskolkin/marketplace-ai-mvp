import { notFound, redirect } from "next/navigation";
import AdminClientDetailScreen from "@/components/admin-client-detail-screen";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AdminClientPage({ params }: { params: { id: string } }) {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  const sellerAccountId = Number(params.id);
  if (!Number.isFinite(sellerAccountId) || sellerAccountId <= 0) {
    notFound();
  }
  return <AdminClientDetailScreen sellerAccountId={sellerAccountId} />;
}
