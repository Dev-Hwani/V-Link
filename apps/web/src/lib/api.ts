export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

