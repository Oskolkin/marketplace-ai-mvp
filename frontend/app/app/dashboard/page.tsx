import DashboardScreen from "@/components/dashboard-screen";

type DashboardPageProps = {
  searchParams?: Promise<{ as_of_date?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const asOfDate = params?.as_of_date;

  return <DashboardScreen initialAsOfDate={asOfDate} />;
}
