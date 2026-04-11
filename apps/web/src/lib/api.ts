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

export async function apiJson<T>(
  path: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

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
