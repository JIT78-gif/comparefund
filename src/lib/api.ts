const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setToken(token: string) {
  localStorage.setItem("auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message.includes("Failed to fetch")
        ? `Cannot connect to local API at ${API_URL}. Start the backend with \`cd server && npm run dev\`.`
        : message
    );
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: { id: string; email: string } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function register(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: { id: string; email: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe() {
  return apiFetch<{ id: string; email: string; roles: string[] }>("/auth/me");
}

export async function logout() {
  clearToken();
}
