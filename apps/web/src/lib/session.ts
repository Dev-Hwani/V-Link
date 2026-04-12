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
export const SESSION_UPDATED_EVENT = "vlink-session-updated";
export const COOKIE_AUTH_SENTINEL = "__cookie_auth__";

export interface SessionPayload {
  user: SessionUser;
}

export function createCookieSession(payload: SessionPayload): SessionData {
  return {
    accessToken: COOKIE_AUTH_SENTINEL,
    user: payload.user,
  };
}

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
    if (!parsed.user?.role) {
      return null;
    }
    if (!parsed.accessToken) {
      return {
        accessToken: COOKIE_AUTH_SENTINEL,
        user: parsed.user,
      };
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
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
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
