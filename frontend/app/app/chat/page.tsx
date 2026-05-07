import { redirect } from "next/navigation";
import ChatScreen from "@/components/chat-screen";
import { getCurrentUserServer } from "@/lib/server-auth";

export default async function ChatPage() {
  const auth = await getCurrentUserServer();
  if (!auth) {
    redirect("/login");
  }
  return <ChatScreen />;
}
