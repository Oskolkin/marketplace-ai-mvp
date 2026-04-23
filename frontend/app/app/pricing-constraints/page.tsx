import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";
import PricingConstraintsScreen from "@/components/pricing-constraints-screen";

export default async function PricingConstraintsPage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  return <PricingConstraintsScreen />;
}
