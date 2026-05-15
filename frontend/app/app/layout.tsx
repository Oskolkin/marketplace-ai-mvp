import { redirect } from "next/navigation";
import AppAuthRedirect from "@/components/app-auth-redirect";
import AppShell from "@/components/app-shell";
import { isAdminOnlyUser } from "@/lib/auth-redirect";
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

  const adminOnly = isAdminOnlyUser(auth);

  return (
    <>
      <AppAuthRedirect isAdminOnly={adminOnly} />
      <AppShell
        userEmail={auth.user.email}
        sellerAccountName={auth.seller_account?.name ?? null}
        isAdminOnly={adminOnly}
        isAdmin={auth.is_admin}
      >
        {children}
      </AppShell>
    </>
  );
}
