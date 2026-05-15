import "./globals.css";
import type { Metadata } from "next";
import { SentryInit } from "@/components/sentry-init";

export const metadata: Metadata = {
  title: "Marketplace AI — MVP",
  description: "Ассистент для продавцов маркетплейсов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
