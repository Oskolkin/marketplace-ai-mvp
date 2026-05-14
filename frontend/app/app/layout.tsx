import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function AppSectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }

  return (
    <AppShell userEmail={auth.user.email} sellerAccountName={auth.seller_account.name}>
      {children}
    </AppShell>
  );
}
