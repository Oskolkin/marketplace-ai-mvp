import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function HomePage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  redirect("/app");
}
