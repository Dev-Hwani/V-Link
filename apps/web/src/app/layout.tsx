import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppNav } from "../components/app-nav";

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
          <aside className="app-sidebar">
            <a className="app-brand" href="/">
              V-Link
            </a>
            <AppNav />
          </aside>
          <main className="app-main">
            <div className="app-content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
