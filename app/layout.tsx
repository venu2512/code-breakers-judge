import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Breakers Judge",
  description: "Offline contest judge for the Code Breakers lab event",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
