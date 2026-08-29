import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Users",
  description: "Users list from JSONPlaceholder",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
