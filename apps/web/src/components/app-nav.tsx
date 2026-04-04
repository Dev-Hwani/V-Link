"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { clearSession, getSession, getRoleHome, type SessionData } from "../lib/session";

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

  return (
    <nav className="app-nav">
      {!session && (
        <>
          <a href="/login">Login</a>
          <a href="/signup">Signup</a>
        </>
      )}

      {session?.user.role === "ADMIN" && (
        <>
          <a href="/admin/requests">Admin</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/calendar">Calendar</a>
        </>
      )}

      {session?.user.role === "REQUESTER" && (
        <>
          <a href="/requester">Requester</a>
          <a href="/calendar">Calendar</a>
        </>
      )}

      {session?.user.role === "VENDOR" && (
        <>
          <a href="/vendor">Vendor</a>
        </>
      )}

      {session && (
        <>
          <a href={getRoleHome(session.user.role)}>Home</a>
          <button type="button" className="app-nav-button" onClick={onLogout}>
            Logout
          </button>
        </>
      )}
    </nav>
  );
}
