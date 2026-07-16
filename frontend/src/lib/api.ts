const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const auth = {
  signup: (email: string, password: string) =>
    apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail);
    }
    return res.json();
  },
  me: () => apiFetch("/auth/me"),
};

export const keys = {
  list: () => apiFetch("/me/keys"),
  create: (name: string, opts?: { models_allowed?: string[]; stt_engine?: string; stt_language?: string; stt_target_language?: string | null }) =>
    apiFetch("/me/keys", {
      method: "POST",
      body: JSON.stringify({ name, ...opts }),
    }),
  revoke: (id: string) =>
    apiFetch(`/me/keys/${id}`, { method: "DELETE" }),
};

export const models = {
  list: () => apiFetch("/v1/models"),
};

export const chat = {
  completions: (body: object) =>
    apiFetch("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const usage = {
  stats: (days: number = 30) => apiFetch(`/me/usage?days=${days}`),
  recent: (limit: number = 10) => apiFetch(`/me/recent?limit=${limit}`),
  status: () => apiFetch("/me/status"),
};

export const translate = {
  text: (text: string, target_language: string = "en") =>
    apiFetch("/me/translate", {
      method: "POST",
      body: JSON.stringify({ text, target_language }),
    }),
};
