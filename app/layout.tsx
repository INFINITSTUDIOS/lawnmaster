import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LawnMaster",
  description: "Run your lawn care business: service areas, schedules and subscriptions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
