import "./globals.css";
import type { Metadata } from "next";
import { SentryInit } from "@/components/sentry-init";

export const metadata: Metadata = {
  title: "Marketplace AI MVP",
  description: "Frontend skeleton for marketplace AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SentryInit />
        {children}
      </body>
    </html>
  );
}