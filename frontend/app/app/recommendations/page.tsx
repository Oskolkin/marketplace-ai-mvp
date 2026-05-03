import { redirect } from "next/navigation";
import RecommendationsScreen from "@/components/recommendations-screen";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function RecommendationsPage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  return <RecommendationsScreen />;
}
