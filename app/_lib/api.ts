// Small fetch helpers used by client components.
export async function api<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const apiGet = <T = unknown>(url: string) => api<T>(url);
export const apiPost = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T = unknown>(url: string) =>
  api<T>(url, { method: "DELETE" });
