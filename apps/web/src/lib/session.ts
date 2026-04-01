export type UserRole = "ADMIN" | "REQUESTER" | "VENDOR";

export interface SessionUser {
  sub: string;
  email: string;
  role: UserRole;
  vendorId: string | null;
}

export interface SessionData {
  accessToken: string;
  user: SessionUser;
}

const STORAGE_KEY = "vlink_session";

export function getSession(): SessionData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed.accessToken || !parsed.user?.role) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(session: SessionData) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getRoleHome(role: UserRole) {
  if (role === "ADMIN") {
    return "/admin/requests";
  }
  if (role === "REQUESTER") {
    return "/requester";
  }
  return "/vendor";
}

