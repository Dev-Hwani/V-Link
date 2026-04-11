"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { API_BASE, apiJson } from "../lib/api";
import { roleLabel } from "../lib/display";
import { PENDING_COUNT_UPDATED_EVENT, PENDING_COUNT_UPDATED_STORAGE_KEY } from "../lib/realtime";
import { SESSION_UPDATED_EVENT, clearSession, getSession, type SessionData } from "../lib/session";

type ThemeMode = "light" | "dark";
type MenuIconName = "workspace" | "dashboard" | "calendar" | "login" | "signup";

interface MenuItem {
  href: string;
  label: string;
  icon: MenuIconName;
}

function NavIcon({ name }: { name: MenuIconName }) {
  if (name === "workspace") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
        <path d="M4 10h16M10 4v16" />
      </svg>
    );
  }

  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 12a7.5 7.5 0 1 1 15 0v7.5H4.5z" />
        <path d="M12 12 16.2 8.8" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h8a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 16 20H8a2.5 2.5 0 0 1-2.5-2.5z" />
        <path d="M8.5 3v3M15.5 3v3M5.5 9h13" />
      </svg>
    );
  }

  if (name === "signup") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 14.5A4.5 4.5 0 1 0 12 5.5a4.5 4.5 0 0 0 0 9Z" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0M19 5.5v5M16.5 8h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 13.5A4.5 4.5 0 1 0 12 4.5a4.5 4.5 0 0 0 0 9Z" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionData | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const syncSession = () => setSession(getSession());
    const syncPending = () => {
      const current = getSession();
      if (!current || current.user.role !== "ADMIN") {
        setPendingCount(0);
        return;
      }
      void fetchPendingCount(current.accessToken).then((count) => setPendingCount(count));
    };
    const onStorage = (event: StorageEvent) => {
      syncSession();
      if (event.key === PENDING_COUNT_UPDATED_STORAGE_KEY) {
        syncPending();
      }
    };

    syncSession();

    const currentTheme = document.documentElement.dataset.theme;
    setTheme(currentTheme === "dark" ? "dark" : "light");

    window.addEventListener("storage", onStorage);
    window.addEventListener(PENDING_COUNT_UPDATED_EVENT, syncPending);
    window.addEventListener(SESSION_UPDATED_EVENT, syncSession);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PENDING_COUNT_UPDATED_EVENT, syncPending);
      window.removeEventListener(SESSION_UPDATED_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    const current = getSession();
    setSession(current);
    if (!current || current.user.role !== "ADMIN") {
      setPendingCount(0);
      return;
    }
    void fetchPendingCount(current.accessToken).then((count) => setPendingCount(count));
  }, [pathname]);

  useEffect(() => {
    if (!session || session.user.role !== "ADMIN") {
      setPendingCount(0);
      return;
    }

    let active = true;
    const pull = async () => {
      const count = await fetchPendingCount(session.accessToken);
      if (active) {
        setPendingCount(count);
      }
    };

    void pull();
    const timer = window.setInterval(() => {
      void pull();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session?.accessToken, session?.user.role]);

  async function onLogout() {
    const current = getSession();
    if (current?.refreshToken) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refreshToken: current.refreshToken,
          }),
        });
      } catch {
        // ignore logout request failures and clear local session anyway
      }
    }

    clearSession();
    setSession(null);
    setPendingCount(0);
    router.push("/login");
    router.refresh();
  }

  function onToggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("vlink_theme", nextTheme);
  }

  function isActive(path: string) {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const roleMenus: MenuItem[] =
    session?.user.role === "ADMIN"
      ? [
          { href: "/admin/requests", label: "요청한 작업", icon: "workspace" },
          { href: "/dashboard", label: "대시보드", icon: "dashboard" },
          { href: "/calendar", label: "캘린더", icon: "calendar" },
        ]
      : session?.user.role === "REQUESTER"
        ? [
            { href: "/requester", label: "요청한 작업", icon: "workspace" },
            { href: "/calendar", label: "캘린더", icon: "calendar" },
          ]
        : session?.user.role === "VENDOR"
          ? [{ href: "/vendor", label: "요청한 작업", icon: "workspace" }]
          : [];

  const homePath =
    session?.user.role === "ADMIN"
      ? "/admin/requests"
      : session?.user.role === "REQUESTER"
        ? "/requester"
        : session?.user.role === "VENDOR"
          ? "/vendor"
          : "";

  return (
    <nav className="app-nav">
      {!session && (
        <div className="app-nav-group">
          <Link className={`app-nav-link ${isActive("/login") ? "app-nav-link-active" : ""}`} href="/login">
            <span className="app-nav-icon">
              <NavIcon name="login" />
            </span>
            <span>로그인</span>
          </Link>
          <Link className={`app-nav-link ${isActive("/signup") ? "app-nav-link-active" : ""}`} href="/signup">
            <span className="app-nav-icon">
              <NavIcon name="signup" />
            </span>
            <span>회원가입</span>
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
                <span className="app-nav-icon">
                  <NavIcon name={menu.icon} />
                </span>
                <span className="app-nav-label">
                  {menu.label}
                  {session.user.role === "ADMIN" && menu.href === homePath && pendingCount > 0 && (
                    <span className="app-nav-badge">{pendingCount > 99 ? "99+" : pendingCount}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="app-nav-spacer" />

      <button type="button" className="app-theme-button" onClick={onToggleTheme}>
        {theme === "dark" ? "라이트 모드" : "다크 모드"}
      </button>

      {session && (
        <button type="button" className="app-nav-button" onClick={onLogout}>
          로그아웃
        </button>
      )}
    </nav>
  );
}

async function fetchPendingCount(accessToken: string) {
  try {
    const data = await apiJson<{ count?: number }>("/requests/admin/pending-count", accessToken, {
      method: "GET",
    });
    return typeof data.count === "number" ? data.count : 0;
  } catch {
    return 0;
  }
}
