import { redirect } from "next/navigation";
import { getPostLoginPath } from "@/lib/auth-redirect";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function HomePage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }

  const path = getPostLoginPath(auth);
  redirect(path ?? "/login");
}
