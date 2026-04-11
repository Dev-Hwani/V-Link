import { clearSession, getSession, setSession, type SessionData } from "./session";

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

function resolveCurrentAccessToken(fallbackToken: string) {
  if (typeof window === "undefined") {
    return fallbackToken;
  }

  const session = getSession();
  return session?.accessToken ?? fallbackToken;
}

async function requestWithToken(path: string, accessToken: string, init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> }) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
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
    const current = getSession();
    if (!current?.refreshToken) {
      clearSession();
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const nextSession = (await response.json()) as SessionData;
      if (!nextSession.accessToken || !nextSession.refreshToken) {
        clearSession();
        return null;
      }

      setSession(nextSession);
      return nextSession.accessToken;
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
