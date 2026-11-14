// Client side of email + password accounts. The session lives in an HttpOnly cookie,
// so the browser sends it automatically; nothing is stored in localStorage.

export interface User {
  id: string;
  email: string;
  createdAt: number;
}

/** Fired when any API call comes back 401, so the shell can show the sign-in screen again. */
export const SIGNED_OUT_EVENT = "soilsense:signed-out";
export function notifySignedOut() {
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

/** fetch that reports an expired session. Use for every /api call. */
export const authFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status === 401) notifySignedOut();
  return res;
};

async function post(path: string, body?: unknown): Promise<{ user?: User }> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function getMe(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
  if (!res.ok || !data.user) throw new Error(data.error ?? `Couldn't check your session (${res.status}).`);
  return data.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  return (await post("login", { email, password })).user!;
}

export async function signUp(email: string, password: string): Promise<User> {
  return (await post("signup", { email, password })).user!;
}

export async function signOut(): Promise<void> {
  await post("logout").catch(() => {});
}
