import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "STAAD Online",
  description:
    "Open a STAAD .std file and inspect the analytical model — parsed entirely in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
