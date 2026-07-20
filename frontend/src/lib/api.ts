const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

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

export const conversations = {
  create: (opts?: { model?: string; system_prompt?: string; title?: string }) =>
    apiFetch("/me/conversations", { method: "POST", body: JSON.stringify(opts || {}) }),
  list: (archived: boolean = false, limit: number = 50) =>
    apiFetch(`/me/conversations?archived=${archived}&limit=${limit}`),
  get: (id: string) => apiFetch(`/me/conversations/${id}`),
  update: (id: string, data: { title?: string; system_prompt?: string; is_archived?: boolean }) =>
    apiFetch(`/me/conversations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch(`/me/conversations/${id}`, { method: "DELETE" }),
  messages: (id: string, limit: number = 50, before?: string) =>
    apiFetch(`/me/conversations/${id}/messages?limit=${limit}${before ? `&before=${before}` : ""}`),
};

export function chatStream(body: { conversation_id: string; content: string; display_content?: string; model?: string; temperature?: number; max_tokens?: number }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return fetch(`${API_BASE}/me/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
}

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

export const userSettings = {
  get: () => apiFetch("/me/settings"),
  update: (data: { display_name?: string; default_model?: string; default_temperature?: number; default_system_prompt?: string }) =>
    apiFetch("/me/settings", { method: "PATCH", body: JSON.stringify(data) }),
};

export const providers = {
  templates: () => apiFetch("/me/providers/templates"),
  list: () => apiFetch("/me/providers"),
  add: (data: { provider: string; api_key: string; base_url?: string; name?: string }) =>
    apiFetch("/me/providers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { api_key?: string; base_url?: string; name?: string; is_enabled?: boolean }) =>
    apiFetch(`/me/providers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/me/providers/${id}`, { method: "DELETE" }),
  refresh: (id: string) => apiFetch(`/me/providers/${id}/refresh`, { method: "POST" }),
  allModels: () => apiFetch("/me/models/all"),
};

export const skills = {
  list: () => apiFetch("/me/skills"),
  create: (data: { name: string; description: string; content: string; category?: string }) =>
    apiFetch("/me/skills", { method: "POST", body: JSON.stringify(data) }),
  get: (id: string) => apiFetch(`/me/skills/${id}`),
  update: (id: string, data: { name?: string; description?: string; content?: string; category?: string }) =>
    apiFetch(`/me/skills/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/me/skills/${id}`, { method: "DELETE" }),
};

export const search = {
  web: (query: string, num_results: number = 10) =>
    apiFetch("/me/search", { method: "POST", body: JSON.stringify({ query, num_results }) }),
  fetch: (url: string) =>
    apiFetch("/me/fetch", { method: "POST", body: JSON.stringify({ url }) }),
};

export const research = {
  start: (query: string, conversation_id?: string) =>
    apiFetch("/me/research", { method: "POST", body: JSON.stringify({ query, conversation_id }) }),
  list: () => apiFetch("/me/research"),
  get: (id: string) => apiFetch(`/me/research/${id}`),
  cancel: (id: string) => apiFetch(`/me/research/${id}/cancel`, { method: "POST" }),
  stream: (id: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return fetch(`${API_BASE}/me/research/${id}/stream`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  },
};
