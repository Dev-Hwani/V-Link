"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { clearSession, getSession, type SessionData } from "../lib/session";
import { roleLabel } from "../lib/display";

export function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    const syncSession = () => setSession(getSession());
    syncSession();

    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    setSession(getSession());
  }, [pathname]);

  function onLogout() {
    clearSession();
    setSession(null);
    router.push("/login");
    router.refresh();
  }

  function isActive(path: string) {
    if (path === "/") {
      return pathname === "/";
    }

    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const roleMenus: Array<{ href: string; label: string }> =
    session?.user.role === "ADMIN"
      ? [
          { href: "/admin/requests", label: "작업" },
          { href: "/dashboard", label: "대시보드" },
          { href: "/calendar", label: "캘린더" },
        ]
      : session?.user.role === "REQUESTER"
        ? [
            { href: "/requester", label: "작업" },
            { href: "/calendar", label: "캘린더" },
          ]
        : session?.user.role === "VENDOR"
          ? [{ href: "/vendor", label: "작업" }]
          : [];

  return (
    <nav className="app-nav">
      {!session && (
        <div className="app-nav-group">
          <Link className={`app-nav-link ${isActive("/login") ? "app-nav-link-active" : ""}`} href="/login">
            로그인
          </Link>
          <Link className={`app-nav-link ${isActive("/signup") ? "app-nav-link-active" : ""}`} href="/signup">
            회원가입
          </Link>
        </div>
      )}

      {session && (
        <>
          <div className="app-user-card">
            <span className="app-nav-meta-role">{roleLabel(session.user.role)}</span>
            <span className="app-nav-meta-email">{session.user.email}</span>
          </div>
          <div className="app-nav-group">
            {roleMenus.map((menu) => (
              <Link
                key={menu.href}
                className={`app-nav-link ${isActive(menu.href) ? "app-nav-link-active" : ""}`}
                href={menu.href}
              >
                {menu.label}
              </Link>
            ))}
          </div>
          <button type="button" className="app-nav-button" onClick={onLogout}>
            로그아웃
          </button>
        </>
      )}
    </nav>
  );
}
