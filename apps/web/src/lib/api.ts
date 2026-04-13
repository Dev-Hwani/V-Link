import { clearSession, createCookieSession, getSession, setSession, COOKIE_AUTH_SENTINEL } from "./session";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  status: number;
  rawBody: string;
  payload: unknown;

  constructor(status: number, message: string, rawBody: string, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.rawBody = rawBody;
    this.payload = payload;
  }
}

let refreshPromise: Promise<string | null> | null = null;

function resolveErrorMessage(status: number, rawBody: string, payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const nestedMessage = (payload as { message?: unknown }).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      if (status === 401 && nestedMessage.toLowerCase() === "unauthorized") {
        return "세션이 만료되었습니다. 다시 로그인해 주세요.";
      }
      return nestedMessage;
    }
    if (Array.isArray(nestedMessage) && nestedMessage.length > 0) {
      return nestedMessage.map((item) => String(item)).join(", ");
    }
  }

  if (status === 401) {
    return "세션이 만료되었습니다. 다시 로그인해 주세요.";
  }

  if (rawBody.trim()) {
    return rawBody;
  }

  return `HTTP ${status}`;
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") {
    return "";
  }

  const prefix = `${name}=`;
  const pairs = document.cookie.split(";");
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }

  return "";
}

function isUnsafeMethod(method: string) {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

function resolveCurrentAccessToken(fallbackToken: string) {
  if (typeof window === "undefined") {
    return fallbackToken;
  }

  const session = getSession();
  return session?.accessToken ?? fallbackToken;
}

function buildRequestHeaders(
  accessToken: string,
  method: string,
  headers?: Record<string, string>,
): Record<string, string> {
  const nextHeaders: Record<string, string> = {
    ...(headers ?? {}),
  };

  if (accessToken && accessToken !== COOKIE_AUTH_SENTINEL) {
    nextHeaders.Authorization = `Bearer ${accessToken}`;
  }

  if (typeof window !== "undefined" && isUnsafeMethod(method)) {
    const csrfToken = getCookieValue("csrf_token");
    if (csrfToken && !nextHeaders["x-csrf-token"]) {
      nextHeaders["x-csrf-token"] = csrfToken;
    }
  }

  return nextHeaders;
}

async function requestWithToken(
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
) {
  const method = init?.method ?? "GET";
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: buildRequestHeaders(accessToken, method, init?.headers),
    credentials: "include",
    cache: "no-store",
  });
}

async function refreshAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const headers = buildRequestHeaders(COOKIE_AUTH_SENTINEL, "POST", {
        "Content-Type": "application/json",
      });

      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers,
        body: "{}",
        credentials: "include",
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const payload = (await response.json()) as { user?: { sub: string; email: string; role: "ADMIN" | "REQUESTER" | "VENDOR"; vendorId: string | null } };
      if (!payload.user) {
        clearSession();
        return null;
      }

      setSession(createCookieSession({ user: payload.user }));
      return COOKIE_AUTH_SENTINEL;
    } catch {
      clearSession();
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
) {
  const firstToken = resolveCurrentAccessToken(accessToken);
  const firstResponse = await requestWithToken(path, firstToken, init);
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    return firstResponse;
  }

  return requestWithToken(path, refreshedToken, init);
}

export async function apiJson<T>(
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<T> {
  const response = await apiFetch(path, accessToken, init);

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      payload = null;
    }

    const message = resolveErrorMessage(response.status, text, payload);
    throw new ApiRequestError(response.status, message, text, payload);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
