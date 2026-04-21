import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";
import DashboardScreen from "@/components/dashboard-screen";

type DashboardPageProps = {
  searchParams?: Promise<{ as_of_date?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : undefined;
  const asOfDate = params?.as_of_date;

  return <DashboardScreen initialAsOfDate={asOfDate} />;
}
