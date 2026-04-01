import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "V-Link",
  description: "VAS workflow management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <a className="app-brand" href="/">
              V-Link
            </a>
            <nav className="app-nav">
              <a href="/login">Login</a>
              <a href="/signup">Signup</a>
              <a href="/admin/requests">Admin</a>
              <a href="/requester">Requester</a>
              <a href="/dashboard">Dashboard</a>
              <a href="/calendar">Calendar</a>
              <a href="/vendor">Vendor</a>
            </nav>
          </header>
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
